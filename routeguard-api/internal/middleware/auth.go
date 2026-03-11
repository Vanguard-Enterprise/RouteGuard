package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

type contextKey string

const sessionContextKey contextKey = "session"

// Authenticate validates the rg_session cookie, enforces user/org access checks,
// and injects SessionPayload into the context.
func Authenticate(c *cache.Cache, pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()

			cookie, err := r.Cookie("rg_session")
			if err != nil || cookie.Value == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			token := cookie.Value

			session, err := auth.GetSession(ctx, c, token)
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			userRepo := repository.NewUserRepo(pool)
			orgRepo := repository.NewOrgRepo(pool)

			// Check user not disabled (cached 30s)
			userKey := "user_enabled:" + session.UserID
			if val, err := c.GetString(ctx, userKey); err == nil {
				if val == "0" {
					auth.DeleteSession(ctx, c, token)
					http.Error(w, "account disabled", http.StatusForbidden)
					return
				}
			} else {
				enabled, dbErr := userRepo.IsUserEnabled(ctx, session.UserID)
				if dbErr != nil {
					http.Error(w, "internal error", http.StatusInternalServerError)
					return
				}
				v := "1"
				if !enabled {
					v = "0"
				}
				_ = c.SetString(ctx, userKey, v, 30*time.Second)
				if !enabled {
					auth.DeleteSession(ctx, c, token)
					http.Error(w, "account disabled", http.StatusForbidden)
					return
				}
			}

			// Check org not suspended/deleted (cached 30s)
			orgKey := "org_accessible:" + session.OrgID
			if val, err := c.GetString(ctx, orgKey); err == nil {
				if val == "0" {
					auth.DeleteSession(ctx, c, token)
					http.Error(w, "organization suspended", http.StatusForbidden)
					return
				}
			} else {
				accessible, dbErr := orgRepo.IsOrgAccessible(ctx, session.OrgID)
				if dbErr != nil {
					http.Error(w, "internal error", http.StatusInternalServerError)
					return
				}
				v := "1"
				if !accessible {
					v = "0"
				}
				_ = c.SetString(ctx, orgKey, v, 30*time.Second)
				if !accessible {
					auth.DeleteSession(ctx, c, token)
					http.Error(w, "organization suspended", http.StatusForbidden)
					return
				}
			}

			ctx = context.WithValue(ctx, sessionContextKey, session)
			ctx = context.WithValue(ctx, contextKey("session_token"), token)
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
