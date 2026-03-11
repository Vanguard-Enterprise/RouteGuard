package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

func (h *Handler) PlatformGetBilling(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	billing, err := h.billing.GetOrCreateByOrg(r.Context(), orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get billing")
		return
	}
	JSON(w, http.StatusOK, billing)
}

func (h *Handler) PlatformUpdateBilling(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	var body struct {
		BillingStatus       string     `json:"billing_status"`
		PilotEndsAt         *time.Time `json:"pilot_ends_at"`
		ContractNotes       string     `json:"contract_notes"`
		BillingContactEmail string     `json:"billing_contact_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	switch body.BillingStatus {
	case "pilot", "active", "cancelled":
	default:
		Error(w, http.StatusBadRequest, "billing_status must be pilot, active, or cancelled")
		return
	}

	billing, err := h.billing.Update(r.Context(), orgID, body.BillingStatus, body.PilotEndsAt, body.ContractNotes, body.BillingContactEmail)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update billing")
		return
	}
	JSON(w, http.StatusOK, billing)
}

func (h *Handler) PlatformListAllBilling(w http.ResponseWriter, r *http.Request) {
	items, err := h.billing.ListAll(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list billing")
		return
	}
	JSON(w, http.StatusOK, items)
}
