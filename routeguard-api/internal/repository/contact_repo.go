package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type ContactRepo struct {
	pool *pgxpool.Pool
}

func NewContactRepo(pool *pgxpool.Pool) *ContactRepo {
	return &ContactRepo{pool: pool}
}

// Create inserts a new contact submission.
func (r *ContactRepo) Create(ctx context.Context, name, email, organization, message string) (*domain.ContactSubmission, error) {
	var s domain.ContactSubmission
	err := r.pool.QueryRow(ctx, `
		INSERT INTO contact_submissions (name, email, organization, message)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, email, organization, message, status, read_at, created_at
	`, name, email, organization, message).Scan(
		&s.ID, &s.Name, &s.Email, &s.Organization, &s.Message, &s.Status, &s.ReadAt, &s.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create contact submission: %w", err)
	}
	return &s, nil
}

// List returns paginated submissions, newest first, with optional status filter.
func (r *ContactRepo) List(ctx context.Context, limit, offset int, status *string) ([]domain.ContactSubmission, error) {
	query := `
		SELECT id, name, email, organization, message, status, read_at, created_at
		FROM contact_submissions
	`
	args := []any{}
	if status != nil {
		query += " WHERE status = $1"
		args = append(args, *status)
		query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
	} else {
		query += " ORDER BY created_at DESC LIMIT $1 OFFSET $2"
	}
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list contact submissions: %w", err)
	}
	defer rows.Close()

	var subs []domain.ContactSubmission
	for rows.Next() {
		var s domain.ContactSubmission
		if err := rows.Scan(&s.ID, &s.Name, &s.Email, &s.Organization, &s.Message, &s.Status, &s.ReadAt, &s.CreatedAt); err != nil {
			return nil, err
		}
		subs = append(subs, s)
	}
	return subs, rows.Err()
}

// Get returns a single submission with all its notes.
func (r *ContactRepo) Get(ctx context.Context, id string) (*domain.ContactSubmission, error) {
	var s domain.ContactSubmission
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, email, organization, message, status, read_at, created_at
		FROM contact_submissions WHERE id = $1
	`, id).Scan(&s.ID, &s.Name, &s.Email, &s.Organization, &s.Message, &s.Status, &s.ReadAt, &s.CreatedAt)
	if err != nil {
		return nil, err
	}

	rows, err := r.pool.Query(ctx, `
		SELECT cn.id, cn.submission_id, cn.author_id, u.name, cn.body, cn.created_at
		FROM contact_notes cn
		JOIN users u ON u.id = cn.author_id
		WHERE cn.submission_id = $1
		ORDER BY cn.created_at ASC
	`, id)
	if err != nil {
		return nil, fmt.Errorf("list contact notes: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var n domain.ContactNote
		if err := rows.Scan(&n.ID, &n.SubmissionID, &n.AuthorID, &n.AuthorName, &n.Body, &n.CreatedAt); err != nil {
			return nil, err
		}
		s.Notes = append(s.Notes, n)
	}
	if s.Notes == nil {
		s.Notes = []domain.ContactNote{}
	}
	return &s, rows.Err()
}

// UpdateStatus sets a new status on a submission.
func (r *ContactRepo) UpdateStatus(ctx context.Context, id, status string) (*domain.ContactSubmission, error) {
	var s domain.ContactSubmission
	err := r.pool.QueryRow(ctx, `
		UPDATE contact_submissions SET status = $1
		WHERE id = $2
		RETURNING id, name, email, organization, message, status, read_at, created_at
	`, status, id).Scan(&s.ID, &s.Name, &s.Email, &s.Organization, &s.Message, &s.Status, &s.ReadAt, &s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("update contact status: %w", err)
	}
	return &s, nil
}

// MarkRead sets read_at to now if it is currently NULL.
func (r *ContactRepo) MarkRead(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE contact_submissions SET read_at = NOW()
		WHERE id = $1 AND read_at IS NULL
	`, id)
	return err
}

// AddNote inserts a note and returns the full note with author name.
func (r *ContactRepo) AddNote(ctx context.Context, submissionID, authorID, body string) (*domain.ContactNote, error) {
	var n domain.ContactNote
	err := r.pool.QueryRow(ctx, `
		INSERT INTO contact_notes (submission_id, author_id, body)
		VALUES ($1, $2, $3)
		RETURNING id, submission_id, author_id, body, created_at
	`, submissionID, authorID, body).Scan(&n.ID, &n.SubmissionID, &n.AuthorID, &n.Body, &n.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("add contact note: %w", err)
	}

	// Fetch author name.
	err = r.pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, authorID).Scan(&n.AuthorName)
	if err != nil {
		n.AuthorName = "Staff"
	}
	return &n, nil
}

// Exists returns true if a submission with the given ID exists.
func (r *ContactRepo) Exists(ctx context.Context, id string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM contact_submissions WHERE id = $1)`, id).Scan(&exists)
	return exists, err
}

// ensure pgx.ErrNoRows is referenced so the import is used via Get.
var _ = pgx.ErrNoRows
