package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/autoplan"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

type createPlannerRunRequest struct {
	Mode          string `json:"mode"`
	ServiceWindow string `json:"service_window"`
}

type plannerStudent struct {
	StudentID string
	StopID    string
	Lat       float64
	Lng       float64
}

type plannerPair struct {
	DriverID  string
	VehicleID string
	Capacity  int
}

func (h *Handler) OrgCreatePlannerRun(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)

	var body createPlannerRunRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.Mode = strings.ToUpper(strings.TrimSpace(body.Mode))
	if body.Mode == "" {
		body.Mode = "FASTEST_TIME"
	}
	if body.Mode != "FASTEST_TIME" && body.Mode != "FEWEST_BUSES" {
		Error(w, http.StatusBadRequest, "mode must be FASTEST_TIME or FEWEST_BUSES")
		return
	}

	body.ServiceWindow = strings.ToUpper(strings.TrimSpace(body.ServiceWindow))
	if body.ServiceWindow == "" {
		body.ServiceWindow = "PM"
	}
	if body.ServiceWindow != "PM" {
		Error(w, http.StatusBadRequest, "service_window must be PM for v1")
		return
	}

	run, err := h.planner.CreateRun(ctx, &domain.PlannerRun{
		OrgID:         session.OrgID,
		Mode:          body.Mode,
		ServiceWindow: body.ServiceWindow,
		Status:        "draft",
		CreatedBy:     session.UserID,
	})
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create planner run")
		return
	}

	students, err := h.loadEligibleStudentsForPlanning(ctx, session.OrgID, body.ServiceWindow)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load students")
		return
	}
	pairs, err := h.loadEligiblePairsForPlanning(ctx, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load driver vehicle pairs")
		return
	}

	issues := make([]map[string]any, 0)
	if len(students) == 0 {
		issues = append(issues, map[string]any{"issue_type": "NO_STUDENTS", "severity": "warning", "message": "No eligible students found for planning."})
	}
	if len(pairs) == 0 {
		issues = append(issues, map[string]any{"issue_type": "NO_PAIRS", "severity": "error", "message": "No active available driver-vehicle pairs found."})
	}

	assignablePairs := choosePairs(body.Mode, pairs, len(students))
	if len(assignablePairs) == 0 && len(pairs) > 0 {
		assignablePairs = pairs
	}

	busSlots := make([]autoplan.BusSlot, 0, len(assignablePairs))
	vehicleToPair := make(map[string]plannerPair, len(assignablePairs))
	for _, pair := range assignablePairs {
		busSlots = append(busSlots, autoplan.BusSlot{VehicleID: pair.VehicleID, Capacity: pair.Capacity})
		vehicleToPair[pair.VehicleID] = pair
	}

	studentPoints := make([]autoplan.StudentPoint, 0, len(students))
	byStudent := make(map[string]plannerStudent, len(students))
	for _, s := range students {
		studentPoints = append(studentPoints, autoplan.StudentPoint{ID: s.StudentID, Lat: s.Lat, Lng: s.Lng})
		byStudent[s.StudentID] = s
	}

	groups := autoplan.ClusterStudents(studentPoints, busSlots)
	if len(groups) == 0 && len(students) > 0 {
		issues = append(issues, map[string]any{"issue_type": "NO_GROUPS", "severity": "error", "message": "Planner could not create route groups."})
	}

	if len(groups) > 0 {
		if err := h.persistPlannerRoutes(ctx, run, groups, byStudent, vehicleToPair, body.Mode, issues); err != nil {
			Error(w, http.StatusInternalServerError, "failed to persist planner routes")
			return
		}
	} else if len(issues) > 0 {
		if err := h.persistPlannerIssues(ctx, run.ID, issues); err != nil {
			Error(w, http.StatusInternalServerError, "failed to persist planner issues")
			return
		}
	}

	JSON(w, http.StatusCreated, map[string]any{
		"run": run,
		"issues": issues,
	})
}

func choosePairs(mode string, pairs []plannerPair, studentCount int) []plannerPair {
	if len(pairs) == 0 {
		return nil
	}
	sorted := make([]plannerPair, len(pairs))
	copy(sorted, pairs)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].Capacity == sorted[j].Capacity {
			return sorted[i].VehicleID < sorted[j].VehicleID
		}
		return sorted[i].Capacity > sorted[j].Capacity
	})

	if mode == "FEWEST_BUSES" {
		total := 0
		for i, pair := range sorted {
			total += pair.Capacity
			if total >= studentCount {
				return sorted[:i+1]
			}
		}
		return sorted
	}

	return sorted
}

