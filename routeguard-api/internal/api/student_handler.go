package api

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

type createStudentRequest struct {
	SchoolID      string   `json:"school_id"`
	FirstName     string   `json:"first_name"`
	LastName      string   `json:"last_name"`
	StudentNumber *string  `json:"student_number"`
	Grade         *string  `json:"grade"`
	RFIDTagID     *string  `json:"rfid_tag_id"`    // plaintext; encrypted before storage
	Address       *string  `json:"address"`
	City          *string  `json:"city"`
	State         *string  `json:"state"`
	Zip           *string  `json:"zip"`
	Lat           *float64 `json:"lat"`
	Lng           *float64 `json:"lng"`
	Status        string   `json:"status"`
	MedicalNotes  *string  `json:"medical_notes"` // plaintext; encrypted before storage
}

type updateStudentRequest struct {
	SchoolID      *string  `json:"school_id"`
	FirstName     *string  `json:"first_name"`
	LastName      *string  `json:"last_name"`
	StudentNumber *string  `json:"student_number"`
	Grade         *string  `json:"grade"`
	RFIDTagID     *string  `json:"rfid_tag_id"`
	Address       *string  `json:"address"`
	City          *string  `json:"city"`
	State         *string  `json:"state"`
	Zip           *string  `json:"zip"`
	Lat           *float64 `json:"lat"`
	Lng           *float64 `json:"lng"`
	Status        *string  `json:"status"`
	MedicalNotes  *string  `json:"medical_notes"`
}

// importResult is the response for POST /dashboard/students/import
type importResult struct {
	Imported int           `json:"imported"`
	Errors   []importError `json:"errors"`
}

type importError struct {
	Row   int    `json:"row"`
	Error string `json:"error"`
}

// decryptStudent decrypts the encrypted fields on a Student in-place.
func (h *Handler) decryptStudent(s *domain.Student) error {
	rfid, err := h.decryptOptional(s.RFIDTagID)
	if err != nil {
		return err
	}
	s.RFIDTagID = rfid

	notes, err := h.decryptOptional(s.MedicalNotes)
	if err != nil {
		return err
	}
	s.MedicalNotes = notes
	return nil
}

// ListMyStudents handles GET /dashboard/students
func (h *Handler) ListMyStudents(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)
	if limit <= 0 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}

	repo := repository.NewStudentRepo(h.pool)
	students, err := repo.List(r.Context(), orgID, limit, offset)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	for i := range students {
		if err := h.decryptStudent(&students[i]); err != nil {
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
	}

	JSON(w, http.StatusOK, students)
}

// CreateMyStudent handles POST /dashboard/students
func (h *Handler) CreateMyStudent(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	var req createStudentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SchoolID == "" || req.FirstName == "" || req.LastName == "" {
		Error(w, http.StatusBadRequest, "school_id, first_name, and last_name are required")
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}

	encRFID, err := h.encryptOptional(req.RFIDTagID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	var rfidHash *string
	if req.RFIDTagID != nil {
		hv := hashRFID(*req.RFIDTagID)
		rfidHash = &hv
	}
	encMedical, err := h.encryptOptional(req.MedicalNotes)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	repo := repository.NewStudentRepo(h.pool)
	student, err := repo.Create(r.Context(), orgID, req.SchoolID, req.FirstName, req.LastName,
		req.StudentNumber, req.Grade, encRFID, rfidHash, req.Address, req.City, req.State, req.Zip,
		req.Lat, req.Lng, req.Status, encMedical)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := h.decryptStudent(student); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusCreated, student)
}

