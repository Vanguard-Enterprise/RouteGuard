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
	Trip    *domain.Trip                       `json:"trip"`
	Route   *domain.Route                      `json:"route"`
	Stops   []repository.StopWithStudents      `json:"stops"`
	Vehicle *domain.Vehicle                    `json:"vehicle"`
	Driver  *domain.Driver                     `json:"driver"`
}

// recordLocationRequest is the request body for POST /api/v1/trips/{id}/location.
type recordLocationRequest struct {
	Lat        float64  `json:"lat"`
	Lng        float64  `json:"lng"`
	Speed      *float64 `json:"speed"`
	Heading    *float64 `json:"heading"`
	RecordedAt *string  `json:"recorded_at"` // optional RFC3339; defaults to NOW() in the DB
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
		Error(w, http.StatusInternalServerError, "internal server error")
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
	_ = h.cache.Set(r.Context(), "trip:manifest:"+trip.ID, manifest, 12*time.Hour)

	JSON(w, http.StatusCreated, manifest)
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

	// Remove cached manifest from Redis.
	_ = h.cache.Del(r.Context(), "trip:manifest:"+tripID)

	// Resolve route_id from the route_assignment.
	var routeID string
	_ = h.pool.QueryRow(r.Context(),
		"SELECT route_id FROM route_assignments WHERE id = $1",
		trip.RouteAssignmentID,
	).Scan(&routeID)

	boardedCount, _ := tripDeviceRepo.CountBoardings(r.Context(), tripID)
	totalStudents, _ := tripDeviceRepo.CountRouteStudents(r.Context(), routeID)

	reportRepo := repository.NewReportRepo(h.pool)
	summary, _ := reportRepo.UpsertSummary(r.Context(), session.OrgID, routeID, trip.Date,
		totalStudents, boardedCount, true, nil, nil)

	JSON(w, http.StatusOK, map[string]any{
		"trip":    trip,
		"summary": summary,
	})
}
