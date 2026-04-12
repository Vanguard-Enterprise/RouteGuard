package config

import (
	"encoding/hex"
	"fmt"
	"os"
)

type Config struct {
	Port                string
	DatabaseURL         string
	RedisAddr           string
	RedisPassword       string
	BaseURL             string
	APIBaseURL          string
	GoogleMapsAPIKey    string
	MapboxAccessToken   string
	DataEncryptionKey   []byte
	HMACKey             []byte
	DemoTemplateVersion string
	IsProd              bool
}

func Load() (*Config, error) {
	dataKey, err := decodeHexKey("DATA_ENCRYPTION_KEY")
	if err != nil {
		return nil, fmt.Errorf("DATA_ENCRYPTION_KEY: %w", err)
	}
	hmacKey, err := decodeHexKey("HMAC_KEY")
	if err != nil {
		return nil, fmt.Errorf("HMAC_KEY: %w", err)
	}

	return &Config{
		Port:                envOr("PORT", "8080"),
		DatabaseURL:         mustEnv("DATABASE_URL"),
		RedisAddr:           mustEnv("REDIS_ADDR"),
		RedisPassword:       os.Getenv("REDIS_PASSWORD"),
		BaseURL:             envOr("BASE_URL", "http://localhost:3000"),
		APIBaseURL:          envOr("API_BASE_URL", "http://localhost:8080"),
		GoogleMapsAPIKey:    envOr("GOOGLE_MAPS_API_KEY", ""),
		MapboxAccessToken:   envOr("MAPBOX_ACCESS_TOKEN", envOr("MAPBOX_TOKEN", "")),
		DataEncryptionKey:   dataKey,
		HMACKey:             hmacKey,
		DemoTemplateVersion: envOr("DEMO_TEMPLATE_VERSION", "large-county-v1"),
		IsProd:              os.Getenv("NODE_ENV") == "production" || os.Getenv("ENV") == "production",
	}, nil
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required env var %s is not set", key))
	}
	return v
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func decodeHexKey(envKey string) ([]byte, error) {
	s := os.Getenv(envKey)
	if s == "" {
		if os.Getenv("ENV") != "production" {
			return make([]byte, 32), nil
		}
		return nil, fmt.Errorf("required env var %s is not set", envKey)
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("invalid hex value: %w", err)
	}
	if len(b) != 32 {
		return nil, fmt.Errorf("must be 32 bytes (64 hex chars), got %d bytes", len(b))
	}
	return b, nil
}
