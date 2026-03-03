package api

import (
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/deviceauth"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

// LogAudit writes an audit entry derived from the session or device context.
// It is non-fatal - errors are silently ignored.
func (h *Handler) LogAudit(r *http.Request, action, targetType, targetID string, metadata map[string]any) {
	entry := domain.AuditLog{
		Action: action,
	}

	ctx := r.Context()

	// Populate from session if present.
	if session := auth.SessionFromContext(ctx); session != nil {
		entry.ActorID = &session.UserID
		entry.ActorType = "user"
		if session.OrgID != "" {
			if metadata == nil {
				metadata = make(map[string]any)
			}
			if _, ok := metadata["org_id"]; !ok {
				metadata["org_id"] = session.OrgID
			}
		}
	} else if device := deviceauth.DeviceFromContext(ctx); device != nil {
		entry.ActorID = &device.ID
		entry.ActorType = "device"
		if metadata == nil {
			metadata = make(map[string]any)
		}
		if _, ok := metadata["org_id"]; !ok {
			metadata["org_id"] = device.OrgID
		}
	} else {
		entry.ActorType = "system"
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

	ip := realIP(r)
	entry.IPAddress = &ip

	repo := repository.NewAuditRepo(h.pool)
	_ = repo.Log(ctx, entry)
}

// ListAuditLogs handles GET /admin/audit-logs?org_id=...&limit=...&offset=...
// org_id is optional; omitting it returns all logs across all orgs.
func (h *Handler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	orgID := r.URL.Query().Get("org_id")
	limit := parseIntParam(r, "limit", 50)
	offset := parseIntParam(r, "offset", 0)

	repo := repository.NewAuditRepo(h.pool)
	var logs []domain.AuditLog
	var err error
	if orgID == "" {
		logs, err = repo.ListAll(r.Context(), limit, offset)
	} else {
		logs, err = repo.List(r.Context(), orgID, limit, offset)
	}
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

// realIP extracts the caller's IP address from the request.
// Checks X-Forwarded-For first (leftmost entry is the client), then
// X-Real-IP, then falls back to RemoteAddr.
func realIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if idx := strings.Index(xff, ","); idx != -1 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
