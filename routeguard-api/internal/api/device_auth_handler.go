package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/deviceauth"
	"github.com/routeguard/api/internal/repository"
)

const (
	tripSessionKeyPrefix = "trip_session:"
	tripSessionTTL       = 12 * time.Hour
)

// provisionTokenPayload is the JSON value stored in Redis under "provision_token:<token>".
// It is written by the admin panel and consumed atomically (GETDEL) during provisioning.
type provisionTokenPayload struct {
	OrgID  string `json:"org_id"`
	Serial string `json:"serial"`
}

// TripSessionPayload is stored in Redis under "trip_session:<token>" after a driver
// authenticates via PIN or RFID.
type TripSessionPayload struct {
	DriverID string `json:"driver_id"`
	DeviceID string `json:"device_id"`
	OrgID    string `json:"org_id"`
}

// provisionRequest is the request body for POST /api/v1/devices/provision.
type provisionRequest struct {
	ProvisioningToken string `json:"provisioning_token"`
}

// pinAuthRequest is the request body for POST /api/v1/auth/pin.
type pinAuthRequest struct {
	DriverID string `json:"driver_id"`
	PIN      string `json:"pin"`
}

// rfidAuthRequest is the request body for POST /api/v1/auth/rfid.
type rfidAuthRequest struct {
	RFIDBadgeID string `json:"rfid_badge_id"`
}

// generateDeviceToken creates a cryptographically random 32-byte token and
// returns it as a 64-character lowercase hex string.
func generateDeviceToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// hashRFID computes the SHA-256 hash of a plaintext RFID badge ID and returns
// it as a lowercase hex string. This matches the rfid_badge_id_hash column.
func hashRFID(id string) string {
	h := sha256.Sum256([]byte(id))
	return hex.EncodeToString(h[:])
}

// generateTripToken creates a cryptographically random 32-byte trip session token.
func generateTripToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// ProvisionDevice handles POST /api/v1/devices/provision.
// The provisioning token is a one-time-use value stored in Redis by the admin panel.
// On success it returns the device ID and the raw device token (shown exactly once).
func (h *Handler) ProvisionDevice(w http.ResponseWriter, r *http.Request) {
	var req provisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ProvisioningToken == "" {
		Error(w, http.StatusBadRequest, "provisioning_token is required")
		return
	}

	// Atomic read-and-delete — ensures the token is single-use.
	var payload provisionTokenPayload
	if err := h.cache.GetDel(r.Context(), "provision_token:"+req.ProvisioningToken, &payload); err != nil {
		if h.cache.IsNotFound(err) {
			Error(w, http.StatusBadRequest, "invalid or expired provisioning token")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	// Generate a 32-byte (64-hex-char) raw device token.
	rawToken, err := generateDeviceToken()
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Hash the raw token with bcrypt cost 12 for storage.
	tokenHash, err := crypto.HashPassword(rawToken)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	deviceRepo := repository.NewDeviceRepo(h.pool)
	device, err := deviceRepo.Create(r.Context(), payload.OrgID, payload.Serial, tokenHash)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusCreated, map[string]string{
		"device_id":    device.ID,
		"device_token": rawToken,
	})
}

// DeviceHeartbeat handles POST /api/v1/devices/heartbeat.
// Requires device auth middleware. Updates the device's last-seen timestamp in Redis.
func (h *Handler) DeviceHeartbeat(w http.ResponseWriter, r *http.Request) {
	device := deviceauth.DeviceFromContext(r.Context())
	if device == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	deviceRepo := repository.NewDeviceRepo(h.pool)
	if err := deviceRepo.UpdateLastSeen(r.Context(), device.ID, h.cache); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	NoContent(w)
}

// DriverPINAuth handles POST /api/v1/auth/pin.
// Requires device auth middleware. Verifies the driver's PIN and issues a trip session token.
func (h *Handler) DriverPINAuth(w http.ResponseWriter, r *http.Request) {
	device := deviceauth.DeviceFromContext(r.Context())
	if device == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req pinAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DriverID == "" || req.PIN == "" {
		Error(w, http.StatusBadRequest, "driver_id and pin are required")
		return
	}

	driverRepo := repository.NewDriverRepo(h.pool)
	driver, err := driverRepo.FindByIDAndOrg(r.Context(), req.DriverID, device.OrgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusUnauthorized, "invalid credentials")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	if driver.PinHash == nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := crypto.CheckPIN(req.PIN, *driver.PinHash); err != nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	tripToken, err := issueTripSession(r, h.cache, driver.ID, device.ID, device.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, map[string]string{
		"trip_token": tripToken,
	})
}

// DriverRFIDAuth handles POST /api/v1/auth/rfid.
// Requires device auth middleware. Verifies the driver RFID badge and issues a trip session token.
func (h *Handler) DriverRFIDAuth(w http.ResponseWriter, r *http.Request) {
	device := deviceauth.DeviceFromContext(r.Context())
	if device == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req rfidAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RFIDBadgeID == "" {
		Error(w, http.StatusBadRequest, "rfid_badge_id is required")
		return
	}

	rfidHash := hashRFID(req.RFIDBadgeID)

	driverRepo := repository.NewDriverRepo(h.pool)
	driver, err := driverRepo.FindByRFIDHash(r.Context(), rfidHash, device.OrgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusUnauthorized, "invalid credentials")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	tripToken, err := issueTripSession(r, h.cache, driver.ID, device.ID, device.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, map[string]string{
		"trip_token": tripToken,
	})
}

// issueTripSession generates a random trip session token, stores the payload in Redis
// with a 12-hour TTL, and returns the token string.
func issueTripSession(r *http.Request, c *cache.Cache, driverID, deviceID, orgID string) (string, error) {
	token, err := generateTripToken()
	if err != nil {
		return "", err
	}
	payload := TripSessionPayload{
		DriverID: driverID,
		DeviceID: deviceID,
		OrgID:    orgID,
	}
	if err := c.Set(r.Context(), tripSessionKeyPrefix+token, payload, tripSessionTTL); err != nil {
		return "", err
	}
	return token, nil
}
