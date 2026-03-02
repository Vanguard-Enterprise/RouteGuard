package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
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
		g := &guardians[i]

		// Decrypt Phone (required, non-pointer string).
		if g.Phone != "" {
			plain, err := h.decryptOptional(&g.Phone)
			if err != nil {
				Error(w, http.StatusInternalServerError, "internal server error")
				return
			}
			if plain != nil {
				g.Phone = *plain
			}
		}

		// Decrypt AltPhone (optional pointer).
		decAltPhone, err := h.decryptOptional(g.AltPhone)
		if err != nil {
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		g.AltPhone = decAltPhone
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
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Decrypt phone fields before returning.
	if gwl.Phone != "" {
		plain, err := h.decryptOptional(&gwl.Phone)
		if err != nil {
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		if plain != nil {
			gwl.Phone = *plain
		}
	}

	decAltPhone, err := h.decryptOptional(gwl.AltPhone)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	gwl.AltPhone = decAltPhone

	JSON(w, http.StatusCreated, gwl)
}
