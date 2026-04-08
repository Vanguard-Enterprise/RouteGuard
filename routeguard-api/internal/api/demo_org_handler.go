package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/demo"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

func (h *Handler) PlatformGetDemoResetStatus(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	canonicalOrg, err := h.canonicalDemoOrg(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	org, err := h.orgs.GetByID(r.Context(), orgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "org not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to load org")
		return
	}
	if org.ID != canonicalOrg.ID && !org.IsDemo {
		Error(w, http.StatusNotFound, "demo reset is not configured for this org")
		return
	}

	run, err := h.demoService.LatestRun(r.Context(), orgID)
	if err != nil && !isNotFound(err) {
		Error(w, http.StatusInternalServerError, "failed to load demo reset status")
		return
	}
	if err != nil && isNotFound(err) {
		JSON(w, http.StatusOK, map[string]any{
			"org_id":           org.ID,
			"template_version": h.effectiveDemoTemplateVersion(org),
			"latest_run":       nil,
		})
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"org_id":           org.ID,
		"template_version": h.effectiveDemoTemplateVersion(org),
		"latest_run":       run,
	})
}

func (h *Handler) PlatformResetDemoOrg(w http.ResponseWriter, r *http.Request) {
	orgID := chi.URLParam(r, "id")
	canonicalOrg, err := h.canonicalDemoOrg(r.Context())
	if err != nil {
		Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	org, err := h.orgs.GetByID(r.Context(), orgID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "org not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to load org")
		return
	}
	if org.ID == canonicalOrg.ID && !org.IsDemo {
		if err := h.orgs.MarkDemo(r.Context(), org.ID, h.effectiveDemoTemplateVersion(org)); err == nil {
			org.IsDemo = true
		}
	}
	if org.ID != canonicalOrg.ID && !org.IsDemo {
		Error(w, http.StatusNotFound, "demo reset is not configured for this org")
		return
	}

	var body struct {
		ResetMode string `json:"reset_mode"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	if body.ResetMode == "" {
		body.ResetMode = "full"
	}

	session := middleware.SessionFromContext(r.Context())
	run, err := h.demoService.ResetDemoOrg(r.Context(), org.ID, session.UserID, h.actorEmail(r.Context(), session.UserID), body.ResetMode)
	if err != nil {
		if errors.Is(err, demo.ErrResetInProgress) {
			Error(w, http.StatusConflict, "a demo reset is already in progress")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to reset demo org")
		return
	}
	JSON(w, http.StatusAccepted, run)
}

func (h *Handler) enforceDemoProtection(r *http.Request, org *domain.Organization, action string) bool {
	if !h.isProtectedDemoOrg(org) || !demo.IsProtectedAction(action) {
		return false
	}
	session := middleware.SessionFromContext(r.Context())
	actorID := ""
	actorEmail := "unknown"
	if session != nil {
		actorID = session.UserID
		actorEmail = h.actorEmail(r.Context(), session.UserID)
	}
	body, _ := json.Marshal(map[string]any{
		"action": action,
		"path":   r.URL.Path,
	})
	orgID := org.ID
	targetID := org.ID
	_, _ = h.audit.Create(r.Context(), domain.AuditEvent{
		ActorID:    actorID,
		ActorEmail: actorEmail,
		OrgID:      &orgID,
		EventType:  "demo.protected_action_blocked",
		TargetType: "organization",
		TargetID:   &targetID,
		Metadata:   body,
	})
	return true
}

func (h *Handler) isProtectedDemoOrg(org *domain.Organization) bool {
	if org == nil {
		return false
	}
	return org.IsDemo || org.Slug == demo.CanonicalOrgSlug
}

func (h *Handler) effectiveDemoTemplateVersion(org *domain.Organization) string {
	if org != nil && org.DemoTemplateVersion != nil && *org.DemoTemplateVersion != "" {
		return *org.DemoTemplateVersion
	}
	if h.cfg.DemoTemplateVersion != "" {
		return h.cfg.DemoTemplateVersion
	}
	return "large-county-v1"
}

func (h *Handler) canonicalDemoOrg(ctx context.Context) (*domain.Organization, error) {
	org, err := h.orgs.GetBySlug(ctx, demo.CanonicalOrgSlug)
	if err != nil {
		if isNotFound(err) {
			return nil, fmt.Errorf("canonical demo org %q was not found", demo.CanonicalOrgSlug)
		}
		return nil, fmt.Errorf("failed to load canonical demo org: %w", err)
	}
	return org, nil
}
