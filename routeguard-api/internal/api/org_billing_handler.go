package api

import (
	"encoding/json"
	"net/http"

	"github.com/routeguard/api/internal/middleware"
)

func (h *Handler) OrgGetBilling(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	billing, err := h.billing.GetOrCreateByOrg(ctx, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get billing")
		return
	}
	JSON(w, http.StatusOK, billing)
}

func (h *Handler) OrgUpdateBillingContact(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body struct {
		BillingContactEmail string `json:"billing_contact_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	current, err := h.billing.GetOrCreateByOrg(ctx, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to get billing")
		return
	}

	billing, err := h.billing.Update(ctx, session.OrgID, current.BillingStatus, current.PilotEndsAt, current.ContractNotes, body.BillingContactEmail)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to update billing contact")
		return
	}
	JSON(w, http.StatusOK, billing)
}
