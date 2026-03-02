package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/routeguard/api/internal/api"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/tripauth"
)

// TripSessionAuthenticate validates the trip session Bearer token and injects the
// *tripauth.TripSessionPayload into the request context.
//
// Expected header format:
//
//	Authorization: Bearer <trip-token-hex>
//
// The token is looked up in Redis under "trip_session:<token>". Returns 401 if
// the header is missing, malformed, or the token is not found in Redis.
func TripSessionAuthenticate(c *cache.Cache) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			const prefix = "Bearer "
			if !strings.HasPrefix(authHeader, prefix) {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			token := strings.TrimPrefix(authHeader, prefix)
			if token == "" {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			var payload tripauth.TripSessionPayload
			if err := c.Get(r.Context(), "trip_session:"+token, &payload); err != nil {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			ctx := context.WithValue(r.Context(), tripauth.TripSessionContextKey, &payload)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
