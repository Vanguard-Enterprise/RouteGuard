package repository

import (
	"context"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type AuditRepo struct {
	pool *pgxpool.Pool
}

func NewAuditRepo(pool *pgxpool.Pool) *AuditRepo {
	return &AuditRepo{pool: pool}
}

func (r *AuditRepo) Create(ctx context.Context, e domain.AuditEvent) (*domain.AuditEvent, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO audit_events (actor_id, actor_email, org_id, event_type, target_type, target_id, metadata, ip_address)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, actor_id, actor_email, org_id, event_type, target_type, target_id, metadata, ip_address, created_at`,
		e.ActorID, e.ActorEmail, e.OrgID, e.EventType, e.TargetType, e.TargetID, e.Metadata, e.IPAddress,
	)
	var out domain.AuditEvent
	err := row.Scan(&out.ID, &out.ActorID, &out.ActorEmail, &out.OrgID, &out.EventType,
		&out.TargetType, &out.TargetID, &out.Metadata, &out.IPAddress, &out.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func (r *AuditRepo) List(ctx context.Context, cursor *time.Time, limit int, eventType, actorID string, startDate, endDate *time.Time) (*domain.CursorResponse[domain.AuditEvent], error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	query := `SELECT id, actor_id, actor_email, org_id, event_type, target_type, target_id, metadata, ip_address, created_at
	          FROM audit_events WHERE 1=1`
	args := []any{}
	argIdx := 1

	if cursor != nil {
		query += ` AND created_at < $` + strconv.Itoa(argIdx)
		args = append(args, *cursor)
		argIdx++
	}
	if eventType != "" {
		query += ` AND event_type = $` + strconv.Itoa(argIdx)
		args = append(args, eventType)
		argIdx++
	}
	if actorID != "" {
		query += ` AND actor_id = $` + strconv.Itoa(argIdx)
		args = append(args, actorID)
		argIdx++
	}
	if startDate != nil {
		query += ` AND created_at >= $` + strconv.Itoa(argIdx)
		args = append(args, *startDate)
		argIdx++
	}
	if endDate != nil {
		query += ` AND created_at <= $` + strconv.Itoa(argIdx)
		args = append(args, *endDate)
		argIdx++
	}

	query += ` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(argIdx)
	args = append(args, limit+1)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.AuditEvent
	for rows.Next() {
		var e domain.AuditEvent
		if err := rows.Scan(&e.ID, &e.ActorID, &e.ActorEmail, &e.OrgID, &e.EventType,
			&e.TargetType, &e.TargetID, &e.Metadata, &e.IPAddress, &e.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, e)
	}

	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}

	var nextCursor string
	if hasMore && len(items) > 0 {
		nextCursor = items[len(items)-1].CreatedAt.Format(time.RFC3339Nano)
	}

	return &domain.CursorResponse[domain.AuditEvent]{
		Items:      items,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}, nil
}
