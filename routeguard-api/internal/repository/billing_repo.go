package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type BillingRepo struct {
	pool *pgxpool.Pool
}

func NewBillingRepo(pool *pgxpool.Pool) *BillingRepo {
	return &BillingRepo{pool: pool}
}

func (r *BillingRepo) GetOrCreateByOrg(ctx context.Context, orgID string) (*domain.OrgBilling, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO org_billing (org_id) VALUES ($1)
		 ON CONFLICT (org_id) DO UPDATE SET org_id = org_billing.org_id
		 RETURNING id, org_id, billing_status, pilot_ends_at, contract_notes, billing_contact_email, created_at, updated_at`,
		orgID,
	)
	var b domain.OrgBilling
	err := row.Scan(&b.ID, &b.OrgID, &b.BillingStatus, &b.PilotEndsAt,
		&b.ContractNotes, &b.BillingContactEmail, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (r *BillingRepo) Update(ctx context.Context, orgID string, status string, pilotEndsAt *time.Time, notes string, contactEmail string) (*domain.OrgBilling, error) {
	row := r.pool.QueryRow(ctx,
		`UPDATE org_billing SET billing_status = $2, pilot_ends_at = $3, contract_notes = $4,
		 billing_contact_email = $5, updated_at = now()
		 WHERE org_id = $1
		 RETURNING id, org_id, billing_status, pilot_ends_at, contract_notes, billing_contact_email, created_at, updated_at`,
		orgID, status, pilotEndsAt, notes, contactEmail,
	)
	var b domain.OrgBilling
	err := row.Scan(&b.ID, &b.OrgID, &b.BillingStatus, &b.PilotEndsAt,
		&b.ContractNotes, &b.BillingContactEmail, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (r *BillingRepo) ListAll(ctx context.Context) ([]domain.OrgBilling, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT b.id, b.org_id, b.billing_status, b.pilot_ends_at, b.contract_notes, b.billing_contact_email, b.created_at, b.updated_at
		 FROM org_billing b
		 JOIN organizations o ON o.id = b.org_id
		 WHERE o.deleted_at IS NULL
		 ORDER BY b.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.OrgBilling
	for rows.Next() {
		var b domain.OrgBilling
		if err := rows.Scan(&b.ID, &b.OrgID, &b.BillingStatus, &b.PilotEndsAt,
			&b.ContractNotes, &b.BillingContactEmail, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, b)
	}
	return items, nil
}
