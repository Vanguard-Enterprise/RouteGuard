package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

// driverResponse is the API representation of a driver.
// pin_hash and rfid_badge_id_hash are never returned.
type driverResponse struct {
	ID            string       `json:"id"`
	OrgID         string       `json:"org_id"`
	UserID        *string      `json:"user_id"`
	FirstName     string       `json:"first_name"`
	LastName      string       `json:"last_name"`
	Phone         *string      `json:"phone"`
	LicenseNumber *string      `json:"license_number"`
	LicenseExpiry *pgtype.Date `json:"license_expiry"`
	RFIDBadgeID   *string      `json:"rfid_badge_id"`
	HasPIN        bool         `json:"has_pin"`
	Status        string       `json:"status"`
	CreatedAt     time.Time    `json:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at"`
}

type createDriverRequest struct {
	UserID        *string      `json:"user_id"`
	FirstName     string       `json:"first_name"`
	LastName      string       `json:"last_name"`
	Phone         *string      `json:"phone"`
	LicenseNumber *string      `json:"license_number"`
	LicenseExpiry *pgtype.Date `json:"license_expiry"`
	RFIDBadgeID   *string      `json:"rfid_badge_id"`
	Status        string       `json:"status"`
}

type updateDriverRequest struct {
	FirstName     *string      `json:"first_name"`
	LastName      *string      `json:"last_name"`
	Phone         *string      `json:"phone"`
	LicenseNumber *string      `json:"license_number"`
	LicenseExpiry *pgtype.Date `json:"license_expiry"`
	RFIDBadgeID   *string      `json:"rfid_badge_id"`
	Status        *string      `json:"status"`
}

type setPINRequest struct {
	PIN string `json:"pin"`
}

// toDriverResponse converts a domain.Driver to a driverResponse, decrypting
// encrypted fields and omitting sensitive fields (pin_hash, rfid_badge_id_hash).
func (h *Handler) toDriverResponse(d *domain.Driver) (*driverResponse, error) {
	licNum, err := h.decryptOptional(d.LicenseNumber)
	if err != nil {
		return nil, err
	}
	rfidID, err := h.decryptOptional(d.RFIDBadgeID)
	if err != nil {
		return nil, err
	}
	return &driverResponse{
		ID:            d.ID,
		OrgID:         d.OrgID,
		UserID:        d.UserID,
		FirstName:     d.FirstName,
		LastName:      d.LastName,
		Phone:         d.Phone,
		LicenseNumber: licNum,
		LicenseExpiry: d.LicenseExpiry,
		RFIDBadgeID:   rfidID,
		HasPIN:        d.PinHash != nil && *d.PinHash != "",
		Status:        d.Status,
		CreatedAt:     d.CreatedAt,
		UpdatedAt:     d.UpdatedAt,
	}, nil
}

// ListMyDrivers handles GET /dashboard/drivers
func (h *Handler) ListMyDrivers(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}

	repo := repository.NewDriverRepo(h.pool)
	drivers, err := repo.ListByOrg(r.Context(), session.OrgID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	responses := make([]driverResponse, 0, len(drivers))
	for i := range drivers {
		resp, err := h.toDriverResponse(&drivers[i])
		if err != nil {
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		responses = append(responses, *resp)
	}

	JSON(w, http.StatusOK, responses)
}

// CreateMyDriver handles POST /dashboard/drivers
func (h *Handler) CreateMyDriver(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req createDriverRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.FirstName == "" || req.LastName == "" {
		Error(w, http.StatusBadRequest, "first_name and last_name are required")
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}

	encLicNum, err := h.encryptOptional(req.LicenseNumber)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	encRFID, err := h.encryptOptional(req.RFIDBadgeID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	var rfidHash *string
	if req.RFIDBadgeID != nil && *req.RFIDBadgeID != "" {
		hashed := hashRFID(*req.RFIDBadgeID)
		rfidHash = &hashed
	}

	repo := repository.NewDriverRepo(h.pool)
	driver, err := repo.CreateDriver(r.Context(), session.OrgID, req.UserID, req.FirstName, req.LastName,
		req.Phone, encLicNum, req.LicenseExpiry, encRFID, rfidHash, req.Status)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	resp, err := h.toDriverResponse(driver)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusCreated, resp)
}

// GetMyDriver handles GET /dashboard/drivers/{id}
func (h *Handler) GetMyDriver(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	repo := repository.NewDriverRepo(h.pool)
	driver, err := repo.GetByOrg(r.Context(), id, session.OrgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "driver not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	resp, err := h.toDriverResponse(driver)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, resp)
}

// UpdateMyDriver handles PATCH /dashboard/drivers/{id}
func (h *Handler) UpdateMyDriver(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	var req updateDriverRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	encLicNum, err := h.encryptOptional(req.LicenseNumber)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	encRFID, err := h.encryptOptional(req.RFIDBadgeID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	var rfidHash *string
	if req.RFIDBadgeID != nil && *req.RFIDBadgeID != "" {
		hashed := hashRFID(*req.RFIDBadgeID)
		rfidHash = &hashed
	}

	repo := repository.NewDriverRepo(h.pool)
	driver, err := repo.UpdateDriver(r.Context(), id, session.OrgID,
		req.FirstName, req.LastName, req.Phone, encLicNum, req.LicenseExpiry,
		encRFID, rfidHash, req.Status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "driver not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	resp, err := h.toDriverResponse(driver)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, resp)
}

// DeleteMyDriver handles DELETE /dashboard/drivers/{id}
// Soft-deletes the driver by setting status='inactive'.
func (h *Handler) DeleteMyDriver(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	repo := repository.NewDriverRepo(h.pool)
	if err := repo.DeleteDriver(r.Context(), id, session.OrgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "driver not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	NoContent(w)
}

// SetDriverPIN handles POST /dashboard/drivers/{id}/set-pin
func (h *Handler) SetDriverPIN(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	var req setPINRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.PIN == "" {
		Error(w, http.StatusBadRequest, "pin is required")
		return
	}

	pinHash, err := crypto.HashPIN(req.PIN)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	repo := repository.NewDriverRepo(h.pool)
	if err := repo.SetPIN(r.Context(), id, session.OrgID, pinHash); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "driver not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	NoContent(w)
}
