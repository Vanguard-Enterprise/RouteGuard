package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/api"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/deviceauth"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

// DeviceFromContext retrieves the authenticated device from the request context.
// Returns nil if no device is present (e.g., on unauthenticated routes).
// Re-exported from deviceauth for use by callers that already import middleware.
func DeviceFromContext(ctx context.Context) *domain.Device {
	return deviceauth.DeviceFromContext(ctx)
}

// DeviceAuthenticate validates the device Bearer token and injects the *domain.Device
// into the request context.
//
// Expected header format:
//
//	Authorization: Bearer <device-uuid>:<raw-token-hex>
//
// The device UUID contains hyphens but no colons, and the raw token is a hex
// string with no colons, so splitting on the first ":" after "Bearer " is
// unambiguous.
//
// Returns 401 if the header is missing, malformed, the token does not match,
// or the device is revoked. Returns 500 on unexpected internal errors.
func DeviceAuthenticate(pool *pgxpool.Pool, c *cache.Cache) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			// Strip "Bearer " prefix.
			const prefix = "Bearer "
			if !strings.HasPrefix(authHeader, prefix) {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			credential := strings.TrimPrefix(authHeader, prefix)

			// Split on the first colon: <deviceID>:<rawToken>
			colonIdx := strings.Index(credential, ":")
			if colonIdx < 1 || colonIdx == len(credential)-1 {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}
			deviceID := credential[:colonIdx]
			rawToken := credential[colonIdx+1:]

			// Look up device metadata using the cache-first strategy.
			deviceRepo := repository.NewDeviceRepo(pool)
			device, err := deviceRepo.FindByIDAndCache(r.Context(), deviceID, c)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					api.Error(w, http.StatusUnauthorized, "unauthorized")
				} else {
					api.Error(w, http.StatusInternalServerError, "internal server error")
				}
				return
			}

			// Load the token hash directly from the DB — it is excluded from cache
			// (json:"-") to prevent the bcrypt hash from being stored in Redis.
			tokenHash, err := deviceRepo.FindTokenHash(r.Context(), deviceID)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					api.Error(w, http.StatusUnauthorized, "unauthorized")
				} else {
					api.Error(w, http.StatusInternalServerError, "internal server error")
				}
				return
			}
			// Guard: unprovisioned devices have a NULL hash — deny access.
			if tokenHash == "" {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			// Validate the raw token against the stored bcrypt hash.
			if err := crypto.CheckPassword(rawToken, tokenHash); err != nil {
				api.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			ctx := context.WithValue(r.Context(), deviceauth.DeviceContextKey, device)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
