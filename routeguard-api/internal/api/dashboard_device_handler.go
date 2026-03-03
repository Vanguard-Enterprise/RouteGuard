package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/repository"
)

type claimDeviceRequest struct {
	ClaimCode string       `json:"claim_code"`
	Vehicle   claimVehicle `json:"vehicle"`
	SeatCount *int         `json:"seat_count"`
}

type claimVehicle struct {
	Name         string  `json:"name"`
	Number       *string `json:"number"`
	LicensePlate *string `json:"license_plate"`
	Capacity     *int    `json:"capacity"`
	Year         *int    `json:"year"`
	Make         *string `json:"make"`
	Model        *string `json:"model"`
}

type claimDeviceResponse struct {
	DeviceID  string `json:"device_id"`
	VehicleID string `json:"vehicle_id"`
	Serial    string `json:"serial"`
}

// ClaimDevice handles POST /dashboard/devices/claim.
// Org session auth required. Validates a claim code, creates a vehicle record,
// and associates the device with the org. The permanent device token is
// deposited in Redis for the device to pick up via the status polling endpoint.
func (h *Handler) ClaimDevice(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req claimDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ClaimCode == "" {
		Error(w, http.StatusBadRequest, "claim_code is required")
		return
	}
	if req.Vehicle.Name == "" {
		Error(w, http.StatusBadRequest, "vehicle.name is required")
		return
	}

	deviceRepo := repository.NewDeviceRepo(h.pool)
	device, err := deviceRepo.FindByClaimCode(r.Context(), req.ClaimCode)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "claim code not found or expired")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if device.Status != "unclaimed" {
		Error(w, http.StatusConflict, "device has already been claimed")
		return
	}
	// Check expiry (1 hour).
	if time.Since(device.CreatedAt) > time.Hour {
		Error(w, http.StatusGone, "claim code has expired - reboot the device to generate a new one")
		return
	}

	// Generate permanent device token.
	rawToken, err := generateDeviceToken()
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	tokenHash, err := crypto.HashPassword(rawToken)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Run in a transaction: create vehicle + claim device.
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer tx.Rollback(r.Context())

	vehicleRepo := repository.NewVehicleRepo(h.pool)
	vehicle, err := vehicleRepo.CreateTx(r.Context(), tx, session.OrgID, req.Vehicle.Name,
		req.Vehicle.Number, req.Vehicle.LicensePlate, req.Vehicle.Capacity,
		req.Vehicle.Year, req.Vehicle.Make, req.Vehicle.Model)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := deviceRepo.Claim(r.Context(), tx, device.ID, session.OrgID, vehicle.ID, tokenHash); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Deposit raw token in Redis for the device to pick up via status polling.
	claimResult := deviceClaimResult{DeviceID: device.ID, DeviceToken: rawToken}
	_ = h.cache.Set(r.Context(), "device_claim_result:"+req.ClaimCode, claimResult, deviceClaimResultTTL)

	JSON(w, http.StatusCreated, claimDeviceResponse{
		DeviceID:  device.ID,
		VehicleID: vehicle.ID,
		Serial:    device.Serial,
	})
}

// ListMyDevices handles GET /dashboard/devices.
func (h *Handler) ListMyDevices(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	repo := repository.NewDeviceRepo(h.pool)
	devices, err := repo.ListByOrg(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, devices)
}

// GetMyDevice handles GET /dashboard/devices/{id}.
func (h *Handler) GetMyDevice(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	repo := repository.NewDeviceRepo(h.pool)
	device, err := repo.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "device not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	// Ensure device belongs to this org.
	if device.OrgID == nil || *device.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "device not found")
		return
	}
	JSON(w, http.StatusOK, device)
}

// RevokeMyDevice handles DELETE /dashboard/devices/{id}.
// Sets device status to revoked and evicts from cache.
func (h *Handler) RevokeMyDevice(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")

	// Verify ownership before revoking.
	repo := repository.NewDeviceRepo(h.pool)
	device, err := repo.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "device not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if device.OrgID == nil || *device.OrgID != session.OrgID {
		Error(w, http.StatusNotFound, "device not found")
		return
	}

	if err := repo.Revoke(r.Context(), id, h.cache); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}
