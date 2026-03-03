package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/repository"
)

const deviceClaimResultTTL = 10 * time.Minute

type checkinRequest struct {
	Serial string `json:"serial"`
}

type checkinResponse struct {
	ClaimCode string `json:"claim_code"`
}

// DeviceCheckin handles POST /api/v1/devices/checkin.
// Unauthenticated. Called by a device on first boot.
// Creates an unclaimed device record and returns the claim code to display on screen.
// Idempotent: if the serial already has an unclaimed record, returns its existing code.
func (h *Handler) DeviceCheckin(w http.ResponseWriter, r *http.Request) {
	var req checkinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Serial == "" {
		Error(w, http.StatusBadRequest, "serial is required")
		return
	}

	repo := repository.NewDeviceRepo(h.pool)
	device, err := repo.CreateUnclaimed(r.Context(), req.Serial)
	if err != nil {
		// 23505 = unique_violation: serial already exists and is not unclaimed
		if isUniqueViolation(err) {
			Error(w, http.StatusConflict, "device with this serial is already active or revoked")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusCreated, checkinResponse{
		ClaimCode: *device.ClaimCode,
	})
}

type checkinStatusResponse struct {
	Status      string  `json:"status"`
	DeviceID    *string `json:"device_id,omitempty"`
	DeviceToken *string `json:"device_token,omitempty"`
}

// DeviceCheckinStatus handles GET /api/v1/devices/checkin/status?claim_code=XXXXXXXX.
// Unauthenticated. Polled by the device every 10 seconds while showing the claim code screen.
// Returns pending, expired, or claimed+token.
func (h *Handler) DeviceCheckinStatus(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("claim_code")
	if code == "" {
		Error(w, http.StatusBadRequest, "claim_code is required")
		return
	}

	// Check Redis for a claimed token waiting for the device.
	claimKey := "device_claim_result:" + code
	var claimResult deviceClaimResult
	if err := h.cache.Get(r.Context(), claimKey, &claimResult); err == nil {
		// Token is ready - delete it (single use) and return to device.
		_ = h.cache.Del(r.Context(), claimKey)
		JSON(w, http.StatusOK, checkinStatusResponse{
			Status:      "claimed",
			DeviceID:    &claimResult.DeviceID,
			DeviceToken: &claimResult.DeviceToken,
		})
		return
	}

	// No token in Redis yet - check DB for pending/expired.
	repo := repository.NewDeviceRepo(h.pool)
	device, err := repo.FindByClaimCode(r.Context(), code)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Claim code doesn't exist - either expired (deleted) or never existed.
			JSON(w, http.StatusOK, checkinStatusResponse{Status: "expired"})
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	_ = device
	JSON(w, http.StatusOK, checkinStatusResponse{Status: "pending"})
}

// deviceClaimResult is stored in Redis under "device_claim_result:<claim_code>"
// after the org admin claims the device. TTL: 10 minutes.
type deviceClaimResult struct {
	DeviceID    string `json:"device_id"`
	DeviceToken string `json:"device_token"`
}
