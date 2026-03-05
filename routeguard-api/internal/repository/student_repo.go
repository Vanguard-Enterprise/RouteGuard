package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

// StudentRepo handles student queries.
type StudentRepo struct {
	pool *pgxpool.Pool
}

// NewStudentRepo creates a new StudentRepo.
func NewStudentRepo(pool *pgxpool.Pool) *StudentRepo {
	return &StudentRepo{pool: pool}
}

const studentSelectCols = `
	id, org_id, school_id, first_name, last_name, student_number, grade,
	rfid_tag_id, rfid_tag_id_hash, address, city, state, zip, lat, lng,
	status, medical_notes, created_at, updated_at
`

func scanStudent(row pgx.Row) (*domain.Student, error) {
	var s domain.Student
	err := row.Scan(
		&s.ID, &s.OrgID, &s.SchoolID, &s.FirstName, &s.LastName,
		&s.StudentNumber, &s.Grade, &s.RFIDTagID, &s.RFIDTagIDHash, &s.Address,
		&s.City, &s.State, &s.Zip, &s.Lat, &s.Lng,
		&s.Status, &s.MedicalNotes, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// List returns a paginated list of students for the given org, ordered by last_name, first_name.
func (r *StudentRepo) List(ctx context.Context, orgID string, limit, offset int) ([]domain.Student, error) {
	if limit > 500 {
		limit = 500
	}
	rows, err := r.pool.Query(ctx, `
		SELECT s.id, s.org_id, s.school_id, sc.name,
		       s.first_name, s.last_name, s.student_number, s.grade,
		       s.rfid_tag_id, s.rfid_tag_id_hash, s.address, s.city, s.state, s.zip, s.lat, s.lng,
		       s.status, s.medical_notes, s.created_at, s.updated_at
		FROM students s
		LEFT JOIN schools sc ON sc.id = s.school_id
		WHERE s.org_id = $1
		ORDER BY s.last_name, s.first_name
		LIMIT $2 OFFSET $3
	`, orgID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("student list: %w", err)
	}
	defer rows.Close()

	students := make([]domain.Student, 0)
	for rows.Next() {
		var s domain.Student
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.SchoolID, &s.SchoolName,
			&s.FirstName, &s.LastName, &s.StudentNumber, &s.Grade,
			&s.RFIDTagID, &s.RFIDTagIDHash, &s.Address,
			&s.City, &s.State, &s.Zip, &s.Lat, &s.Lng,
			&s.Status, &s.MedicalNotes, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		students = append(students, s)
	}
	return students, rows.Err()
}

// Get returns a student by ID scoped to orgID. Returns pgx.ErrNoRows if not found or wrong org.
func (r *StudentRepo) Get(ctx context.Context, id, orgID string) (*domain.Student, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+studentSelectCols+`
		FROM students
		WHERE id = $1 AND org_id = $2
	`, id, orgID)
	s, err := scanStudent(row)
	if err != nil {
		return nil, err
	}
	return s, nil
}

// Create inserts a new student and returns the created row.
// rfidTagID and medicalNotes must be already encrypted before this call.
// rfidTagIDHash is the SHA-256 hex hash of the plaintext RFID tag ID (nil if no RFID).
func (r *StudentRepo) Create(ctx context.Context, orgID, schoolID, firstName, lastName string, studentNumber, grade, rfidTagID, rfidTagIDHash, address, city, state, zip *string, lat, lng *float64, status string, medicalNotes *string) (*domain.Student, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO students (
			id, org_id, school_id, first_name, last_name,
			student_number, grade, rfid_tag_id, rfid_tag_id_hash, address, city, state, zip,
			lat, lng, status, medical_notes
		)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		RETURNING `+studentSelectCols,
		orgID, schoolID, firstName, lastName,
		studentNumber, grade, rfidTagID, rfidTagIDHash, address, city, state, zip,
		lat, lng, status, medicalNotes,
	)
	s, err := scanStudent(row)
	if err != nil {
		return nil, fmt.Errorf("student create: %w", err)
	}
	return s, nil
}

// Update applies a partial update to a student scoped to orgID. Only non-nil fields are updated.
// rfidTagID and medicalNotes must be already encrypted before this call.
// rfidTagIDHash is the SHA-256 hex hash of the plaintext RFID tag ID (nil if not changing).
// If no fields are provided, returns the current student via Get.
func (r *StudentRepo) Update(ctx context.Context, id, orgID string, schoolID, firstName, lastName, studentNumber, grade, rfidTagID, rfidTagIDHash, address, city, state, zip *string, lat, lng *float64, status, medicalNotes *string) (*domain.Student, error) {
	setClauses := make([]string, 0)
	args := make([]any, 0)

	if schoolID != nil {
		args = append(args, *schoolID)
		setClauses = append(setClauses, fmt.Sprintf("school_id = $%d", len(args)))
	}
	if firstName != nil {
		args = append(args, *firstName)
		setClauses = append(setClauses, fmt.Sprintf("first_name = $%d", len(args)))
	}
	if lastName != nil {
		args = append(args, *lastName)
		setClauses = append(setClauses, fmt.Sprintf("last_name = $%d", len(args)))
	}
	if studentNumber != nil {
		args = append(args, *studentNumber)
		setClauses = append(setClauses, fmt.Sprintf("student_number = $%d", len(args)))
	}
	if grade != nil {
		args = append(args, *grade)
		setClauses = append(setClauses, fmt.Sprintf("grade = $%d", len(args)))
	}
	if rfidTagID != nil {
		args = append(args, *rfidTagID)
		setClauses = append(setClauses, fmt.Sprintf("rfid_tag_id = $%d", len(args)))
	}
	if rfidTagIDHash != nil {
		args = append(args, *rfidTagIDHash)
		setClauses = append(setClauses, fmt.Sprintf("rfid_tag_id_hash = $%d", len(args)))
	}
	if address != nil {
		args = append(args, *address)
		setClauses = append(setClauses, fmt.Sprintf("address = $%d", len(args)))
	}
	if city != nil {
		args = append(args, *city)
		setClauses = append(setClauses, fmt.Sprintf("city = $%d", len(args)))
	}
	if state != nil {
		args = append(args, *state)
		setClauses = append(setClauses, fmt.Sprintf("state = $%d", len(args)))
	}
	if zip != nil {
		args = append(args, *zip)
		setClauses = append(setClauses, fmt.Sprintf("zip = $%d", len(args)))
	}
	if lat != nil {
		args = append(args, *lat)
		setClauses = append(setClauses, fmt.Sprintf("lat = $%d", len(args)))
	}
	if lng != nil {
		args = append(args, *lng)
		setClauses = append(setClauses, fmt.Sprintf("lng = $%d", len(args)))
	}
	if status != nil {
		args = append(args, *status)
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", len(args)))
	}
	if medicalNotes != nil {
		args = append(args, *medicalNotes)
		setClauses = append(setClauses, fmt.Sprintf("medical_notes = $%d", len(args)))
	}

	if len(setClauses) == 0 {
		return r.Get(ctx, id, orgID)
	}

	args = append(args, id)
	idParam := fmt.Sprintf("$%d", len(args))
	args = append(args, orgID)
	orgParam := fmt.Sprintf("$%d", len(args))

	query := fmt.Sprintf(`
		UPDATE students
		SET %s, updated_at = NOW()
		WHERE id = %s AND org_id = %s
		RETURNING `+studentSelectCols,
		strings.Join(setClauses, ", "), idParam, orgParam,
	)

	row := r.pool.QueryRow(ctx, query, args...)
	s, err := scanStudent(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}
		return nil, fmt.Errorf("student update: %w", err)
	}
	return s, nil
}

// FindByRFIDTagHash looks up an active student by their RFID tag hash within an org.
// Returns pgx.ErrNoRows if not found.
func (r *StudentRepo) FindByRFIDTagHash(ctx context.Context, rfidHash, orgID string) (*domain.Student, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+studentSelectCols+` FROM students WHERE rfid_tag_id_hash = $1 AND org_id = $2 AND status = 'active'`,
		rfidHash, orgID)
	s, err := scanStudent(row)
	if err != nil {
		return nil, err
	}
	return s, nil
}

// Delete removes a student by ID scoped to orgID. Returns pgx.ErrNoRows if not found.
func (r *StudentRepo) Delete(ctx context.Context, id, orgID string) error {
	tag, err := r.pool.Exec(ctx, "DELETE FROM students WHERE id = $1 AND org_id = $2", id, orgID)
	if err != nil {
		return fmt.Errorf("student delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// ListWithCoords returns all active students for the org that have lat/lng set.
func (r *StudentRepo) ListWithCoords(ctx context.Context, orgID string) ([]domain.Student, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, org_id, school_id, first_name, last_name, student_number,
		       grade, rfid_tag_id, rfid_tag_id_hash, address, city, state, zip, lat, lng,
		       status, medical_notes, created_at, updated_at
		FROM students
		WHERE org_id = $1 AND status = 'active' AND lat IS NOT NULL AND lng IS NOT NULL
		ORDER BY last_name, first_name
	`, orgID)
	if err != nil {
		return nil, fmt.Errorf("students list with coords: %w", err)
	}
	defer rows.Close()
	var result []domain.Student
	for rows.Next() {
		var s domain.Student
		if err := rows.Scan(
			&s.ID, &s.OrgID, &s.SchoolID, &s.FirstName, &s.LastName, &s.StudentNumber,
			&s.Grade, &s.RFIDTagID, &s.RFIDTagIDHash, &s.Address, &s.City, &s.State, &s.Zip,
			&s.Lat, &s.Lng, &s.Status, &s.MedicalNotes, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("students list with coords scan: %w", err)
		}
		result = append(result, s)
	}
	return result, rows.Err()
}
