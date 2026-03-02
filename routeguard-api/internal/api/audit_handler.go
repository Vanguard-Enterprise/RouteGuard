package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/deviceauth"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

// LogAudit writes an audit entry derived from the session or device context.
// It is non-fatal — errors are silently ignored.
func (h *Handler) LogAudit(ctx context.Context, action, targetType, targetID string, metadata map[string]any) {
	entry := domain.AuditLog{
		Action: action,
	}

	// Populate from session if present.
	if session := auth.SessionFromContext(ctx); session != nil {
		entry.ActorID = &session.UserID
		entry.ActorType = "user"
		if session.OrgID != "" {
			// Store org_id in metadata so List can filter.
			if metadata == nil {
				metadata = make(map[string]any)
			}
			metadata["org_id"] = session.OrgID
		}
	} else if device := deviceauth.DeviceFromContext(ctx); device != nil {
		entry.ActorID = &device.ID
		entry.ActorType = "device"
		if metadata == nil {
			metadata = make(map[string]any)
		}
		metadata["org_id"] = device.OrgID
	}

	if targetType != "" {
		entry.TargetType = &targetType
	}
	if targetID != "" {
		entry.TargetID = &targetID
	}

	if len(metadata) > 0 {
		b, err := json.Marshal(metadata)
		if err == nil {
			entry.Metadata = b
		}
	}

	repo := repository.NewAuditRepo(h.pool)
	_ = repo.Log(ctx, entry)
}

// ListAuditLogs handles GET /admin/audit-logs?org_id=...&limit=...&offset=...
func (h *Handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	orgID := r.URL.Query().Get("org_id")
	if orgID == "" {
		Error(w, http.StatusBadRequest, "org_id is required")
		return
	}

	limit := parseIntParam(r, "limit", 50)
	offset := parseIntParam(r, "offset", 0)

	repo := repository.NewAuditRepo(h.pool)
	logs, err := repo.List(r.Context(), orgID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, logs)
}

// ListMyAuditLogs handles GET /dashboard/audit-logs
// Returns audit logs for the session user's org only.
func (h *Handler) ListMyAuditLogs(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil || session.OrgID == "" {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	limit := parseIntParam(r, "limit", 50)
	offset := parseIntParam(r, "offset", 0)

	repo := repository.NewAuditRepo(h.pool)
	logs, err := repo.List(r.Context(), session.OrgID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, logs)
}

// parseIntParam reads an integer query parameter with a default fallback.
func parseIntParam(r *http.Request, key string, def int) int {
	s := r.URL.Query().Get(key)
	if s == "" {
		return def
	}
	v, err := strconv.Atoi(s)
	if err != nil || v < 0 {
		return def
	}
	return v
}
