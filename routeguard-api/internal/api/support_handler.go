package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/middleware"
)

const supportEventsChannel = "support:events"

var validSupportStatuses = map[string]bool{
	"open":        true,
	"in_progress": true,
	"waiting":     true,
	"resolved":    true,
}

type supportEvent struct {
	Type       string    `json:"type"`
	TicketID   string    `json:"ticket_id"`
	OrgID      string    `json:"org_id"`
	Status     *string   `json:"status,omitempty"`
	MessageID  *string   `json:"message_id,omitempty"`
	OccurredAt time.Time `json:"occurred_at"`
}

func isValidSupportStatus(status string) bool {
	return validSupportStatuses[status]
}

func writeSSEEvent(w http.ResponseWriter, event supportEvent) bool {
	data, err := json.Marshal(event)
	if err != nil {
		return false
	}
	if _, err := w.Write([]byte("data: ")); err != nil {
		return false
	}
	if _, err := w.Write(data); err != nil {
		return false
	}
	if _, err := w.Write([]byte("\n\n")); err != nil {
		return false
	}
	return true
}

func (h *Handler) publishSupportEvent(ctx *http.Request, event supportEvent) {
	_ = h.cache.Publish(ctx.Context(), supportEventsChannel, event)
}

func (h *Handler) OrgListSupportTickets(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	status := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("status")))
	if status != "" && !isValidSupportStatus(status) {
		Error(w, http.StatusBadRequest, "invalid status")
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	items, total, err := h.support.ListOrgTickets(r.Context(), session.OrgID, status, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list support tickets")
		return
	}
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	JSON(w, http.StatusOK, domain.PageResponse[domain.SupportTicket]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: (total + perPage - 1) / perPage,
	})
}

func (h *Handler) OrgCreateSupportTicket(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())

	var body struct {
		Subject string `json:"subject"`
		Body    string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	body.Subject = strings.TrimSpace(body.Subject)
	body.Body = strings.TrimSpace(body.Body)
	if body.Subject == "" {
		Error(w, http.StatusBadRequest, "subject is required")
		return
	}
	if body.Body == "" {
		Error(w, http.StatusBadRequest, "body is required")
		return
	}

	ticket, msg, err := h.support.CreateTicketWithInitialMessage(r.Context(), session.OrgID, session.UserID, body.Subject, body.Body)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create support ticket")
		return
	}

	msgID := msg.ID
	status := ticket.Status
	h.publishSupportEvent(r, supportEvent{
		Type:       "ticket_created",
		TicketID:   ticket.ID,
		OrgID:      ticket.OrgID,
		Status:     &status,
		MessageID:  &msgID,
		OccurredAt: time.Now().UTC(),
	})

	JSON(w, http.StatusCreated, map[string]any{
		"ticket":  ticket,
		"message": msg,
	})
}

func (h *Handler) OrgGetSupportTicket(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	ticketID := chi.URLParam(r, "id")
	ticket, err := h.support.GetOrgTicketByID(r.Context(), session.OrgID, ticketID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "support ticket not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to fetch support ticket")
		return
	}
	JSON(w, http.StatusOK, ticket)
}

func (h *Handler) OrgListSupportMessages(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	ticketID := chi.URLParam(r, "id")
	if _, err := h.support.GetOrgTicketByID(r.Context(), session.OrgID, ticketID); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "support ticket not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to fetch support ticket")
		return
	}

	items, err := h.support.ListMessagesForOrgTicket(r.Context(), session.OrgID, ticketID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list support messages")
		return
	}
	JSON(w, http.StatusOK, items)
}

func (h *Handler) OrgPostSupportMessage(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	ticketID := chi.URLParam(r, "id")
	ticket, err := h.support.GetOrgTicketByID(r.Context(), session.OrgID, ticketID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "support ticket not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to fetch support ticket")
		return
	}

	var body struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.Body = strings.TrimSpace(body.Body)
	if body.Body == "" {
		Error(w, http.StatusBadRequest, "body is required")
		return
	}

	msg, updated, err := h.support.AddMessage(r.Context(), ticket.ID, session.UserID, session.OrgID, false, body.Body)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create support message")
		return
	}

	msgID := msg.ID
	status := updated.Status
	h.publishSupportEvent(r, supportEvent{
		Type:       "message_created",
		TicketID:   updated.ID,
		OrgID:      updated.OrgID,
		Status:     &status,
		MessageID:  &msgID,
		OccurredAt: time.Now().UTC(),
	})

	JSON(w, http.StatusCreated, map[string]any{
		"ticket":  updated,
		"message": msg,
	})
}

func (h *Handler) OrgSupportStream(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	flusher, ok := w.(http.Flusher)
	if !ok {
		Error(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	pubsub := h.cache.Subscribe(r.Context(), supportEventsChannel)
	defer pubsub.Close()
	ch := pubsub.Channel()

	_, _ = w.Write([]byte(": connected\n\n"))
	flusher.Flush()

	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			if _, err := w.Write([]byte(": ping\n\n")); err != nil {
				return
			}
			flusher.Flush()
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var evt supportEvent
			if err := json.Unmarshal([]byte(msg.Payload), &evt); err != nil {
				continue
			}
			if evt.OrgID != session.OrgID {
				continue
			}
			if !writeSSEEvent(w, evt) {
				return
			}
			flusher.Flush()
		}
	}
}

