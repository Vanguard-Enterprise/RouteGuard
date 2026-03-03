package middleware

import (
	"net/http"

	"github.com/routeguard/api/internal/api"
)

// RequireStaff requires the session user to be a RouteGuard staff user (IsStaff=true).
// Must be used after Authenticate middleware.
func RequireStaff(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session := SessionFromContext(r.Context())
		if session == nil || !session.IsStaff {
			api.Error(w, http.StatusForbidden, "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequireStaffPermission checks that the session staff user has the given permission string.
// Identical logic to RequirePermission; named separately for clarity in admin route wiring.
// Must be used after Authenticate and RequireStaff middleware.
func RequireStaffPermission(permission string) func(http.Handler) http.Handler {
	return RequirePermission(permission)
}

// RequirePermission checks that the session user has the given permission string in their Roles slice.
// Must be used after Authenticate middleware.
// session.Roles contains flattened permission strings (e.g., "students:read", "routes:write"),
// not role names.
func RequirePermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			session := SessionFromContext(r.Context())
			if session == nil {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			for _, p := range session.Roles {
				if p == permission {
					next.ServeHTTP(w, r)
					return
				}
			}
			api.Error(w, http.StatusForbidden, "forbidden")
		})
	}
}
