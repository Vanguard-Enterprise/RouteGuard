package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/repository"
)

const (
	provisionTokenPrefix = "provision_token:"
	provisionTokenTTL    = 72 * time.Hour
)

// ListAdminDevices handles GET /admin/devices?org_id=...
// Staff can pass org_id to filter; returns all devices if org_id is omitted.
func (h *Handler) ListAdminDevices(w http.ResponseWriter, r *http.Request) {
	orgID := r.URL.Query().Get("org_id")
	repo := repository.NewDeviceRepo(h.pool)
	devices, err := repo.ListAll(r.Context(), orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, devices)
}

// createAdminDeviceRequest is the request body for POST /admin/devices.
type createAdminDeviceRequest struct {
	OrgID  string `json:"org_id"`
	Serial string `json:"serial"`
}

// createAdminDeviceResponse is the response for a newly created device with provisioning token.
type createAdminDeviceResponse struct {
	DeviceID          string    `json:"device_id"`
	Serial            string    `json:"serial"`
	ProvisioningToken string    `json:"provisioning_token"`
	ExpiresAt         time.Time `json:"expires_at"`
}

// CreateAdminDevice handles POST /admin/devices
// Inserts a device with status=unprovisioned, generates a 32-byte hex provisioning token,
// stores it in Redis with 72h TTL, and returns the token to the caller.
func (h *Handler) CreateAdminDevice(w http.ResponseWriter, r *http.Request) {
	var req createAdminDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.OrgID == "" {
		Error(w, http.StatusBadRequest, "org_id is required")
		return
	}
	repo := repository.NewDeviceRepo(h.pool)
	device, err := repo.CreateUnprovisioned(r.Context(), req.OrgID, req.Serial)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Generate a cryptographically random 32-byte provisioning token.
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	token := hex.EncodeToString(tokenBytes)

	// Store token in Redis with TTL.
	payload := provisionTokenPayload{
		OrgID:  req.OrgID,
		Serial: req.Serial,
	}
	if err := h.cache.Set(r.Context(), provisionTokenPrefix+token, payload, provisionTokenTTL); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusCreated, createAdminDeviceResponse{
		DeviceID:          device.ID,
		Serial:            device.Serial,
		ProvisioningToken: token,
		ExpiresAt:         time.Now().Add(provisionTokenTTL),
	})
}

// updateAdminDeviceRequest is the request body for PATCH /admin/devices/{id}.
type updateAdminDeviceRequest struct {
	Serial    *string `json:"serial"`
	VehicleID *string `json:"vehicle_id"`
	SeatCount *int    `json:"seat_count"`
}

// UpdateAdminDevice handles PATCH /admin/devices/{id}
func (h *Handler) UpdateAdminDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateAdminDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	repo := repository.NewDeviceRepo(h.pool)
	device, err := repo.Update(r.Context(), id, req.Serial, req.VehicleID, req.SeatCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "device not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, device)
}

// DeleteAdminDevice handles DELETE /admin/devices/{id}
// Revokes the device (sets status=revoked) and evicts it from cache.
func (h *Handler) DeleteAdminDevice(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	repo := repository.NewDeviceRepo(h.pool)
	err := repo.Revoke(r.Context(), id, h.cache)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "device not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}