// GetMyStudent handles GET /dashboard/students/{id}
func (h *Handler) GetMyStudent(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")
	repo := repository.NewStudentRepo(h.pool)
	student, err := repo.Get(r.Context(), id, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "student not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := h.decryptStudent(student); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, student)
}

// UpdateMyStudent handles PATCH /dashboard/students/{id}
func (h *Handler) UpdateMyStudent(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")
	var req updateStudentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	encRFID, err := h.encryptOptional(req.RFIDTagID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	var rfidHash *string
	if req.RFIDTagID != nil {
		hv := hashRFID(*req.RFIDTagID)
		rfidHash = &hv
	}
	encMedical, err := h.encryptOptional(req.MedicalNotes)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	repo := repository.NewStudentRepo(h.pool)
	student, err := repo.Update(r.Context(), id, orgID,
		req.SchoolID, req.FirstName, req.LastName, req.StudentNumber, req.Grade,
		encRFID, rfidHash, req.Address, req.City, req.State, req.Zip,
		req.Lat, req.Lng, req.Status, encMedical)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "student not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if err := h.decryptStudent(student); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, student)
}

// DeleteMyStudent handles DELETE /dashboard/students/{id}
func (h *Handler) DeleteMyStudent(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")

	repo := repository.NewStudentRepo(h.pool)
	if err := repo.Delete(r.Context(), id, orgID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "student not found")
			return
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			Error(w, http.StatusConflict, "student has associated records and cannot be deleted")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	NoContent(w)
}

// ImportStudents handles POST /dashboard/students/import
func (h *Handler) ImportStudents(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	r.Body = http.MaxBytesReader(w, r.Body, 10<<20) // 10 MB limit
	reader := csv.NewReader(r.Body)

	headerRow, err := reader.Read()
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			Error(w, http.StatusRequestEntityTooLarge, "CSV file too large (max 10MB)")
			return
		}
		Error(w, http.StatusBadRequest, "failed to read CSV headers")
		return
	}

	headers := make(map[string]int, len(headerRow))
	for i, h := range headerRow {
		headers[strings.TrimSpace(h)] = i
	}

	requiredCols := []string{"first_name", "last_name", "school_id"}
	for _, col := range requiredCols {
		if _, ok := headers[col]; !ok {
			Error(w, http.StatusBadRequest, fmt.Sprintf("missing required CSV column: %s", col))
			return
		}
	}

	repo := repository.NewStudentRepo(h.pool)
	result := importResult{
		Errors: make([]importError, 0),
	}

	rowNum := 1
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				Error(w, http.StatusRequestEntityTooLarge, "CSV file too large (max 10MB)")
				return
			}
			break // CSV parse error — stop processing
		}
		rowNum++

		firstName := getCSVField(record, headers, "first_name")
		lastName := getCSVField(record, headers, "last_name")
		schoolID := getCSVField(record, headers, "school_id")

		if firstName == "" || lastName == "" || schoolID == "" {
			result.Errors = append(result.Errors, importError{
				Row:   rowNum,
				Error: "first_name, last_name, and school_id are required",
			})
			continue
		}

		rfidTagID := getCSVFieldPtr(record, headers, "rfid_tag_id")
		medicalNotes := getCSVFieldPtr(record, headers, "medical_notes")

		encRFID, err := h.encryptOptional(rfidTagID)
		if err != nil {
			result.Errors = append(result.Errors, importError{
				Row:   rowNum,
				Error: "failed to encrypt rfid_tag_id",
			})
			continue
		}
		var rfidHash *string
		if rfidTagID != nil {
			hv := hashRFID(*rfidTagID)
			rfidHash = &hv
		}
		encMedical, err := h.encryptOptional(medicalNotes)
		if err != nil {
			result.Errors = append(result.Errors, importError{
				Row:   rowNum,
				Error: "failed to encrypt medical_notes",
			})
			continue
		}

		studentNumber := getCSVFieldPtr(record, headers, "student_number")
		grade := getCSVFieldPtr(record, headers, "grade")
		address := getCSVFieldPtr(record, headers, "address")
		city := getCSVFieldPtr(record, headers, "city")
		state := getCSVFieldPtr(record, headers, "state")
		zip := getCSVFieldPtr(record, headers, "zip")

		_, err = repo.Create(r.Context(), orgID, schoolID, firstName, lastName,
			studentNumber, grade, encRFID, rfidHash, address, city, state, zip,
			nil, nil, "active", encMedical)
		if err != nil {
			var pgErr *pgconn.PgError
			var rowErrMsg string
			if errors.As(err, &pgErr) {
				switch pgErr.Code {
				case "23503":
					rowErrMsg = "invalid school_id"
				case "23505":
					rowErrMsg = "duplicate student_number or rfid_tag_id"
				default:
					rowErrMsg = "database error"
				}
			} else {
				rowErrMsg = "database error"
			}
			result.Errors = append(result.Errors, importError{Row: rowNum, Error: rowErrMsg})
			continue
		}

		result.Imported++
	}

	JSON(w, http.StatusOK, result)
}

func getCSVField(record []string, headers map[string]int, name string) string {
	if idx, ok := headers[name]; ok && idx < len(record) {
		return strings.TrimSpace(record[idx])
	}
	return ""
}

func getCSVFieldPtr(record []string, headers map[string]int, name string) *string {
	v := getCSVField(record, headers, name)
	if v == "" {
		return nil
	}
	return &v
}
