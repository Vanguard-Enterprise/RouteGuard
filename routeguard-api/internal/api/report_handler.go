package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/repository"
)

type upsertSummaryRequest struct {
	RouteID       string  `json:"route_id"`
	Date          string  `json:"date"` // ISO-8601 YYYY-MM-DD
	TotalStudents int     `json:"total_students"`
	BoardedCount  int     `json:"boarded_count"`
	OnTime        bool    `json:"on_time"`
	DelayMinutes  *int    `json:"delay_minutes"`
	Notes         *string `json:"notes"`
}

// ListDailySummaries handles GET /dashboard/reports/daily-summaries
func (h *Handler) ListDailySummaries(w http.ResponseWriter, r *http.Request) {
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
	if offset < 0 {
		offset = 0
	}

	var routeIDFilter *string
	if v := r.URL.Query().Get("route_id"); v != "" {
		routeIDFilter = &v
	}

	var dateFromFilter *string
	if v := r.URL.Query().Get("date_from"); v != "" {
		if _, err := time.Parse("2006-01-02", v); err != nil {
			Error(w, http.StatusBadRequest, "date_from must be in YYYY-MM-DD format")
			return
		}
		dateFromFilter = &v
	}

	var dateToFilter *string
	if v := r.URL.Query().Get("date_to"); v != "" {
		if _, err := time.Parse("2006-01-02", v); err != nil {
			Error(w, http.StatusBadRequest, "date_to must be in YYYY-MM-DD format")
			return
		}
		dateToFilter = &v
	}

	repo := repository.NewReportRepo(h.pool)
	summaries, err := repo.ListSummaries(r.Context(), orgID, limit, offset, routeIDFilter, dateFromFilter, dateToFilter)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, summaries)
}

// UpsertDailySummary handles POST /dashboard/reports/daily-summaries
func (h *Handler) UpsertDailySummary(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	var req upsertSummaryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RouteID == "" {
		Error(w, http.StatusBadRequest, "route_id is required")
		return
	}
	if req.Date == "" {
		Error(w, http.StatusBadRequest, "date is required")
		return
	}

	t, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		Error(w, http.StatusBadRequest, "date must be in YYYY-MM-DD format")
		return
	}
	date := pgtype.Date{Time: t, Valid: true}

	repo := repository.NewReportRepo(h.pool)
	summary, err := repo.UpsertSummary(r.Context(), orgID, req.RouteID, date, req.TotalStudents, req.BoardedCount, req.OnTime, req.DelayMinutes, req.Notes)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, summary)
}

// GetDailySummary handles GET /dashboard/reports/daily-summaries/{id}
func (h *Handler) GetDailySummary(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	orgID := session.OrgID

	id := chi.URLParam(r, "id")
	repo := repository.NewReportRepo(h.pool)
	summary, err := repo.GetSummary(r.Context(), id, orgID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "daily summary not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, summary)
}
