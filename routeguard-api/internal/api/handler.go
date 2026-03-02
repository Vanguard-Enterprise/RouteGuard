package api

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/config"
)

// Handler holds all shared dependencies for HTTP handlers.
type Handler struct {
	pool  *pgxpool.Pool
	cache *cache.Cache
	cfg   *config.Config
}

// NewHandler creates a new Handler with all dependencies.
func NewHandler(pool *pgxpool.Pool, c *cache.Cache, cfg *config.Config) *Handler {
	return &Handler{pool: pool, cache: c, cfg: cfg}
}
