package middleware

import (
	"context"
	"net/http"

	"github.com/routeguard/api/internal/api"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/cache"
)

type contextKey string

const SessionKey contextKey = "session"

// Authenticate validates the session cookie and injects the SessionPayload into context.
// Returns 401 if the cookie is missing or the session is not found in Redis.
func Authenticate(c *cache.Cache) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := auth.TokenFromRequest(r)
			if token == "" {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			session, err := auth.GetSession(r.Context(), c, token)
			if err != nil {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			ctx := context.WithValue(r.Context(), SessionKey, session)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SessionFromContext retrieves the SessionPayload from the request context.
// Returns nil if the session is not present (e.g., unauthenticated route).
func SessionFromContext(ctx context.Context) *auth.SessionPayload {
	s, _ := ctx.Value(SessionKey).(*auth.SessionPayload)
	return s
}
