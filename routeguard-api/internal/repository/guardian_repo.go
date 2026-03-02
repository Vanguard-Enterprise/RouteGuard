package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// GuardianRepo handles guardian queries.
type GuardianRepo struct {
	pool *pgxpool.Pool
}

// NewGuardianRepo creates a new GuardianRepo.
func NewGuardianRepo(pool *pgxpool.Pool) *GuardianRepo {
	return &GuardianRepo{pool: pool}
}

// GuardianWithLink combines a guardian and their student link info.
type GuardianWithLink struct {
	domain.Guardian
	Relationship string `json:"relationship"`
	IsPrimary    bool   `json:"is_primary"`
}

// ListByStudent returns all guardians linked to the given student, scoped to orgID.
// Phone and AltPhone are returned as stored (encrypted ciphertext).
func (r *GuardianRepo) ListByStudent(ctx context.Context, studentID, orgID string) ([]GuardianWithLink, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT g.id, g.org_id, g.first_name, g.last_name, g.phone, g.alt_phone,
		       g.email, g.sms_opt_in, g.language, g.created_at,
		       sg.relationship, sg.is_primary
		FROM guardians g
		JOIN student_guardians sg ON g.id = sg.guardian_id
		WHERE sg.student_id = $1 AND g.org_id = $2
		ORDER BY sg.is_primary DESC, g.last_name, g.first_name
	`, studentID, orgID)
	if err != nil {
		return nil, fmt.Errorf("guardian list: %w", err)
	}
	defer rows.Close()

	result := make([]GuardianWithLink, 0)
	for rows.Next() {
		var gwl GuardianWithLink
		if err := rows.Scan(
			&gwl.ID, &gwl.OrgID, &gwl.FirstName, &gwl.LastName,
			&gwl.Phone, &gwl.AltPhone, &gwl.Email, &gwl.SMSOptIn,
			&gwl.Language, &gwl.CreatedAt,
			&gwl.Relationship, &gwl.IsPrimary,
		); err != nil {
			return nil, fmt.Errorf("guardian list scan: %w", err)
		}
		result = append(result, gwl)
	}
	return result, rows.Err()
}

// CreateWithLink inserts a new guardian and links it to the given student in a transaction.
// encPhone and encAltPhone must be already encrypted before this call.
// Returns the combined guardian + link info.
func (r *GuardianRepo) CreateWithLink(
	ctx context.Context,
	orgID, studentID, firstName, lastName, encPhone string,
	encAltPhone *string,
	email *string,
	smsOptIn bool,
	language, relationship string,
	isPrimary bool,
) (*GuardianWithLink, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("guardian create: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Step 0: Verify student belongs to this org.
	var exists bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM students WHERE id = $1 AND org_id = $2)`,
		studentID, orgID,
	).Scan(&exists); err != nil {
		return nil, fmt.Errorf("guardian create: verify student: %w", err)
	}
	if !exists {
		return nil, pgx.ErrNoRows
	}

	var gwl GuardianWithLink

	// Step 1: Insert guardian.
	err = tx.QueryRow(ctx, `
		INSERT INTO guardians (id, org_id, first_name, last_name, phone, alt_phone, email, sms_opt_in, language)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, org_id, first_name, last_name, phone, alt_phone, email, sms_opt_in, language, created_at
	`, orgID, firstName, lastName, encPhone, encAltPhone, email, smsOptIn, language).Scan(
		&gwl.ID, &gwl.OrgID, &gwl.FirstName, &gwl.LastName,
		&gwl.Phone, &gwl.AltPhone, &gwl.Email, &gwl.SMSOptIn,
		&gwl.Language, &gwl.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("guardian create: insert guardian: %w", err)
	}

	// Step 2: Insert student_guardian link.
	var sg domain.StudentGuardian
	err = tx.QueryRow(ctx, `
		INSERT INTO student_guardians (id, student_id, guardian_id, relationship, is_primary)
		VALUES (gen_random_uuid(), $1, $2, $3, $4)
		RETURNING id, student_id, guardian_id, relationship, is_primary
	`, studentID, gwl.ID, relationship, isPrimary).Scan(
		&sg.ID, &sg.StudentID, &sg.GuardianID, &sg.Relationship, &sg.IsPrimary,
	)
	if err != nil {
		return nil, fmt.Errorf("guardian create: insert student_guardian: %w", err)
	}

	gwl.Relationship = sg.Relationship
	gwl.IsPrimary = sg.IsPrimary

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("guardian create: commit: %w", err)
	}

	return &gwl, nil
}
