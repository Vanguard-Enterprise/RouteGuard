package api

import (
	"net/http"
	"strconv"
	"time"
)

func (h *Handler) PlatformListAudit(w http.ResponseWriter, r *http.Request) {
	cursorStr := r.URL.Query().Get("cursor")
	limitStr := r.URL.Query().Get("limit")
	eventType := r.URL.Query().Get("event_type")
	actorID := r.URL.Query().Get("actor_id")
	startStr := r.URL.Query().Get("start_date")
	endStr := r.URL.Query().Get("end_date")

	limit, _ := strconv.Atoi(limitStr)

	var cursor *time.Time
	if cursorStr != "" {
		t, err := time.Parse(time.RFC3339Nano, cursorStr)
		if err == nil {
			cursor = &t
		}
	}

	var startDate, endDate *time.Time
	if startStr != "" {
		t, err := time.Parse(time.RFC3339, startStr)
		if err != nil {
			t, err = time.Parse("2006-01-02", startStr)
		}
		if err == nil {
			startDate = &t
		}
	}
	if endStr != "" {
		t, err := time.Parse(time.RFC3339, endStr)
		if err != nil {
			t, err = time.Parse("2006-01-02", endStr)
			if err == nil {
				// End of day
				t = t.Add(24*time.Hour - time.Nanosecond)
			}
		}
		if err == nil {
			endDate = &t
		}
	}

	result, err := h.audit.List(r.Context(), cursor, limit, eventType, actorID, startDate, endDate)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list audit events")
		return
	}
	JSON(w, http.StatusOK, result)
}