func (h *Handler) PlatformListSupportTickets(w http.ResponseWriter, r *http.Request) {
	status := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("status")))
	orgID := strings.TrimSpace(r.URL.Query().Get("org_id"))
	assignedTo := strings.TrimSpace(r.URL.Query().Get("assigned_to"))
	if status != "" && !isValidSupportStatus(status) {
		Error(w, http.StatusBadRequest, "invalid status")
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	items, total, err := h.support.ListPlatformTickets(r.Context(), status, orgID, assignedTo, page, perPage)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list support tickets")
		return
	}
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 25
	}

	JSON(w, http.StatusOK, domain.PageResponse[domain.SupportTicket]{
		Items:      items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: (total + perPage - 1) / perPage,
	})
}

func (h *Handler) PlatformGetSupportTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	ticket, err := h.support.GetTicketByID(r.Context(), ticketID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "support ticket not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to fetch support ticket")
		return
	}
	JSON(w, http.StatusOK, ticket)
}

func (h *Handler) PlatformUpdateSupportTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")

	var raw map[string]json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var status *string
	if v, ok := raw["status"]; ok {
		s := strings.TrimSpace(strings.ToLower(strings.Trim(string(v), `"`)))
		if s == "" || !isValidSupportStatus(s) {
			Error(w, http.StatusBadRequest, "invalid status")
			return
		}
		status = &s
	}

	setAssigned := false
	var assigned *string
	if v, ok := raw["assigned_admin_user_id"]; ok {
		setAssigned = true
		if string(v) != "null" {
			var userID string
			if err := json.Unmarshal(v, &userID); err != nil {
				Error(w, http.StatusBadRequest, "invalid assigned_admin_user_id")
				return
			}
			userID = strings.TrimSpace(userID)
			if userID == "" {
				Error(w, http.StatusBadRequest, "invalid assigned_admin_user_id")
				return
			}
			assigned = &userID
		}
	}

	ticket, err := h.support.UpdateTicketForPlatform(r.Context(), ticketID, status, assigned, setAssigned)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "support ticket not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to update support ticket")
		return
	}

	st := ticket.Status
	h.publishSupportEvent(r, supportEvent{
		Type:       "ticket_updated",
		TicketID:   ticket.ID,
		OrgID:      ticket.OrgID,
		Status:     &st,
		OccurredAt: time.Now().UTC(),
	})

	JSON(w, http.StatusOK, ticket)
}

func (h *Handler) PlatformListSupportMessages(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	if _, err := h.support.GetTicketByID(r.Context(), ticketID); err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "support ticket not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to fetch support ticket")
		return
	}

	items, err := h.support.ListMessagesForTicket(r.Context(), ticketID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to list support messages")
		return
	}
	JSON(w, http.StatusOK, items)
}

func (h *Handler) PlatformPostSupportMessage(w http.ResponseWriter, r *http.Request) {
	session := middleware.SessionFromContext(r.Context())
	ticketID := chi.URLParam(r, "id")
	ticket, err := h.support.GetTicketByID(r.Context(), ticketID)
	if err != nil {
		if isNotFound(err) {
			Error(w, http.StatusNotFound, "support ticket not found")
			return
		}
		Error(w, http.StatusInternalServerError, "failed to fetch support ticket")
		return
	}

	var body struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	body.Body = strings.TrimSpace(body.Body)
	if body.Body == "" {
		Error(w, http.StatusBadRequest, "body is required")
		return
	}

	msg, updated, err := h.support.AddMessage(r.Context(), ticket.ID, session.UserID, session.OrgID, true, body.Body)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create support message")
		return
	}

	msgID := msg.ID
	status := updated.Status
	h.publishSupportEvent(r, supportEvent{
		Type:       "message_created",
		TicketID:   updated.ID,
		OrgID:      updated.OrgID,
		Status:     &status,
		MessageID:  &msgID,
		OccurredAt: time.Now().UTC(),
	})

	JSON(w, http.StatusCreated, map[string]any{
		"ticket":  updated,
		"message": msg,
	})
}

func (h *Handler) PlatformSupportStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		Error(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	pubsub := h.cache.Subscribe(r.Context(), supportEventsChannel)
	defer pubsub.Close()
	ch := pubsub.Channel()

	_, _ = w.Write([]byte(": connected\n\n"))
	flusher.Flush()

	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			if _, err := w.Write([]byte(": ping\n\n")); err != nil {
				return
			}
			flusher.Flush()
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var evt supportEvent
			if err := json.Unmarshal([]byte(msg.Payload), &evt); err != nil {
				continue
			}
			if !writeSSEEvent(w, evt) {
				return
			}
			flusher.Flush()
		}
	}
}
