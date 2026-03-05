package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/rs/zerolog/log"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/autoplan"
	"github.com/routeguard/api/internal/repository"
)

type autoPlanRequest struct {
	Date     string  `json:"date"`      // YYYY-MM-DD
	Type     string  `json:"type"`      // morning | afternoon | midday
	SchoolID *string `json:"school_id"` // optional: filter and use as fixed waypoint
}

type autoPlanStop struct {
	Order      int      `json:"order"`
	Lat        float64  `json:"lat"`
	Lng        float64  `json:"lng"`
	Address    *string  `json:"address"`
	StudentIDs []string `json:"student_ids"`
}

type autoPlanBus struct {
	VehicleID     string         `json:"vehicle_id"`
	VehicleNumber *string        `json:"vehicle_number"`
	Stops         []autoPlanStop `json:"stops"`
}

type autoPlanResponse struct {
	Buses              []autoPlanBus `json:"buses"`
	UnassignedStudents []string      `json:"unassigned_students"`
	SchoolLat          *float64      `json:"school_lat,omitempty"`
	SchoolLng          *float64      `json:"school_lng,omitempty"`
	SchoolName         *string       `json:"school_name,omitempty"`
}

// AutoPlanTrips handles POST /dashboard/trips/auto-plan
// Returns a computed plan (does not persist anything).
func (h *Handler) AutoPlanTrips(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	var req autoPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Date == "" {
		Error(w, http.StatusBadRequest, "date is required")
		return
	}
	if _, err := time.Parse("2006-01-02", req.Date); err != nil {
		Error(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}

	// Fetch active students with geocoords
	studentRepo := repository.NewStudentRepo(h.pool)
	students, err := studentRepo.ListWithCoords(r.Context(), orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Fetch active vehicles with capacity
	vehicleRepo := repository.NewVehicleRepo(h.pool)
	vehicles, err := vehicleRepo.ListActive(r.Context(), orgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Fetch school coordinates if provided
	var schoolLat, schoolLng *float64
	var schoolName *string
	if req.SchoolID != nil && *req.SchoolID != "" {
		var slat, slng float64
		var sname string
		err := h.pool.QueryRow(r.Context(), `
			SELECT name, lat, lng FROM schools WHERE id = $1 AND org_id = $2
		`, *req.SchoolID, orgID).Scan(&sname, &slat, &slng)
		if err == nil {
			schoolLat = &slat
			schoolLng = &slng
			schoolName = &sname
		} else if !errors.Is(err, pgx.ErrNoRows) {
			log.Warn().Err(err).Msg("failed to fetch school for auto-plan")
		}
	}

	// Build autoplan inputs
	pts := make([]autoplan.StudentPoint, 0, len(students))
	addrByID := make(map[string]*string)
	for _, s := range students {
		if s.Lat != nil && s.Lng != nil {
			pts = append(pts, autoplan.StudentPoint{ID: s.ID, Lat: *s.Lat, Lng: *s.Lng})
			addrByID[s.ID] = s.Address
		}
	}

	buses := make([]autoplan.BusSlot, 0, len(vehicles))
	vInfoByID := make(map[string]*string)
	for _, v := range vehicles {
		cap := 30 // default if not set
		if v.Capacity != nil {
			cap = *v.Capacity
		}
		buses = append(buses, autoplan.BusSlot{VehicleID: v.ID, Capacity: cap})
		vInfoByID[v.ID] = v.Number
	}

	groups := autoplan.ClusterStudents(pts, buses)

	// Optimize stop order per bus
	resp := autoPlanResponse{
		Buses:              make([]autoPlanBus, 0, len(groups)),
		UnassignedStudents: []string{},
	}

	mapboxToken := h.cfg.MapboxSecretToken
	hasSchool := schoolLat != nil && schoolLng != nil
	schoolPoint := autoplan.StudentPoint{ID: "_school"}
	if hasSchool {
		schoolPoint.Lat = *schoolLat
		schoolPoint.Lng = *schoolLng
	}

	for _, g := range groups {
		ptsToOptimize := g.Points

		if hasSchool {
			if req.Type == "afternoon" || req.Type == "midday" {
				// school is the origin: prepend
				ptsToOptimize = append([]autoplan.StudentPoint{schoolPoint}, g.Points...)
			} else {
				// school is the destination: append
				tmp := make([]autoplan.StudentPoint, len(g.Points), len(g.Points)+1)
				copy(tmp, g.Points)
				ptsToOptimize = append(tmp, schoolPoint)
			}
		}

		ordered, _ := autoplan.OptimizeStops(r.Context(), mapboxToken, ptsToOptimize)

		// Strip the school point from the result before building stops
		if hasSchool {
			filtered := make([]autoplan.StudentPoint, 0, len(ordered))
			for _, p := range ordered {
				if p.ID != "_school" {
					filtered = append(filtered, p)
				}
			}
			ordered = filtered
		}

		stops := make([]autoPlanStop, 0, len(ordered))
		for i, pt := range ordered {
			stop := autoPlanStop{
				Order:      i + 1,
				Lat:        pt.Lat,
				Lng:        pt.Lng,
				Address:    addrByID[pt.ID],
				StudentIDs: []string{pt.ID},
			}
			stops = append(stops, stop)
		}
		resp.Buses = append(resp.Buses, autoPlanBus{
			VehicleID:     g.VehicleID,
			VehicleNumber: vInfoByID[g.VehicleID],
			Stops:         stops,
		})
		for _, u := range g.Unassigned {
			resp.UnassignedStudents = append(resp.UnassignedStudents, u.ID)
		}
	}

	resp.SchoolLat = schoolLat
	resp.SchoolLng = schoolLng
	resp.SchoolName = schoolName

	JSON(w, http.StatusOK, resp)
}

type confirmStop struct {
	Order      int      `json:"order"`
	Lat        float64  `json:"lat"`
	Lng        float64  `json:"lng"`
	Address    *string  `json:"address"`
	StudentIDs []string `json:"student_ids"`
}

type confirmBus struct {
	VehicleID string        `json:"vehicle_id"`
	Stops     []confirmStop `json:"stops"`
}

type autoPlanConfirmRequest struct {
	Date     string       `json:"date"`      // YYYY-MM-DD
	Type     string       `json:"type"`      // morning | afternoon | midday
	Buses    []confirmBus `json:"buses"`
	SchoolID *string      `json:"school_id"` // optional: persisted on each created route
}

// AutoPlanConfirm handles POST /dashboard/trips/auto-plan/confirm
// Creates all routes, stops, student_stops, route_assignments, and trips atomically.
func (h *Handler) AutoPlanConfirm(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	var req autoPlanConfirmRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Date == "" || len(req.Buses) == 0 {
		Error(w, http.StatusBadRequest, "date and buses are required")
		return
	}
	t, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		Error(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}

	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	defer tx.Rollback(ctx)

	dayOfWeek := t.Weekday().String()[:3] // "Mon", "Tue", etc.
	pgDate := pgtype.Date{Time: t, Valid: true}

	type createdTrip struct {
		ID string `json:"id"`
	}
	var trips []createdTrip

	for _, bus := range req.Buses {
		// 1. Get vehicle number for the route name
		var vehicleNumber *string
		_ = tx.QueryRow(ctx, `SELECT number FROM vehicles WHERE id = $1`, bus.VehicleID).Scan(&vehicleNumber)
		busLabel := bus.VehicleID[:8]
		if vehicleNumber != nil {
			busLabel = "Bus " + *vehicleNumber
		}
		routeName := req.Type + " - " + busLabel + " - " + req.Date

		// 2. Create route
		var routeID string
		err = tx.QueryRow(ctx, `
			INSERT INTO routes (id, org_id, name, type, status, school_id, created_at, updated_at)
			VALUES (gen_random_uuid(), $1, $2, $3, 'active', $4, now(), now())
			RETURNING id
		`, orgID, routeName, req.Type, req.SchoolID).Scan(&routeID)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to create route")
			return
		}

		// 3. Create stops and student_stops
		for _, stop := range bus.Stops {
			var stopID string
			addr := ""
			if stop.Address != nil {
				addr = *stop.Address
			}
			err = tx.QueryRow(ctx, `
				INSERT INTO stops (id, route_id, name, address, lat, lng, sequence_order, created_at, updated_at)
				VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())
				RETURNING id
			`, routeID, addr, addr, stop.Lat, stop.Lng, stop.Order).Scan(&stopID)
			if err != nil {
				Error(w, http.StatusInternalServerError, "failed to create stop")
				return
			}
			for _, studentID := range stop.StudentIDs {
				_, err = tx.Exec(ctx, `
					INSERT INTO student_stops (id, student_id, stop_id, route_id, effective_date)
					VALUES (gen_random_uuid(), $1, $2, $3, $4)
				`, studentID, stopID, routeID, pgDate)
				if err != nil {
					Error(w, http.StatusInternalServerError, "failed to create student stop")
					return
				}
			}
		}

		// 4. Create route_assignment (driver_id nullable after migration 011)
		var assignmentID string
		err = tx.QueryRow(ctx, `
			INSERT INTO route_assignments (id, route_id, vehicle_id, driver_id, effective_date, days_of_week, created_at)
			VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())
			RETURNING id
		`, routeID, bus.VehicleID, nil, pgDate, dayOfWeek).Scan(&assignmentID)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to create assignment")
			return
		}

		// 5. Create trip
		var tripID string
		err = tx.QueryRow(ctx, `
			INSERT INTO trips (id, route_assignment_id, org_id, date, status, created_at)
			VALUES (gen_random_uuid(), $1, $2, $3, 'scheduled', now())
			RETURNING id
		`, assignmentID, orgID, pgDate).Scan(&tripID)
		if err != nil {
			Error(w, http.StatusInternalServerError, "failed to create trip")
			return
		}
		trips = append(trips, createdTrip{ID: tripID})
	}

	if err := tx.Commit(ctx); err != nil {
		Error(w, http.StatusInternalServerError, "failed to commit")
		return
	}

	JSON(w, http.StatusCreated, map[string]any{"trips": trips})
}