func (h *Handler) persistPlannerRoutes(
	ctx context.Context,
	run *domain.PlannerRun,
	groups []autoplan.BusGroup,
	students map[string]plannerStudent,
	vehicleToPair map[string]plannerPair,
	mode string,
	issues []map[string]any,
) error {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	routeCount := 0
	for _, group := range groups {
		if len(group.StudentIDs) == 0 {
			continue
		}
		pair := vehicleToPair[group.VehicleID]
		routeCount++
		routeCode := repositoryBuildRouteCode(run.CreatedAt.Unix(), routeCount)

		assigned := len(group.StudentIDs)
		seatUtilization := 0.0
		if pair.Capacity > 0 {
			seatUtilization = (float64(assigned) / float64(pair.Capacity)) * 100
		}

		var routeID string
		if err := tx.QueryRow(ctx,
			`INSERT INTO routes (
			 org_id, planner_run_id, route_code, service_window, status, objective_mode, vehicle_id, driver_id,
			 estimated_travel_minutes, assigned_students, seat_utilization, unassigned_count
			 ) VALUES ($1,$2,$3,'PM','draft',$4,$5,$6,$7,$8,$9,$10)
			 RETURNING id`,
			run.OrgID, run.ID, routeCode, mode, pair.VehicleID, pair.DriverID,
			assigned*4, assigned, seatUtilization, len(group.Unassigned),
		).Scan(&routeID); err != nil {
			return fmt.Errorf("insert route: %w", err)
		}

		if _, err := tx.Exec(ctx,
			`INSERT INTO planner_run_routes (planner_run_id, route_id) VALUES ($1, $2)`,
			run.ID, routeID,
		); err != nil {
			return fmt.Errorf("insert planner_run_route: %w", err)
		}

		stopStudents := make(map[string][]string)
		for _, studentID := range group.StudentIDs {
			rec, ok := students[studentID]
			if !ok {
				continue
			}
			stopStudents[rec.StopID] = append(stopStudents[rec.StopID], studentID)
		}

		orderedStops := make([]string, 0, len(stopStudents))
		for stopID := range stopStudents {
			orderedStops = append(orderedStops, stopID)
		}

		opt := make([]autoplan.StudentPoint, 0, len(orderedStops))
		for _, stopID := range orderedStops {
			studentID := stopStudents[stopID][0]
			rec := students[studentID]
			opt = append(opt, autoplan.StudentPoint{ID: stopID, Lat: rec.Lat, Lng: rec.Lng})
		}
		if mode == "FASTEST_TIME" && h.cfg.MapboxAccessToken != "" {
			optimized, err := autoplan.OptimizeStops(ctx, h.cfg.MapboxAccessToken, opt)
			if err == nil && len(optimized) == len(opt) {
				orderedStops = orderedStops[:0]
				for _, p := range optimized {
					orderedStops = append(orderedStops, p.ID)
				}
			}
		}

		for i, stopID := range orderedStops {
			studentsAtStop := stopStudents[stopID]
			if _, err := tx.Exec(ctx,
				`INSERT INTO route_stops (route_id, stop_id, stop_order, eta_minutes, student_count)
				 VALUES ($1, $2, $3, $4, $5)`,
				routeID, stopID, i+1, (i+1)*6, len(studentsAtStop),
			); err != nil {
				return fmt.Errorf("insert route stop: %w", err)
			}
			for _, studentID := range studentsAtStop {
				if _, err := tx.Exec(ctx,
					`INSERT INTO route_students (route_id, student_id, stop_id, stop_order)
					 VALUES ($1, $2, $3, $4)`,
					routeID, studentID, stopID, i+1,
				); err != nil {
					return fmt.Errorf("insert route student: %w", err)
				}
			}
		}

		if len(group.Unassigned) > 0 {
			issues = append(issues, map[string]any{
				"issue_type": "UNASSIGNED_STUDENTS",
				"severity": "warning",
				"message": fmt.Sprintf("%d students could not be assigned due to capacity constraints.", len(group.Unassigned)),
				"metadata": map[string]any{"route_code": routeCode},
			})
		}
	}

	if len(issues) > 0 {
		for _, issue := range issues {
			metadataBytes, _ := json.Marshal(issue["metadata"])
			if _, err := tx.Exec(ctx,
				`INSERT INTO planner_run_issues (planner_run_id, issue_type, severity, message, metadata)
				 VALUES ($1, $2, $3, $4, $5::jsonb)`,
				run.ID,
				fmt.Sprint(issue["issue_type"]),
				fmt.Sprint(issue["severity"]),
				fmt.Sprint(issue["message"]),
				string(metadataBytes),
			); err != nil {
				return fmt.Errorf("insert planner issue: %w", err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit planner routes: %w", err)
	}
	return nil
}

func (h *Handler) persistPlannerIssues(ctx context.Context, runID string, issues []map[string]any) error {
	for _, issue := range issues {
		metadataBytes, _ := json.Marshal(issue["metadata"])
		if _, err := h.pool.Exec(ctx,
			`INSERT INTO planner_run_issues (planner_run_id, issue_type, severity, message, metadata)
			 VALUES ($1, $2, $3, $4, $5::jsonb)`,
			runID,
			fmt.Sprint(issue["issue_type"]),
			fmt.Sprint(issue["severity"]),
			fmt.Sprint(issue["message"]),
			string(metadataBytes),
		); err != nil {
			return fmt.Errorf("insert planner issue: %w", err)
		}
	}
	return nil
}

func repositoryBuildRouteCode(ts int64, idx int) string {
	return "PM-" + strconv.FormatInt(ts, 10) + "-" + strconv.Itoa(idx)
}

func (h *Handler) loadEligibleStudentsForPlanning(ctx context.Context, orgID, serviceWindow string) ([]plannerStudent, error) {
	rows, err := h.pool.Query(ctx,
		`SELECT s.id, a.stop_id, st.latitude, st.longitude
		 FROM students s
		 JOIN student_stop_assignments a ON a.student_id = s.id AND a.org_id = s.org_id AND a.deleted_at IS NULL AND a.is_active = true
		 JOIN stops st ON st.id = a.stop_id AND st.org_id = a.org_id AND st.deleted_at IS NULL AND st.is_active = true
		 WHERE s.org_id = $1 AND s.deleted_at IS NULL AND s.is_active = true AND a.service_window = $2`,
		orgID, serviceWindow,
	)
	if err != nil {
		return nil, fmt.Errorf("query students: %w", err)
	}
	defer rows.Close()

	items := make([]plannerStudent, 0)
	for rows.Next() {
		var p plannerStudent
		if err := rows.Scan(&p.StudentID, &p.StopID, &p.Lat, &p.Lng); err != nil {
			return nil, fmt.Errorf("scan student: %w", err)
		}
		items = append(items, p)
	}
	return items, nil
}

func (h *Handler) loadEligiblePairsForPlanning(ctx context.Context, orgID string) ([]plannerPair, error) {
	rows, err := h.pool.Query(ctx,
		`SELECT a.driver_id, a.vehicle_id, v.capacity
		 FROM driver_vehicle_assignments a
		 JOIN drivers d ON d.id = a.driver_id AND d.org_id = a.org_id
		 JOIN vehicles v ON v.id = a.vehicle_id AND v.org_id = a.org_id
		 WHERE a.org_id = $1
		   AND a.deleted_at IS NULL
		   AND a.is_active = true
		   AND d.deleted_at IS NULL
		   AND d.is_active = true
		   AND d.is_available = true
		   AND v.deleted_at IS NULL
		   AND v.is_active = true`,
		orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("query pairs: %w", err)
	}
	defer rows.Close()

	items := make([]plannerPair, 0)
	for rows.Next() {
		var p plannerPair
		if err := rows.Scan(&p.DriverID, &p.VehicleID, &p.Capacity); err != nil {
			return nil, fmt.Errorf("scan pair: %w", err)
		}
		items = append(items, p)
	}
	return items, nil
}

func (h *Handler) OrgListPlannerRuns(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))

	items, total, err := h.planner.ListByOrg(ctx, session.OrgID, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list planner runs")
		return
	}

	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	totalPages := (total + perPage - 1) / perPage
	JSON(w, http.StatusOK, domain.PageResponse[domain.PlannerRun]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: totalPages,
	})
}

