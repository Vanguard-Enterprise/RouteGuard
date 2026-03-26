package repository

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type StudentRepo struct {
	pool *pgxpool.Pool
}

func NewStudentRepo(pool *pgxpool.Pool) *StudentRepo {
	return &StudentRepo{pool: pool}
}

func (r *StudentRepo) ListByOrg(ctx context.Context, orgID, search, status string, page, perPage int) ([]domain.Student, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	where, args, next := studentListFilter(orgID, search, status)

	countQuery := "SELECT COUNT(*) FROM students" + where
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count students: %w", err)
	}

	dataQuery := `SELECT id, org_id, student_id, first_name, last_name, grade, school, guardian_name, guardian_contact, is_active, created_at, updated_at, deleted_at
	              FROM students` + where +
		` ORDER BY lower(last_name), lower(first_name), created_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list students: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Student, 0)
	for rows.Next() {
		var s domain.Student
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.StudentID, &s.FirstName, &s.LastName,
			&s.Grade, &s.School, &s.GuardianName, &s.GuardianContact,
			&s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan student: %w", err)
		}
		items = append(items, s)
	}

	return items, total, nil
}

func studentListFilter(orgID, search, status string) (string, []any, int) {
	clauses := []string{"org_id = $1", "deleted_at IS NULL"}
	args := []any{orgID}
	next := 2

	search = strings.TrimSpace(search)
	if search != "" {
		clauses = append(clauses, `(student_id ILIKE $`+strconv.Itoa(next)+` OR first_name ILIKE $`+strconv.Itoa(next)+` OR last_name ILIKE $`+strconv.Itoa(next)+` OR school ILIKE $`+strconv.Itoa(next)+`)`)
		args = append(args, "%"+search+"%")
		next++
	}

	switch status {
	case "active":
		clauses = append(clauses, "is_active = true")
	case "inactive":
		clauses = append(clauses, "is_active = false")
	}

	return " WHERE " + strings.Join(clauses, " AND "), args, next
}

func (r *StudentRepo) GetByID(ctx context.Context, orgID, id string) (*domain.Student, error) {
	var s domain.Student
	err := r.pool.QueryRow(ctx,
		`SELECT id, org_id, student_id, first_name, last_name, grade, school, guardian_name, guardian_contact, is_active, created_at, updated_at, deleted_at
		 FROM students
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	).Scan(
		&s.ID, &s.OrgID, &s.StudentID, &s.FirstName, &s.LastName,
		&s.Grade, &s.School, &s.GuardianName, &s.GuardianContact,
		&s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get student: %w", err)
	}
	return &s, nil
}

func (r *StudentRepo) Create(ctx context.Context, student *domain.Student) (*domain.Student, error) {
	var s domain.Student
	err := r.pool.QueryRow(ctx,
		`INSERT INTO students (org_id, student_id, first_name, last_name, grade, school, guardian_name, guardian_contact, is_active)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, org_id, student_id, first_name, last_name, grade, school, guardian_name, guardian_contact, is_active, created_at, updated_at, deleted_at`,
		student.OrgID, student.StudentID, student.FirstName, student.LastName,
		student.Grade, student.School, student.GuardianName, student.GuardianContact, student.IsActive,
	).Scan(
		&s.ID, &s.OrgID, &s.StudentID, &s.FirstName, &s.LastName,
		&s.Grade, &s.School, &s.GuardianName, &s.GuardianContact,
		&s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create student: %w", err)
	}
	return &s, nil
}

func (r *StudentRepo) Update(ctx context.Context, student *domain.Student) (*domain.Student, error) {
	var s domain.Student
	err := r.pool.QueryRow(ctx,
		`UPDATE students
		 SET student_id = $3, first_name = $4, last_name = $5, grade = $6, school = $7, guardian_name = $8, guardian_contact = $9, is_active = $10, updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
		 RETURNING id, org_id, student_id, first_name, last_name, grade, school, guardian_name, guardian_contact, is_active, created_at, updated_at, deleted_at`,
		student.ID, student.OrgID, student.StudentID, student.FirstName, student.LastName,
		student.Grade, student.School, student.GuardianName, student.GuardianContact, student.IsActive,
	).Scan(
		&s.ID, &s.OrgID, &s.StudentID, &s.FirstName, &s.LastName,
		&s.Grade, &s.School, &s.GuardianName, &s.GuardianContact,
		&s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("update student: %w", err)
	}
	return &s, nil
}

func (r *StudentRepo) SoftDelete(ctx context.Context, orgID, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE students
		 SET deleted_at = now(), updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
		id, orgID,
	)
	if err != nil {
		return fmt.Errorf("delete student: %w", err)
	}
	return nil
}

func (r *StudentRepo) ListDeletedByOrg(ctx context.Context, orgID, search, status string, page, perPage int) ([]domain.Student, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	clauses := []string{"org_id = $1", "deleted_at IS NOT NULL"}
	args := []any{orgID}
	next := 2

	search = strings.TrimSpace(search)
	if search != "" {
		clauses = append(clauses, `(student_id ILIKE $`+strconv.Itoa(next)+` OR first_name ILIKE $`+strconv.Itoa(next)+` OR last_name ILIKE $`+strconv.Itoa(next)+` OR school ILIKE $`+strconv.Itoa(next)+`)`)
		args = append(args, "%"+search+"%")
		next++
	}

	switch status {
	case "active":
		clauses = append(clauses, "is_active = true")
	case "inactive":
		clauses = append(clauses, "is_active = false")
	}

	where := " WHERE " + strings.Join(clauses, " AND ")
	countQuery := "SELECT COUNT(*) FROM students" + where

	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count deleted students: %w", err)
	}

	dataQuery := `SELECT id, org_id, student_id, first_name, last_name, grade, school, guardian_name, guardian_contact, is_active, created_at, updated_at, deleted_at
	              FROM students` + where +
		` ORDER BY deleted_at DESC LIMIT $` + strconv.Itoa(next) + ` OFFSET $` + strconv.Itoa(next+1)
	dataArgs := append(args, perPage, offset)

	rows, err := r.pool.Query(ctx, dataQuery, dataArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list deleted students: %w", err)
	}
	defer rows.Close()

	items := make([]domain.Student, 0)
	for rows.Next() {
		var s domain.Student
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.StudentID, &s.FirstName, &s.LastName,
			&s.Grade, &s.School, &s.GuardianName, &s.GuardianContact,
			&s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan deleted student: %w", err)
		}
		items = append(items, s)
	}

	return items, total, nil
}

func (r *StudentRepo) Restore(ctx context.Context, orgID, id string) (*domain.Student, error) {
	var s domain.Student
	err := r.pool.QueryRow(ctx,
		`UPDATE students
		 SET deleted_at = NULL, updated_at = now()
		 WHERE id = $1 AND org_id = $2 AND deleted_at IS NOT NULL
		 RETURNING id, org_id, student_id, first_name, last_name, grade, school, guardian_name, guardian_contact, is_active, created_at, updated_at, deleted_at`,
		id, orgID,
	).Scan(
		&s.ID, &s.OrgID, &s.StudentID, &s.FirstName, &s.LastName,
		&s.Grade, &s.School, &s.GuardianName, &s.GuardianContact,
		&s.IsActive, &s.CreatedAt, &s.UpdatedAt, &s.DeletedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("restore student: %w", err)
	}
	return &s, nil
}
