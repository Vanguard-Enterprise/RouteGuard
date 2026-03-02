package middleware

import (
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/routeguard/api/internal/cache"
)

// RateLimit returns a middleware that limits requests by IP + endpoint path.
// limit is the maximum number of requests per minute allowed per IP per endpoint.
// If the cache is unavailable, the middleware fails open (allows the request through).
func RateLimit(c *cache.Cache, limit int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Prefer X-Real-IP set by chi's RealIP middleware; fall back to RemoteAddr.
			ip := r.Header.Get("X-Real-IP")
			if ip == "" {
				host, _, err := net.SplitHostPort(r.RemoteAddr)
				if err != nil {
					// RemoteAddr had no port (e.g. unix socket) — use as-is.
					ip = r.RemoteAddr
				} else {
					ip = host
				}
			}

			endpoint := r.URL.Path
			key := fmt.Sprintf("rate:%s:%s", ip, endpoint)

			count, err := c.Incr(r.Context(), key)
			if err != nil {
				// Fail open: allow the request when Redis is unavailable.
				next.ServeHTTP(w, r)
				return
			}

			if count == 1 {
				// First request in this window — start the 1-minute TTL.
				_ = c.Expire(r.Context(), key, time.Minute)
			}

			if count > int64(limit) {
				w.Header().Set("Retry-After", "60")
				http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
