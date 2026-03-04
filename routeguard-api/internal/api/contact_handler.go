package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
	"github.com/routeguard/api/internal/stream"
)

// SubmitContact handles POST /api/v1/contact (public, rate-limited).
func (h *Handler) SubmitContact(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name         string `json:"name"`
		Email        string `json:"email"`
		Organization string `json:"organization"`
		Message      string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Email == "" || req.Organization == "" || req.Message == "" {
		Error(w, http.StatusBadRequest, "name, email, organization, and message are required")
		return
	}

	repo := repository.NewContactRepo(h.pool)
	if _, err := repo.Create(r.Context(), req.Name, req.Email, req.Organization, req.Message); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// ListContacts handles GET /admin/contacts
func (h *Handler) ListContacts(w http.ResponseWriter, r *http.Request) {
	limit := 50
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	var statusFilter *string
	if s := r.URL.Query().Get("status"); s != "" {
		statusFilter = &s
	}

	repo := repository.NewContactRepo(h.pool)
	subs, err := repo.List(r.Context(), limit, offset, statusFilter)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if subs == nil {
		JSON(w, http.StatusOK, []domain.ContactSubmission{})
		return
	}
	JSON(w, http.StatusOK, subs)
}

// GetContact handles GET /admin/contacts/{id}
func (h *Handler) GetContact(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	repo := repository.NewContactRepo(h.pool)
	sub, err := repo.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "submission not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, sub)
}

// PatchContact handles PATCH /admin/contacts/{id}
// Accepts optional "status" and "mark_read" fields.
func (h *Handler) PatchContact(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Status   *string `json:"status"`
		MarkRead *bool   `json:"mark_read"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	repo := repository.NewContactRepo(h.pool)

	if req.MarkRead != nil && *req.MarkRead {
		if err := repo.MarkRead(r.Context(), id); err != nil {
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
	}

	if req.Status != nil {
		validStatuses := map[string]bool{"new": true, "in_progress": true, "closed": true}
		if !validStatuses[*req.Status] {
			Error(w, http.StatusBadRequest, "invalid status")
			return
		}
		sub, err := repo.UpdateStatus(r.Context(), id, *req.Status)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				Error(w, http.StatusNotFound, "submission not found")
				return
			}
			Error(w, http.StatusInternalServerError, "internal server error")
			return
		}
		JSON(w, http.StatusOK, sub)
		return
	}

	sub, err := repo.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			Error(w, http.StatusNotFound, "submission not found")
			return
		}
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	JSON(w, http.StatusOK, sub)
}

// AddContactNote handles POST /admin/contacts/{id}/notes
func (h *Handler) AddContactNote(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Body == "" {
		Error(w, http.StatusBadRequest, "body is required")
		return
	}

	repo := repository.NewContactRepo(h.pool)
	exists, err := repo.Exists(r.Context(), id)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !exists {
		Error(w, http.StatusNotFound, "submission not found")
		return
	}

	note, err := repo.AddNote(r.Context(), id, session.UserID, req.Body)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Publish to Redis so SSE subscribers receive the note immediately.
	noteJSON, _ := json.Marshal(note)
	_ = h.cache.Publish(r.Context(), "contact:notes:"+id, string(noteJSON))

	JSON(w, http.StatusCreated, note)
}

// StreamContactNotes handles GET /admin/contacts/{id}/stream
// Subscribes to Redis channel contact:notes:{id} and forwards note events via SSE.
func (h *Handler) StreamContactNotes(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()

	pubsub := h.cache.Subscribe(ctx, "contact:notes:"+id)
	defer pubsub.Close()

	sse, ok := stream.NewWriter(w)
	if !ok {
		Error(w, http.StatusServiceUnavailable, "streaming not supported")
		return
	}

	msgCh := pubsub.Channel()
	for {
		select {
		case msg, open := <-msgCh:
			if !open {
				return
			}
			if err := sse.Send("note", json.RawMessage(msg.Payload)); err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
