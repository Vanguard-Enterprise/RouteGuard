package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/demo"
	"github.com/routeguard/api/internal/domain"
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
	org, err := h.orgs.GetByID(r.Context(), orgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "org not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to load org")
		return
	}
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
	if h.isProtectedDemoOrg(org) {
		current, currentErr := h.billing.GetOrCreateByOrg(r.Context(), orgID)
		if currentErr != nil {
			Error(w, http.StatusInternalServerError, "failed to load billing")
			return
		}
		if body.BillingStatus != "" && body.BillingStatus != current.BillingStatus && h.enforceDemoProtection(r, org, demo.ActionUpdateBillingStatus) {
			Error(w, http.StatusForbidden, "the protected demo org billing status cannot be changed")
			return
		}
		if body.BillingStatus == "" {
			body.BillingStatus = current.BillingStatus
		}
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

	ctx := r.Context()
	type billingWithOrg struct {
		domain.OrgBilling
		OrgName string `json:"org_name"`
		OrgSlug string `json:"org_slug"`
	}
	result := make([]billingWithOrg, 0, len(items))
	for _, b := range items {
		entry := billingWithOrg{OrgBilling: b}
		org, err := h.orgs.GetByID(ctx, b.OrgID)
		if err == nil {
			name, _ := crypto.Decrypt(h.cfg.DataEncryptionKey, org.NameEnc)
			entry.OrgName = name
			entry.OrgSlug = org.Slug
		}
		result = append(result, entry)
	}
	JSON(w, http.StatusOK, result)
}
