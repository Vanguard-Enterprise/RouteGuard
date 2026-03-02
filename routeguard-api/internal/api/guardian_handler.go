package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/repository"
)

type createGuardianRequest struct {
	FirstName    string  `json:"first_name"`
	LastName     string  `json:"last_name"`
	Phone        string  `json:"phone"`        // plaintext; encrypted before storage
	AltPhone     *string `json:"alt_phone"`    // plaintext; encrypted before storage
	Email        *string `json:"email"`
	SMSOptIn     bool    `json:"sms_opt_in"`
	Language     string  `json:"language"`
	Relationship string  `json:"relationship"`
	IsPrimary    bool    `json:"is_primary"`
}

// decryptGuardian decrypts the encrypted phone fields on a GuardianWithLink in-place.
func (h *Handler) decryptGuardian(g *repository.GuardianWithLink) error {
	if g.Phone != "" {
		plain, err := h.decryptOptional(&g.Phone)
		if err != nil {
			return err
		}
		if plain != nil {
			g.Phone = *plain
		}
	}
	dec, err := h.decryptOptional(g.AltPhone)
	if err != nil {
		return err
	}
	g.AltPhone = dec
	return nil
}

// ListStudentGuardians handles GET /dashboard/students/{studentId}/guardians
func (h *Handler) ListStudentGuardians(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID
	studentID := chi.URLParam(r, "studentId")

	repo := repository.NewGuardianRepo(h.pool)
	guardians, err := repo.ListByStudent(r.Context(), studentID, orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	for i := range guardians {
		if err := h.decryptGuardian(&guardians[i]); err != nil {
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
	}

	JSON(w, http.StatusOK, guardians)
}

// CreateStudentGuardian handles POST /dashboard/students/{studentId}/guardians
func (h *Handler) CreateStudentGuardian(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID
	studentID := chi.URLParam(r, "studentId")

	var req createGuardianRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.FirstName == "" || req.LastName == "" || req.Phone == "" {
		Error(w, http.StatusBadRequest, "first_name, last_name, and phone are required")
		return
	}
	if req.Language == "" {
		req.Language = "en"
	}
	if req.Relationship == "" {
		req.Relationship = "parent"
	}

	// Encrypt required phone field directly.
	encPhone, err := crypto.Encrypt(h.cfg.DataEncryptionKey, req.Phone)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Encrypt optional alt_phone.
	encAltPhone, err := h.encryptOptional(req.AltPhone)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	repo := repository.NewGuardianRepo(h.pool)
	gwl, err := repo.CreateWithLink(
		r.Context(),
		orgID, studentID,
		req.FirstName, req.LastName,
		encPhone, encAltPhone,
		req.Email,
		req.SMSOptIn,
		req.Language, req.Relationship, req.IsPrimary,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "student not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := h.decryptGuardian(gwl); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusCreated, gwl)
}
