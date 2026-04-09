package repository

import (
	"context"
	"fmt"
	"sort"
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

type StudentListFilters struct {
	Search         string
	Status         string
	GradeMin       *int
	GradeMax       *int
	Schools        []string
	GuardianSearch string
}

type StudentFilterOptions struct {
	Grades  []int    `json:"grades"`
	Schools []string `json:"schools"`
}

func studentGradeOrderExpression() string {
	return `CASE
		WHEN upper(trim(grade)) = 'K' THEN 0
		WHEN trim(grade) ~ '^[0-9]+$' THEN CAST(trim(grade) AS INTEGER)
		ELSE NULL
	END`
}

func (r *StudentRepo) ListByOrg(ctx context.Context, orgID string, filters StudentListFilters, page, perPage int) ([]domain.Student, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	where, args, next := studentListFilter(orgID, filters, false)

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

func studentListFilter(orgID string, filters StudentListFilters, deleted bool) (string, []any, int) {
	clauses := []string{"org_id = $1"}
	args := []any{orgID}
	next := 2

	if deleted {
		clauses = append(clauses, "deleted_at IS NOT NULL")
	} else {
		clauses = append(clauses, "deleted_at IS NULL")
	}

	search := strings.TrimSpace(filters.Search)
	if search != "" {
		clauses = append(clauses, `(student_id ILIKE $`+strconv.Itoa(next)+` OR first_name ILIKE $`+strconv.Itoa(next)+` OR last_name ILIKE $`+strconv.Itoa(next)+` OR school ILIKE $`+strconv.Itoa(next)+` OR guardian_name ILIKE $`+strconv.Itoa(next)+`)`)
		args = append(args, "%"+search+"%")
		next++
	}

	switch filters.Status {
	case "active":
		clauses = append(clauses, "is_active = true")
	case "inactive":
		clauses = append(clauses, "is_active = false")
	}

	if filters.GuardianSearch != "" {
		clauses = append(clauses, `guardian_name ILIKE $`+strconv.Itoa(next))
		args = append(args, "%"+strings.TrimSpace(filters.GuardianSearch)+"%")
		next++
	}

	if len(filters.Schools) > 0 {
		schoolClauses := make([]string, 0, len(filters.Schools))
		for _, school := range filters.Schools {
			school = strings.TrimSpace(school)
			if school == "" {
				continue
			}
			schoolClauses = append(schoolClauses, `school = $`+strconv.Itoa(next))
			args = append(args, school)
			next++
		}
		if len(schoolClauses) > 0 {
			clauses = append(clauses, "("+strings.Join(schoolClauses, " OR ")+")")
		}
	}

	if filters.GradeMin != nil {
		clauses = append(clauses, studentGradeOrderExpression()+` IS NOT NULL AND `+studentGradeOrderExpression()+` >= $`+strconv.Itoa(next))
		args = append(args, *filters.GradeMin)
		next++
	}

	if filters.GradeMax != nil {
		clauses = append(clauses, studentGradeOrderExpression()+` IS NOT NULL AND `+studentGradeOrderExpression()+` <= $`+strconv.Itoa(next))
		args = append(args, *filters.GradeMax)
		next++
	}

	return " WHERE " + strings.Join(clauses, " AND "), args, next
}

func (r *StudentRepo) ListFilterOptionsByOrg(ctx context.Context, orgID string) (*StudentFilterOptions, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT grade, school
		 FROM students
		 WHERE org_id = $1
		   AND deleted_at IS NULL
		   AND is_active = true`,
		orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list student filter options: %w", err)
	}
	defer rows.Close()

	gradeSet := make(map[int]struct{})
	schoolSet := make(map[string]struct{})
	for rows.Next() {
		var grade string
		var school string
		if err := rows.Scan(&grade, &school); err != nil {
			return nil, fmt.Errorf("scan student filter options: %w", err)
		}
		grade = strings.TrimSpace(grade)
		school = strings.TrimSpace(school)
		if school != "" {
			schoolSet[school] = struct{}{}
		}
		switch {
		case strings.EqualFold(grade, "K"):
			gradeSet[0] = struct{}{}
		case func() bool {
			gradeInt, err := strconv.Atoi(grade)
			if err != nil {
				return false
			}
			gradeSet[gradeInt] = struct{}{}
			return true
		}():
		}
	}

	grades := make([]int, 0, len(gradeSet))
	for grade := range gradeSet {
		grades = append(grades, grade)
	}
	sort.Ints(grades)

	schools := make([]string, 0, len(schoolSet))
	for school := range schoolSet {
		schools = append(schools, school)
	}
	sort.Strings(schools)

	return &StudentFilterOptions{
		Grades:  grades,
		Schools: schools,
	}, nil
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

func (r *StudentRepo) ListDeletedByOrg(ctx context.Context, orgID string, filters StudentListFilters, page, perPage int) ([]domain.Student, int, error) {
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}
	offset := (page - 1) * perPage

	where, args, next := studentListFilter(orgID, filters, true)
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
