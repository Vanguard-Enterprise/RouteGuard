package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type IntegrationRepo struct {
	pool *pgxpool.Pool
}

func NewIntegrationRepo(pool *pgxpool.Pool) *IntegrationRepo {
	return &IntegrationRepo{pool: pool}
}

func (r *IntegrationRepo) Create(ctx context.Context, intg *domain.Integration) (*domain.Integration, error) {
	var i domain.Integration
	err := r.pool.QueryRow(ctx,
		`INSERT INTO integrations (org_id, type, display_name, base_url, api_key_enc, api_secret_enc, enabled, sync_schedule, last_synced_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, org_id, type, display_name, base_url, api_key_enc, api_secret_enc, enabled, sync_schedule, last_synced_at, created_at, updated_at`,
		intg.OrgID, intg.Type, intg.DisplayName, intg.BaseURL,
		nullableString(intg.APIKeyEnc), nullableString(intg.APISecretEnc),
		intg.Enabled, intg.SyncSchedule, intg.LastSyncedAt,
	).Scan(&i.ID, &i.OrgID, &i.Type, &i.DisplayName, &i.BaseURL,
		&i.APIKeyEnc, &i.APISecretEnc, &i.Enabled, &i.SyncSchedule, &i.LastSyncedAt,
		&i.CreatedAt, &i.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create integration: %w", err)
	}
	i.HasAPIKey = i.APIKeyEnc != ""
	i.HasAPISecret = i.APISecretEnc != ""
	return &i, nil
}

func (r *IntegrationRepo) GetByID(ctx context.Context, id string) (*domain.Integration, error) {
	var i domain.Integration
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, type, display_name, base_url, api_key_enc, api_secret_enc, enabled, sync_schedule, last_synced_at, created_at, updated_at
		 FROM integrations WHERE id = $1`, id,
	).Scan(&i.ID, &i.OrgID, &i.Type, &i.DisplayName, &i.BaseURL,
		&i.APIKeyEnc, &i.APISecretEnc, &i.Enabled, &i.SyncSchedule, &i.LastSyncedAt,
		&i.CreatedAt, &i.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get integration: %w", err)
	}
	i.HasAPIKey = i.APIKeyEnc != ""
	i.HasAPISecret = i.APISecretEnc != ""
	return &i, nil
}

func (r *IntegrationRepo) ListByOrg(ctx context.Context, orgID string) ([]domain.Integration, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, org_id, type, display_name, base_url, api_key_enc, api_secret_enc, enabled, sync_schedule, last_synced_at, created_at, updated_at
		 FROM integrations WHERE org_id = $1 ORDER BY created_at`, orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list integrations: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Integration, 0)
	for rows.Next() {
		var i domain.Integration
		if err := rows.Scan(&i.ID, &i.OrgID, &i.Type, &i.DisplayName, &i.BaseURL,
			&i.APIKeyEnc, &i.APISecretEnc, &i.Enabled, &i.SyncSchedule, &i.LastSyncedAt,
			&i.CreatedAt, &i.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan integration: %w", err)
		}
		i.HasAPIKey = i.APIKeyEnc != ""
		i.HasAPISecret = i.APISecretEnc != ""
		items = append(items, i)
	}
	return items, nil
}

func (r *IntegrationRepo) Update(ctx context.Context, intg *domain.Integration) (*domain.Integration, error) {
	var i domain.Integration
	err := r.pool.QueryRow(ctx,
		`UPDATE integrations SET display_name = $2, base_url = $3, api_key_enc = $4, api_secret_enc = $5,
		 enabled = $6, sync_schedule = $7, last_synced_at = $8, updated_at = now()
		 WHERE id = $1
		 RETURNING id, org_id, type, display_name, base_url, api_key_enc, api_secret_enc, enabled, sync_schedule, last_synced_at, created_at, updated_at`,
		intg.ID, intg.DisplayName, intg.BaseURL,
		nullableString(intg.APIKeyEnc), nullableString(intg.APISecretEnc),
		intg.Enabled, intg.SyncSchedule, intg.LastSyncedAt,
	).Scan(&i.ID, &i.OrgID, &i.Type, &i.DisplayName, &i.BaseURL,
		&i.APIKeyEnc, &i.APISecretEnc, &i.Enabled, &i.SyncSchedule, &i.LastSyncedAt,
		&i.CreatedAt, &i.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update integration: %w", err)
	}
	i.HasAPIKey = i.APIKeyEnc != ""
	i.HasAPISecret = i.APISecretEnc != ""
	return &i, nil
}

func (r *IntegrationRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM integrations WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete integration: %w", err)
	}
	return nil
}

// nullableString converts an empty string to nil for nullable TEXT columns.
func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
