package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/notifications"
	"github.com/routeguard/api/internal/repository"
	"github.com/routeguard/api/internal/tripauth"
)

type recordScanRequest struct {
	RFIDTagID string  `json:"rfid_tag_id"` // plaintext tag ID from scanner
	ScanType  string  `json:"scan_type"`   // "board" or "exit"
	StopID    *string `json:"stop_id"`
}

type recordScanResponse struct {
	Authorized bool              `json:"authorized"`
	Student    *domain.Student   `json:"student,omitempty"`
	ScanEvent  *domain.ScanEvent `json:"scan_event"`
}

// RecordScan handles POST /api/v1/trips/{id}/scan.
// Requires trip session auth middleware.
func (h *Handler) RecordScan(w http.ResponseWriter, r *http.Request) {
	session := tripauth.TripSessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	tripID := chi.URLParam(r, "id")

	var req recordScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RFIDTagID == "" {
		Error(w, http.StatusBadRequest, "rfid_tag_id is required")
		return
	}
	if req.ScanType != "board" && req.ScanType != "exit" {
		Error(w, http.StatusBadRequest, "scan_type must be board or exit")
		return
	}

	rfidHash := hashRFID(req.RFIDTagID)

	studentRepo := repository.NewStudentRepo(h.pool)
	student, err := studentRepo.FindByRFIDTagHash(r.Context(), rfidHash, session.OrgID)
	authorized := true
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			authorized = false
			student = nil
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
	}

	var studentID *string
	if student != nil {
		id := student.ID
		studentID = &id
	}

	tripDeviceRepo := repository.NewTripDeviceRepo(h.pool)
	scanEvent, err := tripDeviceRepo.InsertScanEvent(r.Context(), tripID, session.OrgID, req.RFIDTagID, req.ScanType, studentID, req.StopID, authorized)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "trip not found or not in progress")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	_ = h.cache.Publish(r.Context(), "trip:scan:"+tripID, map[string]any{
		"trip_id":    tripID,
		"scan_event": scanEvent,
		"authorized": authorized,
	})

	if !authorized {
		_ = h.cache.Publish(r.Context(), "trip:alert:"+session.OrgID, map[string]any{
			"trip_id":     tripID,
			"rfid_tag_id": req.RFIDTagID,
			"scan_type":   req.ScanType,
		})
	}

	if authorized && student != nil && h.cfg.TwilioAccountSID != "" {
		studentCopy := *student
		go func() {
			bgCtx := context.Background()
			guardianRepo := repository.NewGuardianRepo(h.pool)
			guardians, err := guardianRepo.ListByStudent(bgCtx, *studentID, session.OrgID)
			if err != nil {
				return
			}
			twilio := notifications.NewTwilioClient(h.cfg.TwilioAccountSID, h.cfg.TwilioAuthToken, h.cfg.TwilioFromNumber)
			studentFullName := fmt.Sprintf("%s %s", studentCopy.FirstName, studentCopy.LastName)
			var msgBody string
			if req.ScanType == "board" {
				msgBody = notifications.BoardMessage(studentFullName)
			} else {
				msgBody = notifications.ExitMessage(studentFullName)
			}
			for _, g := range guardians {
				if !g.SMSOptIn {
					continue
				}
				phone, err := crypto.Decrypt(h.cfg.DataEncryptionKey, g.Phone)
				if err != nil {
					continue
				}
				_, _ = twilio.Send(bgCtx, phone, msgBody)
			}
		}()
	}

	resp := recordScanResponse{
		Authorized: authorized,
		ScanEvent:  scanEvent,
	}
	if student != nil {
		resp.Student = student
	}

	JSON(w, http.StatusOK, resp)
}
