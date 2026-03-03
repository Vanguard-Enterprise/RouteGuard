package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/cleanup"
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/db"
	"github.com/routeguard/api/internal/repository"
	"github.com/routeguard/api/internal/server"
	"github.com/routeguard/api/internal/storage"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	// Run database migrations
	migrationsPath := envOr("MIGRATIONS_PATH", "./migrations")
	log.Info().Str("path", migrationsPath).Msg("running database migrations")
	if err := db.RunMigrations(cfg.DatabaseURL, migrationsPath); err != nil {
		log.Fatal().Err(err).Msg("failed to run migrations")
	}
	log.Info().Msg("migrations complete")

	// Connect to database
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	defer pool.Close()
	log.Info().Msg("database connected")

	// Connect to Redis cache
	c := cache.New(cfg.RedisAddr, cfg.RedisPassword)
	if err := c.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to connect to Redis")
	}
	defer c.Close()
	log.Info().Msg("Redis connected")

	// Start background goroutine to hard-delete staff users 30+ days after soft delete.
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		staffUserRepo := repository.NewStaffUserRepo(pool)
		for {
			select {
			case <-ticker.C:
				// Get IDs first to clean Redis sets before row deletion.
				ids, err := staffUserRepo.GetExpiredStaffUserIDs(ctx)
				if err != nil {
					log.Error().Err(err).Msg("cleanup: get expired staff user IDs failed")
					continue
				}
				for _, id := range ids {
					_ = auth.InvalidateUserSessions(ctx, c, id)
				}
				n, err := staffUserRepo.HardDeleteExpiredStaffUsers(ctx)
				if err != nil {
					log.Error().Err(err).Msg("cleanup: hard delete expired staff users failed")
					continue
				}
				if n > 0 {
					log.Info().Int64("count", n).Msg("cleanup: hard deleted expired staff users")
				}
			}
		}
	}()

	store, err := storage.New(
		context.Background(),
		cfg.RustFSEndpoint,
		cfg.RustFSAccessKey,
		cfg.RustFSSecretKey,
		cfg.RustFSBucket,
		cfg.RustFSPublicURL,
	)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to initialize storage client")
	}

	srv, err := server.New(cfg, pool, c, store)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to initialize server")
	}

	cleanup.StartUnclaimedDevicePurge(ctx, pool)

	httpSrv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      srv,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Info().Str("addr", httpSrv.Addr).Msg("server starting")
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down server")
	ctx2, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := httpSrv.Shutdown(ctx2); err != nil {
		log.Error().Err(err).Msg("shutdown error")
	}
	log.Info().Msg("server stopped")
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
