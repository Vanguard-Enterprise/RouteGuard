package api

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/deviceauth"
)

const (
	rfidEnrollTTL    = 10 * time.Minute
	rfidEnrollPrefix = "rfid_enroll:"
)

type rfidEnrollSession struct {
	OrgID     string  `json:"org_id"`
	RFIDTagID *string `json:"rfid_tag_id"`
}

// generateEnrollCode returns a 6-character uppercase alphanumeric code.
func generateEnrollCode() (string, error) {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O/1/I to avoid confusion
	b := make([]byte, 6)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			return "", err
		}
		b[i] = chars[n.Int64()]
	}
	return string(b), nil
}

func rfidEnrollKey(orgID, code string) string {
	return fmt.Sprintf("%s%s:%s", rfidEnrollPrefix, orgID, strings.ToUpper(code))
}

// CreateRFIDEnrollSession handles POST /dashboard/rfid-enroll.
// Creates a short-lived enrollment session and returns a code for the device to use.
func (h *Handler) CreateRFIDEnrollSession(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	code, err := generateEnrollCode()
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	val := rfidEnrollSession{OrgID: session.OrgID}
	if err := h.cache.Set(r.Context(), rfidEnrollKey(session.OrgID, code), val, rfidEnrollTTL); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"code":       code,
		"expires_at": time.Now().Add(rfidEnrollTTL).UTC().Format(time.RFC3339),
	})
}

// PollRFIDEnrollSession handles GET /dashboard/rfid-enroll/{code}.
// Returns whether the scan has been received, and the tag ID if so.
func (h *Handler) PollRFIDEnrollSession(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	code := chi.URLParam(r, "code")
	var val rfidEnrollSession
	err := h.cache.Get(r.Context(), rfidEnrollKey(session.OrgID, code), &val)
	if err != nil {
		if h.cache.IsNotFound(err) {
			Error(w, http.StatusNotFound, "enrollment session not found or expired")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"scanned":    val.RFIDTagID != nil,
		"rfid_tag_id": val.RFIDTagID,
	})
}

// CancelRFIDEnrollSession handles DELETE /dashboard/rfid-enroll/{code}.
func (h *Handler) CancelRFIDEnrollSession(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	code := chi.URLParam(r, "code")
	_ = h.cache.Del(r.Context(), rfidEnrollKey(session.OrgID, code))
	w.WriteHeader(http.StatusNoContent)
}

type deviceRFIDEnrollRequest struct {
	Code      string `json:"code"`
	RFIDTagID string `json:"rfid_tag_id"`
}

// DeviceSubmitRFIDEnroll handles POST /api/v1/device/rfid-enroll.
// Called by the kiosk when the driver scans a card during an enrollment session.
func (h *Handler) DeviceSubmitRFIDEnroll(w http.ResponseWriter, r *http.Request) {
	device := deviceauth.DeviceFromContext(r.Context())
	if device == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req deviceRFIDEnrollRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Code == "" || req.RFIDTagID == "" {
		Error(w, http.StatusBadRequest, "code and rfid_tag_id are required")
		return
	}

	if device.OrgID == nil {
		Error(w, http.StatusForbidden, "device not claimed")
		return
	}

	key := rfidEnrollKey(*device.OrgID, req.Code)
	var val rfidEnrollSession
	if err := h.cache.Get(r.Context(), key, &val); err != nil {
		if h.cache.IsNotFound(err) {
			Error(w, http.StatusNotFound, "enrollment session not found or expired")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Verify the session belongs to the same org as the device
	if val.OrgID != *device.OrgID {
		Error(w, http.StatusForbidden, "forbidden")
		return
	}

	val.RFIDTagID = &req.RFIDTagID
	if err := h.cache.Set(r.Context(), key, val, rfidEnrollTTL); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, map[string]any{"ok": true})
}
