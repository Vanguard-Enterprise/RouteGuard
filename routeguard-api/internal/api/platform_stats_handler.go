package api

import (
	"net/http"

	"github.com/routeguard/api/internal/domain"
)

func (h *Handler) PlatformStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var stats domain.PlatformStats

	_ = h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL`).Scan(&stats.TotalOrgs)
	_ = h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM organizations WHERE suspended_at IS NOT NULL AND deleted_at IS NULL`).Scan(&stats.SuspendedOrgs)
	_ = h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE disabled_at IS NULL`).Scan(&stats.TotalUsers)

	keys, _ := h.cache.Keys(ctx, "session:*")
	stats.ActiveSessions = len(keys)

	stats.ActiveTrips = 0

	JSON(w, http.StatusOK, stats)
}
