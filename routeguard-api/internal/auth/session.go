package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/routeguard/api/internal/cache"
)

const (
	SessionCookieName  = "rg_session"
	SessionTTL         = 7 * 24 * time.Hour
	sessionKeyPrefix   = "session:"
	userSessionsPrefix = "user_sessions:"
)

func userSessionsKey(userID string) string {
	return userSessionsPrefix + userID
}

type contextKey string

// SessionContextKey is the context key used to store the SessionPayload.
const SessionContextKey contextKey = "session"

// SessionFromContext retrieves the SessionPayload from the request context.
// Returns nil if the session is not present (e.g., unauthenticated route).
func SessionFromContext(ctx context.Context) *SessionPayload {
	s, _ := ctx.Value(SessionContextKey).(*SessionPayload)
	return s
}

// SessionPayload is the data stored in Redis for each user session.
type SessionPayload struct {
	UserID    string   `json:"user_id"`
	OrgID     string   `json:"org_id,omitempty"`
	Email     string   `json:"email"`
	Name      string   `json:"name"`
	IsStaff   bool     `json:"is_staff"`
	Roles     []string `json:"roles,omitempty"`
	CreatedAt int64    `json:"created_at"`
}

// CreateSession generates a random token, stores the session payload in Redis,
// and tracks the token in a per-user set for bulk invalidation.
func CreateSession(ctx context.Context, c *cache.Cache, payload SessionPayload) (string, error) {
	token, err := generateToken()
	if err != nil {
		return "", err
	}
	payload.CreatedAt = time.Now().Unix()
	if err := c.Set(ctx, sessionKeyPrefix+token, payload, SessionTTL); err != nil {
		return "", err
	}
	// Non-fatal: track this token under the user so we can bulk-invalidate on soft delete.
	_ = c.SAdd(ctx, userSessionsKey(payload.UserID), token, SessionTTL)
	return token, nil
}

// GetSession retrieves a session by token. Returns nil, cache miss error if not found.
// Use cache.IsNotFound(err) to distinguish a cache miss (→ 401) from a server error (→ 500).
func GetSession(ctx context.Context, c *cache.Cache, token string) (*SessionPayload, error) {
	var payload SessionPayload
	if err := c.Get(ctx, sessionKeyPrefix+token, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

// DestroySession deletes a session from Redis and removes it from the user's session set.
func DestroySession(ctx context.Context, c *cache.Cache, token, userID string) error {
	_ = c.SRem(ctx, userSessionsKey(userID), token)
	return c.Del(ctx, sessionKeyPrefix+token)
}

// InvalidateUserSessions deletes all active sessions for a user.
// Called on soft delete to immediately revoke access.
func InvalidateUserSessions(ctx context.Context, c *cache.Cache, userID string) error {
	tokens, err := c.SMembers(ctx, userSessionsKey(userID))
	if err != nil {
		return err
	}
	keys := make([]string, 0, len(tokens)+1)
	for _, t := range tokens {
		keys = append(keys, sessionKeyPrefix+t)
	}
	keys = append(keys, userSessionsKey(userID))
	return c.Del(ctx, keys...)
}

// UpdateSession overwrites the session payload for an existing token.
// Resets the TTL to SessionTTL (7 days). Call this after profile updates
// to keep GET /auth/me consistent without forcing re-login.
func UpdateSession(ctx context.Context, c *cache.Cache, token string, payload SessionPayload) error {
	return c.Set(ctx, sessionKeyPrefix+token, payload, SessionTTL)
}

// TokenFromRequest extracts the session token from the request cookie.
func TokenFromRequest(r *http.Request) string {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}

// SetSessionCookie writes the session cookie to the response.
// The cookie is shared across route-guard.com and api.route-guard.com via Domain=.route-guard.com.
func SetSessionCookie(w http.ResponseWriter, token string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		Domain:   ".route-guard.com",
		HttpOnly: true,
		Secure:   secure,
		// SameSite=Lax: allows cookie on top-level navigations; cross-origin fetch is blocked by CORS policy.
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(SessionTTL.Seconds()),
	})
}

// ClearSessionCookie expires the session cookie.
// Domain and Path must match the original cookie exactly for browsers to delete it.
func ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		Domain:   ".route-guard.com",
		HttpOnly: true,
		MaxAge:   -1,
	})
}

// generateToken generates a cryptographically random 32-byte hex token.
func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