func (h *Handler) OrgGetPlannerRun(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	run, err := h.planner.GetByID(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "planner run not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to get planner run")
		return
	}

	routes, _, err := h.routes.ListByOrg(ctx, session.OrgID, "", 1, 500)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load run routes")
		return
	}
	filteredRoutes := make([]domain.Route, 0)
	for _, route := range routes {
		if route.PlannerRunID == run.ID {
			filteredRoutes = append(filteredRoutes, route)
		}
	}

	issueRows, err := h.pool.Query(ctx,
		`SELECT id, issue_type, severity, message, metadata, created_at
		 FROM planner_run_issues
		 WHERE planner_run_id = $1
		 ORDER BY created_at`,
		run.ID,
	)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load run issues")
		return
	}
	defer issueRows.Close()

	issues := make([]map[string]any, 0)
	for issueRows.Next() {
		var id, issueType, severity, message string
		var metadata []byte
		var createdAt time.Time
		if err := issueRows.Scan(&id, &issueType, &severity, &message, &metadata, &createdAt); err != nil {
			Error(w, http.StatusInternalServerError, "failed to scan run issues")
			return
		}
		issues = append(issues, map[string]any{
			"id": id,
			"issue_type": issueType,
			"severity": severity,
			"message": message,
			"metadata": json.RawMessage(metadata),
			"created_at": createdAt,
		})
	}

	JSON(w, http.StatusOK, map[string]any{
		"run": run,
		"routes": filteredRoutes,
		"issues": issues,
	})
}

func (h *Handler) OrgPublishPlannerRun(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	session := middleware.SessionFromContext(ctx)
	id := chi.URLParam(r, "id")

	run, err := h.planner.PublishRun(ctx, session.OrgID, id)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "planner run not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to publish planner run")
		return
	}
	JSON(w, http.StatusOK, run)
}

var _ = pgx.ErrNoRows
