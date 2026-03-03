package cleanup

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/routeguard/api/internal/repository"
)

// StartUnclaimedDevicePurge starts a background goroutine that deletes unclaimed
// device records older than 1 hour. Runs every 5 minutes until ctx is cancelled.
func StartUnclaimedDevicePurge(ctx context.Context, pool *pgxpool.Pool) {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				repo := repository.NewDeviceRepo(pool)
				n, err := repo.DeleteExpiredUnclaimed(ctx)
				if err != nil {
					log.Error().Err(err).Msg("cleanup: failed to purge expired unclaimed devices")
				} else if n > 0 {
					log.Info().Int64("count", n).Msg("cleanup: purged expired unclaimed devices")
				}
			}
		}
	}()
}
