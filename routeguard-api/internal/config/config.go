package config

import (
	"encoding/hex"
	"fmt"
	"os"
)

type Config struct {
	Port              string
	DatabaseURL       string
	RedisAddr         string
	RedisPassword     string
	SessionKey        []byte
	DataEncryptionKey []byte
	APIKeySecret      []byte
	TwilioAccountSID  string
	TwilioAuthToken   string
	TwilioFromNumber  string
	BaseURL           string
	APIBaseURL        string
	RustFSEndpoint          string
	RustFSAccessKey         string
	RustFSSecretKey         string
	RustFSBucket            string
	RustFSPublicURL         string
	IsProd            bool
	MapboxSecretToken string
}

func Load() (*Config, error) {
	sessionKey, err := decodeHexKey("SESSION_ENCRYPTION_KEY")
	if err != nil {
		return nil, fmt.Errorf("SESSION_ENCRYPTION_KEY: %w", err)
	}
	dataKey, err := decodeHexKey("DATA_ENCRYPTION_KEY")
	if err != nil {
		return nil, fmt.Errorf("DATA_ENCRYPTION_KEY: %w", err)
	}
	apiKeySecret, err := decodeHexKey("API_KEY_SECRET")
	if err != nil {
		return nil, fmt.Errorf("API_KEY_SECRET: %w", err)
	}

	return &Config{
		Port:              envOr("PORT", "8080"),
		DatabaseURL:       mustEnv("DATABASE_URL"),
		RedisAddr:         mustEnv("REDIS_ADDR"),
		RedisPassword:     os.Getenv("REDIS_PASSWORD"),
		SessionKey:        sessionKey,
		DataEncryptionKey: dataKey,
		APIKeySecret:      apiKeySecret,
		TwilioAccountSID:  os.Getenv("TWILIO_ACCOUNT_SID"),
		TwilioAuthToken:   os.Getenv("TWILIO_AUTH_TOKEN"),
		TwilioFromNumber:  os.Getenv("TWILIO_FROM_NUMBER"),
		BaseURL:           envOr("BASE_URL", "http://localhost:3000"),
		APIBaseURL:        envOr("API_BASE_URL", "http://localhost:8080"),
		RustFSEndpoint:    envOr("RUSTFS_ENDPOINT", "http://localhost:9000"),
		RustFSAccessKey:   envOr("RUSTFS_ACCESS_KEY", "rustfsadmin"),
		RustFSSecretKey:   envOr("RUSTFS_SECRET_KEY", "rustfsadmin"),
		RustFSBucket:          envOr("RUSTFS_BUCKET", "avatars"),
		RustFSPublicURL:       envOr("RUSTFS_PUBLIC_URL", "http://localhost:9000/avatars"),
		IsProd:            os.Getenv("NODE_ENV") == "production" || os.Getenv("ENV") == "production",
		MapboxSecretToken: os.Getenv("MAPBOX_SECRET_TOKEN"),
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
		// In development, generate a deterministic dev key
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
