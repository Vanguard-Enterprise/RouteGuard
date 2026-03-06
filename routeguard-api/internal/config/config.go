package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port          string
	DatabaseURL   string
	RedisAddr     string
	RedisPassword string
	BaseURL       string
	IsProd        bool
}

func Load() (*Config, error) {
	return &Config{
		Port:          envOr("PORT", "8080"),
		DatabaseURL:   mustEnv("DATABASE_URL"),
		RedisAddr:     mustEnv("REDIS_ADDR"),
		RedisPassword: os.Getenv("REDIS_PASSWORD"),
		BaseURL:       envOr("BASE_URL", "http://localhost:3000"),
		IsProd:        os.Getenv("NODE_ENV") == "production" || os.Getenv("ENV") == "production",
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
