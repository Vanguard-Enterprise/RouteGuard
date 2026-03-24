package api

import (
	"net/url"
	"strings"
	"time"
)

const (
	magicLinkTTL         = 72 * time.Hour
	magicLinkCachePrefix = "magic_link:"
)

type magicLinkPayload struct {
	UserID string `json:"user_id"`
	OrgID  string `json:"org_id"`
}

func magicLinkCacheKey(token string) string {
	return magicLinkCachePrefix + token
}

func buildMagicLinkURL(baseURL, token string) string {
	return strings.TrimRight(baseURL, "/") + "/login/magic-link?token=" + url.QueryEscape(token)
}
