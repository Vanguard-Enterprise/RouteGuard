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
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
	"github.com/routeguard/api/internal/tripauth"
)

const (
	tripSessionKeyPrefix = "trip_session:"
	tripSessionTTL       = 12 * time.Hour
)

// pinAuthRequest is the request body for POST /api/v1/auth/pin.
type pinAuthRequest struct {
	PIN string `json:"pin"`
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

// DeviceConfig handles GET /api/v1/device/config.
// Requires device auth middleware. Returns org-level kiosk configuration.
func (h *Handler) DeviceConfig(w http.ResponseWriter, r *http.Request) {
	device := deviceauth.DeviceFromContext(r.Context())
	if device == nil || device.OrgID == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	orgRepo := repository.NewOrgRepo(h.pool)
	org, err := orgRepo.Get(r.Context(), *device.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	settings := org.ParsedSettings()
	JSON(w, http.StatusOK, map[string]int{
		"pin_length": settings.PinLength,
	})
}

// DeviceContacts handles GET /api/v1/device/contacts.
// Requires trip session auth. Returns users with the dispatcher role
// who have a phone set, scoped to the driver's org.
func (h *Handler) DeviceContacts(w http.ResponseWriter, r *http.Request) {
	session := tripauth.TripSessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	repo := repository.NewSettingsUserRepo(h.pool)
	contacts, err := repo.ListDispatchersByOrg(r.Context(), session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, contacts)
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
// Requires device auth middleware. Looks up the driver by PIN within the org
// (no driver_id needed - iterates all PIN-enabled drivers and bcrypt-compares).
func (h *Handler) DriverPINAuth(w http.ResponseWriter, r *http.Request) {
	device := deviceauth.DeviceFromContext(r.Context())
	if device == nil || device.OrgID == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req pinAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.PIN == "" {
		Error(w, http.StatusBadRequest, "pin is required")
		return
	}

	driverRepo := repository.NewDriverRepo(h.pool)
	candidates, err := driverRepo.ListWithPINByOrg(r.Context(), *device.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	var matched *domain.Driver
	for i := range candidates {
		if err := crypto.CheckPIN(req.PIN, *candidates[i].PinHash); err == nil {
			matched = &candidates[i]
			break
		}
	}
	if matched == nil {
		Error(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	sessionToken, err := issueTripSession(r, h.cache, matched.ID, device.ID, *device.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, map[string]string{
		"session_token": sessionToken,
		"driver_id":     matched.ID,
		"driver_name":   matched.FirstName + " " + matched.LastName,
		"org_id":        matched.OrgID,
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
	driver, err := driverRepo.FindByRFIDHash(r.Context(), rfidHash, *device.OrgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusUnauthorized, "invalid credentials")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	tripToken, err := issueTripSession(r, h.cache, driver.ID, device.ID, *device.OrgID)
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
	payload := tripauth.TripSessionPayload{
		DriverID: driverID,
		DeviceID: deviceID,
		OrgID:    orgID,
	}
	if err := c.Set(r.Context(), tripSessionKeyPrefix+token, payload, tripSessionTTL); err != nil {
		return "", err
	}
	return token, nil
}
