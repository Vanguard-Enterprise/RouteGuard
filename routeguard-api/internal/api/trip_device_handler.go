package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
	"github.com/routeguard/api/internal/tripauth"
)

// TripManifest is the full trip manifest returned on trip start.
// It bundles all data the device needs to run an active trip.
type TripManifest struct {
	Trip    *domain.Trip                  `json:"trip"`
	Route   *domain.Route                 `json:"route"`
	Stops   []repository.StopWithStudents `json:"stops"`
	Vehicle *domain.Vehicle               `json:"vehicle"`
	Driver  *domain.Driver                `json:"driver"`
}

// endTripResponse is returned by EndTrip. Summary is omitted if computation fails.
type endTripResponse struct {
	Trip    *domain.Trip         `json:"trip"`
	Summary *domain.DailySummary `json:"summary,omitempty"`
}

// recordLocationRequest is the request body for POST /api/v1/trips/{id}/location.
type recordLocationRequest struct {
	Lat     float64  `json:"lat"`
	Lng     float64  `json:"lng"`
	Speed   *float64 `json:"speed"`
	Heading *float64 `json:"heading"`
}

// StartTrip handles POST /api/v1/trips/start.
// Requires trip session auth. Finds the active route assignment for the driver+vehicle
// pair, creates the trip, loads the full manifest, caches it, and returns it.
func (h *Handler) StartTrip(w http.ResponseWriter, r *http.Request) {
	session := tripauth.TripSessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// 1. Load device to get VehicleID.
	deviceRepo := repository.NewDeviceRepo(h.pool)
	device, err := deviceRepo.FindByIDAndCache(r.Context(), session.DeviceID, h.cache)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusUnauthorized, "unauthorized")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	if device.VehicleID == nil {
		Error(w, http.StatusBadRequest, "device has no assigned vehicle")
		return
	}

	// 2. Find active route assignment for this driver+vehicle+org.
	tripDeviceRepo := repository.NewTripDeviceRepo(h.pool)
	assignment, err := tripDeviceRepo.FindActiveAssignment(r.Context(), session.DriverID, *device.VehicleID, session.OrgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "no active route assignment found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	// 3. Create the trip (status=in_progress, started_at=NOW()).
	trip, err := tripDeviceRepo.StartTrip(r.Context(), session.OrgID, assignment.ID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusConflict, "route assignment no longer active")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	// 4. Load manifest components.
	routeRepo := repository.NewRouteRepo(h.pool)
	route, err := routeRepo.Get(r.Context(), assignment.RouteID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	stopsWithStudents, err := tripDeviceRepo.ListStopsWithStudents(r.Context(), assignment.RouteID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	vehicleRepo := repository.NewVehicleRepo(h.pool)
	vehicle, err := vehicleRepo.Get(r.Context(), *device.VehicleID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	driverRepo := repository.NewDriverRepo(h.pool)
	driver, err := driverRepo.FindByIDAndOrg(r.Context(), session.DriverID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	manifest := TripManifest{
		Trip:    trip,
		Route:   route,
		Stops:   stopsWithStudents,
		Vehicle: vehicle,
		Driver:  driver,
	}

	// 5. Cache manifest in Redis: "trip:manifest:{trip_id}" TTL=12h.
	// Non-fatal: device has manifest in response body. A cache failure degrades
	// live-tracking features but does not prevent the trip from proceeding.
	if err := h.cache.Set(r.Context(), "trip:manifest:"+trip.ID, manifest, 12*time.Hour); err != nil {
		_ = err // cache miss is non-fatal; caller receives manifest in response body
	}

	JSON(w, http.StatusCreated, manifest)
}

// assignmentPreviewResponse is returned by GetAssignment.
type assignmentPreviewResponse struct {
	RouteName   string `json:"route_name"`
	RouteType   string `json:"route_type"`
	StopCount   int    `json:"stop_count"`
	VehicleName string `json:"vehicle_name"`
	Date        string `json:"date"`
}

// GetAssignment handles GET /api/v1/trips/assignment.
// Requires trip session auth. Returns the driver's active route assignment preview
// without creating a trip. Returns 404 if no active assignment exists.
func (h *Handler) GetAssignment(w http.ResponseWriter, r *http.Request) {
	session := tripauth.TripSessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	deviceRepo := repository.NewDeviceRepo(h.pool)
	device, err := deviceRepo.FindByIDAndCache(r.Context(), session.DeviceID, h.cache)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusUnauthorized, "unauthorized")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	if device.VehicleID == nil {
		Error(w, http.StatusNotFound, "device has no assigned vehicle")
		return
	}

	tripDeviceRepo := repository.NewTripDeviceRepo(h.pool)
	assignment, err := tripDeviceRepo.FindActiveAssignment(r.Context(), session.DriverID, *device.VehicleID, session.OrgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "no active route assignment found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	routeRepo := repository.NewRouteRepo(h.pool)
	route, err := routeRepo.Get(r.Context(), assignment.RouteID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	stops, err := tripDeviceRepo.ListStopsWithStudents(r.Context(), assignment.RouteID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	vehicleRepo := repository.NewVehicleRepo(h.pool)
	vehicle, err := vehicleRepo.Get(r.Context(), *device.VehicleID, session.OrgID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, assignmentPreviewResponse{
		RouteName:   route.Name,
		RouteType:   route.Type,
		StopCount:   len(stops),
		VehicleName: vehicle.Name,
		Date:        time.Now().Format("2006-01-02"),
	})
}

// RecordLocation handles POST /api/v1/trips/{id}/location.
// Requires trip session auth. Records a GPS location for the trip and publishes
// a real-time event to the Redis pub/sub channel.
func (h *Handler) RecordLocation(w http.ResponseWriter, r *http.Request) {
	session := tripauth.TripSessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	tripID := chi.URLParam(r, "id")

	var req recordLocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Lat < -90 || req.Lat > 90 {
		Error(w, http.StatusBadRequest, "lat must be between -90 and 90")
		return
	}
	if req.Lng < -180 || req.Lng > 180 {
		Error(w, http.StatusBadRequest, "lng must be between -180 and 180")
		return
	}

	tripDeviceRepo := repository.NewTripDeviceRepo(h.pool)
	loc, err := tripDeviceRepo.InsertLocation(r.Context(), tripID, session.OrgID, req.Lat, req.Lng, req.Speed, req.Heading)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "trip not found")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	// Publish location update to Redis so live subscribers receive it.
	_ = h.cache.Publish(r.Context(), "trip:location:"+tripID, map[string]any{
		"trip_id":     tripID,
		"lat":         loc.Lat,
		"lng":         loc.Lng,
		"speed":       loc.Speed,
		"heading":     loc.Heading,
		"recorded_at": loc.RecordedAt,
	})

	NoContent(w)
}

// EndTrip handles POST /api/v1/trips/{id}/end.
// Requires trip session auth. Marks the trip completed, removes the cached manifest,
// and upserts a daily summary report.
func (h *Handler) EndTrip(w http.ResponseWriter, r *http.Request) {
	session := tripauth.TripSessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	tripID := chi.URLParam(r, "id")

	tripDeviceRepo := repository.NewTripDeviceRepo(h.pool)
	trip, err := tripDeviceRepo.CompleteTrip(r.Context(), tripID, session.OrgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "trip not found or not in progress")
		} else {
			Error(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}

	// Remove cached manifest from Redis (non-fatal).
	_ = h.cache.Del(r.Context(), "trip:manifest:"+tripID)

	// Compute and upsert daily summary. Failures are non-fatal — the trip is
	// already completed. Summary is omitted from the response if computation fails.
	var summary *domain.DailySummary
	routeID, routeErr := tripDeviceRepo.GetRouteIDForAssignment(r.Context(), trip.RouteAssignmentID)
	if routeErr == nil {
		boardedCount, err1 := tripDeviceRepo.CountBoardings(r.Context(), tripID)
		totalStudents, err2 := tripDeviceRepo.CountRouteStudents(r.Context(), routeID)
		if err1 == nil && err2 == nil {
			reportRepo := repository.NewReportRepo(h.pool)
			summary, _ = reportRepo.UpsertSummary(r.Context(), session.OrgID, routeID, trip.Date,
				totalStudents, boardedCount, true, nil, nil)
		}
	}

	JSON(w, http.StatusOK, endTripResponse{Trip: trip, Summary: summary})
}
