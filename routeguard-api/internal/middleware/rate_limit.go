package middleware

import (
	"fmt"
	"net/http"
	"time"

	"github.com/routeguard/api/internal/cache"
)

// RateLimit limits requests per IP per minute.
func RateLimit(c *cache.Cache, maxPerMinute int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := r.RemoteAddr
			key := fmt.Sprintf("rate:%s:%s", r.URL.Path, ip)

			count, err := c.Incr(r.Context(), key)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			if count == 1 {
				_ = c.Expire(r.Context(), key, time.Minute)
			}

			if count > maxPerMinute {
				http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
