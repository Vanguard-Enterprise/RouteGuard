package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/domain"
)

const (
	SessionTTL    = 7 * 24 * time.Hour
	sessionPrefix = "session:"
	userSetPrefix = "user_sessions:"
)

// CreateSession generates a random token, stores the payload in Redis, and returns the token.
func CreateSession(ctx context.Context, c *cache.Cache, payload *domain.SessionPayload) (string, error) {
	token, err := GenerateToken(32)
	if err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}

	payload.CreatedAt = time.Now().Unix()

	if err := c.Set(ctx, sessionPrefix+token, payload, SessionTTL); err != nil {
		return "", fmt.Errorf("store session: %w", err)
	}

	// Track token in per-user set for bulk invalidation
	if err := c.SAdd(ctx, userSetPrefix+payload.UserID, token, SessionTTL); err != nil {
		return "", fmt.Errorf("track session: %w", err)
	}

	return token, nil
}

// GetSession retrieves the session payload for a token.
func GetSession(ctx context.Context, c *cache.Cache, token string) (*domain.SessionPayload, error) {
	var payload domain.SessionPayload
	if err := c.Get(ctx, sessionPrefix+token, &payload); err != nil {
		return nil, err
	}
	return &payload, nil
}

// UpdateSession overwrites the session payload (used for org switching).
func UpdateSession(ctx context.Context, c *cache.Cache, token string, payload *domain.SessionPayload) error {
	return c.Set(ctx, sessionPrefix+token, payload, SessionTTL)
}

// DeleteSession removes a session from Redis.
func DeleteSession(ctx context.Context, c *cache.Cache, token string) error {
	return c.Del(ctx, sessionPrefix+token)
}

// InvalidateUserSessions removes all sessions for a user.
func InvalidateUserSessions(ctx context.Context, c *cache.Cache, userID string) error {
	tokens, err := c.SMembers(ctx, userSetPrefix+userID)
	if err != nil {
		return err
	}
	for _, t := range tokens {
		_ = c.Del(ctx, sessionPrefix+t)
	}
	return c.Del(ctx, userSetPrefix+userID)
}

func GenerateToken(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
