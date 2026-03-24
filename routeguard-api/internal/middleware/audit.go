package middleware

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

type auditResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *auditResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

// AuditEvents records one audit row per authenticated API request.
func AuditEvents(pool *pgxpool.Pool, cfg *config.Config) func(http.Handler) http.Handler {
	auditRepo := repository.NewAuditRepo(pool)
	userRepo := repository.NewUserRepo(pool)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session := SessionFromContext(r.Context())
			if session == nil {
				next.ServeHTTP(w, r)
				return
			}

			aw := &auditResponseWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(aw, r)

			routePattern := routePatternOrPath(r)
			if shouldSkipRouteAudit(r.Method, routePattern) {
				return
			}

			actorEmail := "unknown"
			if u, err := userRepo.GetByID(r.Context(), session.UserID); err == nil {
				if dec, decErr := crypto.Decrypt(cfg.DataEncryptionKey, u.EmailEnc); decErr == nil && dec != "" {
					actorEmail = dec
				}
			}

			var orgID *string
			if strings.TrimSpace(session.OrgID) != "" {
				value := session.OrgID
				orgID = &value
			}
			targetID, targetType := targetFromRequest(r, routePattern)
			metadata, _ := json.Marshal(map[string]any{
				"method":        r.Method,
				"path":          r.URL.Path,
				"route_pattern": routePattern,
				"status":        aw.status,
			})

			if _, err := auditRepo.Create(r.Context(), domain.AuditEvent{
				ActorID:    session.UserID,
				ActorEmail: actorEmail,
				OrgID:      orgID,
				EventType:  buildEventType(r.Method, routePattern),
				TargetType: targetType,
				TargetID:   targetID,
				Metadata:   metadata,
				IPAddress:  clientIP(r),
			}); err != nil {
				log.Printf("audit: failed to create event method=%s route=%s actor=%s: %v", r.Method, routePattern, session.UserID, err)
			}
		})
	}
}

func shouldSkipRouteAudit(method, routePattern string) bool {
	if method == http.MethodGet {
		switch routePattern {
		case "/auth/me", "/auth/orgs", "/platform/audit", "/platform/stats":
			return true
		}
	}
	if method == http.MethodOptions {
		return true
	}
	return false
}

func routePatternOrPath(r *http.Request) string {
	rctx := chi.RouteContext(r.Context())
	if rctx != nil {
		if rp := rctx.RoutePattern(); rp != "" {
			return rp
		}
	}
	if r.URL.Path != "" {
		return r.URL.Path
	}
	return "/"
}

func buildEventType(method, routePattern string) string {
	if eventType, ok := mappedEventType(method, routePattern); ok {
		return eventType
	}

	norm := strings.ToLower(strings.Trim(routePattern, "/"))
	norm = strings.ReplaceAll(norm, "/", ".")
	norm = strings.ReplaceAll(norm, "{", "")
	norm = strings.ReplaceAll(norm, "}", "")
	if norm == "" {
		norm = "root"
	}
	return "api." + strings.ToLower(method) + "." + norm
}

func mappedEventType(method, routePattern string) (string, bool) {
	switch method + " " + routePattern {
	case "POST /auth/login":
		return "login", true
	case "POST /auth/logout":
		return "logout", true
	case "POST /platform/orgs":
		return "org.created", true
	case "POST /platform/orgs/{id}/suspend":
		return "org.suspended", true
	case "POST /platform/orgs/{id}/reactivate":
		return "org.reactivated", true
	case "DELETE /platform/orgs/{id}":
		return "org.deleted", true
	case "POST /platform/orgs/{id}/members":
		return "membership.added", true
	case "DELETE /platform/orgs/{id}/members/{userId}":
		return "membership.removed", true
	case "PUT /platform/orgs/{id}/members/{userId}/roles":
		return "role.assigned", true
	case "POST /platform/users/{id}/disable":
		return "user.disabled", true
	case "POST /platform/users/{id}/enable":
		return "user.enabled", true
	case "POST /platform/users":
		return "user.created", true
	}
	return "", false
}

func targetFromRequest(r *http.Request, routePattern string) (*string, string) {
	for _, key := range []string{"id", "userId"} {
		if v := chi.URLParam(r, key); v != "" {
			value := v
			return &value, targetTypeFromRoute(routePattern)
		}
	}
	return nil, targetTypeFromRoute(routePattern)
}

func targetTypeFromRoute(routePattern string) string {
	parts := strings.Split(strings.Trim(routePattern, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		return "request"
	}
	if len(parts) > 1 && (parts[0] == "platform" || parts[0] == "org" || parts[0] == "auth") {
		return parts[1]
	}
	return parts[0]
}

func clientIP(r *http.Request) *string {
	ip := strings.TrimSpace(r.RemoteAddr)
	if ip == "" {
		return nil
	}
	if host, _, err := net.SplitHostPort(ip); err == nil {
		host = strings.TrimSpace(host)
		if host != "" {
			return &host
		}
	}
	if parsed := net.ParseIP(ip); parsed != nil {
		s := parsed.String()
		return &s
	}
	return nil
}
