package middleware

import (
	"context"
	"net/http"

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/domain"
)

type contextKey string

const sessionContextKey contextKey = "session"

// Authenticate validates the rg_session cookie and injects SessionPayload into the context.
func Authenticate(c *cache.Cache) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("rg_session")
			if err != nil || cookie.Value == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			payload, err := auth.GetSession(r.Context(), c, cookie.Value)
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), sessionContextKey, payload)
			ctx = context.WithValue(ctx, contextKey("session_token"), cookie.Value)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SessionFromContext retrieves the SessionPayload from the request context.
func SessionFromContext(ctx context.Context) *domain.SessionPayload {
	s, _ := ctx.Value(sessionContextKey).(*domain.SessionPayload)
	return s
}

// TokenFromContext retrieves the raw session token from the request context.
func TokenFromContext(ctx context.Context) string {
	t, _ := ctx.Value(contextKey("session_token")).(string)
	return t
}
