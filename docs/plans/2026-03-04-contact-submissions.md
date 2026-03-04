# Contact Submissions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the public contact form to a Postgres-backed submissions store and give staff an admin panel with threaded notes and live SSE push updates.

**Architecture:** Public `POST /api/v1/contact` persists to `contact_submissions`. Staff endpoints under `/admin/contacts` handle listing, status/read updates, and note posting. Each note post publishes to a Redis channel `contact:notes:{id}`; a per-submission SSE endpoint subscribes and streams new notes to the admin panel in real time. RBAC gates all staff routes on a new `contacts:read` permission added to `super_admin`.

**Tech Stack:** Go 1.24 (chi, pgx, go-redis), Next.js 16 App Router, TypeScript, shadcn/ui, SWR, EventSource (native browser API)

---

### Task 1: Database migration

**Files:**
- Create: `routeguard-api/migrations/008_contact_submissions.up.sql`
- Create: `routeguard-api/migrations/008_contact_submissions.down.sql`

**Step 1: Write the up migration**

```sql
-- routeguard-api/migrations/008_contact_submissions.up.sql

CREATE TABLE contact_submissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  organization TEXT        NOT NULL,
  message      TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'new'
                             CHECK (status IN ('new', 'in_progress', 'closed')),
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE contact_notes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  UUID        NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  author_id      UUID        NOT NULL REFERENCES users(id),
  body           TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_notes_submission_id ON contact_notes(submission_id);

UPDATE staff_roles
SET permissions = array_append(permissions, 'contacts:read')
WHERE name = 'super_admin' AND is_system = true;
```

**Step 2: Write the down migration**

```sql
-- routeguard-api/migrations/008_contact_submissions.down.sql

UPDATE staff_roles
SET permissions = array_remove(permissions, 'contacts:read')
WHERE name = 'super_admin' AND is_system = true;

DROP TABLE IF EXISTS contact_notes;
DROP TABLE IF EXISTS contact_submissions;
```

**Step 3: Verify the migration runs**

```bash
cd routeguard-api
go run ./cmd/api &
# Wait for startup, then check logs for migration success, then kill
kill %1
```

Expected: no migration errors in output.

**Step 4: Commit**

```bash
git add routeguard-api/migrations/008_contact_submissions.up.sql \
        routeguard-api/migrations/008_contact_submissions.down.sql
git commit -m "feat: add contact_submissions and contact_notes migration"
```

---

### Task 2: Domain types

**Files:**
- Modify: `routeguard-api/internal/domain/types.go`

**Step 1: Append the two new types at the end of the file**

```go
type ContactSubmission struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	Organization string     `json:"organization"`
	Message      string     `json:"message"`
	Status       string     `json:"status"`
	ReadAt       *time.Time `json:"read_at"`
	CreatedAt    time.Time  `json:"created_at"`
	Notes        []ContactNote `json:"notes,omitempty"`
}

type ContactNote struct {
	ID           string    `json:"id"`
	SubmissionID string    `json:"submission_id"`
	AuthorID     string    `json:"author_id"`
	AuthorName   string    `json:"author_name"`
	Body         string    `json:"body"`
	CreatedAt    time.Time `json:"created_at"`
}
```

`time` is already imported in `types.go`. No new imports needed.

**Step 2: Verify it compiles**

```bash
cd routeguard-api
go build ./...
```

Expected: no errors.

**Step 3: Commit**

```bash
git add routeguard-api/internal/domain/types.go
git commit -m "feat: add ContactSubmission and ContactNote domain types"
```

---

### Task 3: Repository

**Files:**
- Create: `routeguard-api/internal/repository/contact_repo.go`

**Step 1: Write the repo**

```go
package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/domain"
)

type ContactRepo struct {
	pool *pgxpool.Pool
}

func NewContactRepo(pool *pgxpool.Pool) *ContactRepo {
	return &ContactRepo{pool: pool}
}

// Create inserts a new contact submission.
func (r *ContactRepo) Create(ctx context.Context, name, email, organization, message string) (*domain.ContactSubmission, error) {
	var s domain.ContactSubmission
	err := r.pool.QueryRow(ctx, `
		INSERT INTO contact_submissions (name, email, organization, message)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, email, organization, message, status, read_at, created_at
	`, name, email, organization, message).Scan(
		&s.ID, &s.Name, &s.Email, &s.Organization, &s.Message, &s.Status, &s.ReadAt, &s.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create contact submission: %w", err)
	}
	return &s, nil
}

// List returns paginated submissions, newest first, with optional status filter.
func (r *ContactRepo) List(ctx context.Context, limit, offset int, status *string) ([]domain.ContactSubmission, error) {
	query := `
		SELECT id, name, email, organization, message, status, read_at, created_at
		FROM contact_submissions
	`
	args := []any{}
	if status != nil {
		query += " WHERE status = $1"
		args = append(args, *status)
		query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
	} else {
		query += " ORDER BY created_at DESC LIMIT $1 OFFSET $2"
	}
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list contact submissions: %w", err)
	}
	defer rows.Close()

	var subs []domain.ContactSubmission
	for rows.Next() {
		var s domain.ContactSubmission
		if err := rows.Scan(&s.ID, &s.Name, &s.Email, &s.Organization, &s.Message, &s.Status, &s.ReadAt, &s.CreatedAt); err != nil {
			return nil, err
		}
		subs = append(subs, s)
	}
	return subs, rows.Err()
}

// Get returns a single submission with all its notes.
func (r *ContactRepo) Get(ctx context.Context, id string) (*domain.ContactSubmission, error) {
	var s domain.ContactSubmission
	err := r.pool.QueryRow(ctx, `
		SELECT id, name, email, organization, message, status, read_at, created_at
		FROM contact_submissions WHERE id = $1
	`, id).Scan(&s.ID, &s.Name, &s.Email, &s.Organization, &s.Message, &s.Status, &s.ReadAt, &s.CreatedAt)
	if err != nil {
		return nil, err
	}

	rows, err := r.pool.Query(ctx, `
		SELECT cn.id, cn.submission_id, cn.author_id, u.name, cn.body, cn.created_at
		FROM contact_notes cn
		JOIN users u ON u.id = cn.author_id
		WHERE cn.submission_id = $1
		ORDER BY cn.created_at ASC
	`, id)
	if err != nil {
		return nil, fmt.Errorf("list contact notes: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var n domain.ContactNote
		if err := rows.Scan(&n.ID, &n.SubmissionID, &n.AuthorID, &n.AuthorName, &n.Body, &n.CreatedAt); err != nil {
			return nil, err
		}
		s.Notes = append(s.Notes, n)
	}
	if s.Notes == nil {
		s.Notes = []domain.ContactNote{}
	}
	return &s, rows.Err()
}

// UpdateStatus sets a new status on a submission.
func (r *ContactRepo) UpdateStatus(ctx context.Context, id, status string) (*domain.ContactSubmission, error) {
	var s domain.ContactSubmission
	err := r.pool.QueryRow(ctx, `
		UPDATE contact_submissions SET status = $1
		WHERE id = $2
		RETURNING id, name, email, organization, message, status, read_at, created_at
	`, status, id).Scan(&s.ID, &s.Name, &s.Email, &s.Organization, &s.Message, &s.Status, &s.ReadAt, &s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("update contact status: %w", err)
	}
	return &s, nil
}

// MarkRead sets read_at to now if it is currently NULL.
func (r *ContactRepo) MarkRead(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE contact_submissions SET read_at = NOW()
		WHERE id = $1 AND read_at IS NULL
	`, id)
	return err
}

// AddNote inserts a note and returns the full note with author name.
func (r *ContactRepo) AddNote(ctx context.Context, submissionID, authorID, body string) (*domain.ContactNote, error) {
	var n domain.ContactNote
	err := r.pool.QueryRow(ctx, `
		INSERT INTO contact_notes (submission_id, author_id, body)
		VALUES ($1, $2, $3)
		RETURNING id, submission_id, author_id, body, created_at
	`, submissionID, authorID, body).Scan(&n.ID, &n.SubmissionID, &n.AuthorID, &n.Body, &n.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("add contact note: %w", err)
	}

	// Fetch author name.
	err = r.pool.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, authorID).Scan(&n.AuthorName)
	if err != nil {
		n.AuthorName = "Staff"
	}
	return &n, nil
}

// Exists returns true if a submission with the given ID exists.
func (r *ContactRepo) Exists(ctx context.Context, id string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM contact_submissions WHERE id = $1)`, id).Scan(&exists)
	return exists, err
}

// ensure time import is used
var _ = time.Now
```

**Step 2: Verify it compiles**

```bash
cd routeguard-api
go build ./...
```

Expected: no errors. If the `time` sentinel triggers a "declared but not used" error, remove it - it was a precaution since `time.Time` is only used via the domain types.

**Step 3: Commit**

```bash
git add routeguard-api/internal/repository/contact_repo.go
git commit -m "feat: add ContactRepo"
```

---

### Task 4: HTTP handlers

**Files:**
- Create: `routeguard-api/internal/api/contact_handler.go`

**Step 1: Write the handler file**

```go
package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/auth"
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
		subs = []interface{}{}
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
	_ = h.cache.Publish(r.Context(), "contact:notes:"+id, note)

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
```

**Note on `ListContacts`:** The `subs == nil` branch uses `interface{}{}` as a stand-in - replace that nil slice branch with:
```go
if subs == nil {
    JSON(w, http.StatusOK, []domain.ContactSubmission{})
    return
}
```
Add `"github.com/routeguard/api/internal/domain"` to the imports if not already present.

**Step 2: Build to catch errors**

```bash
cd routeguard-api
go build ./...
```

Fix any import or type errors. The `domain` import is needed for the nil slice fix above.

**Step 3: Commit**

```bash
git add routeguard-api/internal/api/contact_handler.go
git commit -m "feat: add contact form HTTP handlers"
```

---

### Task 5: Wire routes in server.go

**Files:**
- Modify: `routeguard-api/internal/server/server.go`

**Step 1: Add public route**

In `buildRouter`, after the existing device checkin rate-limited routes (around line 58), add:

```go
// Contact form (public, rate-limited)
r.With(middleware.RateLimit(s.cache, 20)).Post("/api/v1/contact", h.SubmitContact)
```

**Step 2: Add admin routes**

Inside the `r.Route("/admin", ...)` block, after the audit-logs line, add:

```go
// Contact submissions
r.With(middleware.RequireStaffPermission("contacts:read")).Get("/contacts", h.ListContacts)
r.With(middleware.RequireStaffPermission("contacts:read")).Get("/contacts/{id}", h.GetContact)
r.With(middleware.RequireStaffPermission("contacts:read")).Patch("/contacts/{id}", h.PatchContact)
r.With(middleware.RequireStaffPermission("contacts:read")).Post("/contacts/{id}/notes", h.AddContactNote)
r.With(middleware.RequireStaffPermission("contacts:read")).Get("/contacts/{id}/stream", h.StreamContactNotes)
```

**Step 3: Build and verify**

```bash
cd routeguard-api
go build ./cmd/api
```

Expected: no errors.

**Step 4: Commit**

```bash
git add routeguard-api/internal/server/server.go
git commit -m "feat: wire contact routes in server"
```

---

### Task 6: Handler tests

**Files:**
- Create: `routeguard-api/internal/api/contact_handler_test.go`

**Step 1: Write the tests**

```go
package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSubmitContact_MissingFields(t *testing.T) {
	h := newTestHandler(t)
	body := `{"name":"Jane"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/contact", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.SubmitContact(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestSubmitContact_Success(t *testing.T) {
	h := newTestHandler(t)
	body := `{"name":"Jane","email":"jane@school.edu","organization":"Acme USD","message":"Hello"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/contact", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.SubmitContact(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
}

func TestListContacts_Empty(t *testing.T) {
	h := newTestHandler(t)
	req := withStaffSession(httptest.NewRequest(http.MethodGet, "/admin/contacts", nil))
	w := httptest.NewRecorder()
	h.ListContacts(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var result []interface{}
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
}

func TestGetContact_NotFound(t *testing.T) {
	h := newTestHandler(t)
	req := withStaffSession(httptest.NewRequest(http.MethodGet, "/admin/contacts/00000000-0000-0000-0000-000000000000", nil))
	req = withURLParam(req, "id", "00000000-0000-0000-0000-000000000000")
	w := httptest.NewRecorder()
	h.GetContact(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestAddContactNote_NotFound(t *testing.T) {
	h := newTestHandler(t)
	body := `{"body":"test note"}`
	req := withStaffSession(httptest.NewRequest(http.MethodPost, "/admin/contacts/00000000-0000-0000-0000-000000000000/notes", bytes.NewBufferString(body)))
	req.Header.Set("Content-Type", "application/json")
	req = withURLParam(req, "id", "00000000-0000-0000-0000-000000000000")
	w := httptest.NewRecorder()
	h.AddContactNote(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}
```

**Step 2: Check what test helpers already exist**

```bash
ls routeguard-api/internal/api/*_test.go | head -5
```

Look for `newTestHandler`, `withStaffSession`, `withURLParam` helpers in the existing test files. If they exist, reuse them. If not, look at the existing handler tests for the pattern and add these helpers to a `testhelpers_test.go` file in the same package.

Common pattern found in the codebase:

```go
// routeguard-api/internal/api/testhelpers_test.go  (create only if it doesn't exist)
package api_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/routeguard/api/internal/api"
	"github.com/routeguard/api/internal/auth"
)

func newTestHandler(t *testing.T) *api.Handler {
	t.Helper()
	// Use the test DB pool if available, else skip with t.Skip.
	// Check existing test files for how newTestHandler is implemented.
	panic("implement based on existing test patterns in this package")
}
```

Read existing handler test files first to copy the exact pattern before writing helpers.

**Step 3: Run the tests**

```bash
cd routeguard-api
go test -v -run TestSubmitContact ./internal/api/
go test -v -run TestListContacts ./internal/api/
go test -v -run TestGetContact ./internal/api/
go test -v -run TestAddContactNote ./internal/api/
```

Expected: all pass.

**Step 4: Commit**

```bash
git add routeguard-api/internal/api/contact_handler_test.go
git commit -m "test: contact handler tests"
```

---

### Task 7: Dashboard - API client types and methods

**Files:**
- Modify: `dashboard/lib/api.ts`

**Step 1: Add interfaces after the `AuditLog` interface (around line 312)**

```typescript
export interface ContactSubmission {
  id: string
  name: string
  email: string
  organization: string
  message: string
  status: 'new' | 'in_progress' | 'closed'
  read_at: string | null
  created_at: string
  notes?: ContactNote[]
}

export interface ContactNote {
  id: string
  submission_id: string
  author_id: string
  author_name: string
  body: string
  created_at: string
}
```

**Step 2: Add `contacts` methods to the `admin` object in the `api` export**

Find the `admin:` block and add before its closing brace:

```typescript
    contacts: {
      list: (params?: { status?: string; limit?: number; offset?: number }) => {
        const qs = params ? '?' + new URLSearchParams(
          Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
        ).toString() : ''
        return request<ContactSubmission[]>(`/admin/contacts${qs}`)
      },
      get: (id: string) => request<ContactSubmission>(`/admin/contacts/${id}`),
      patch: (id: string, data: { status?: string; mark_read?: boolean }) =>
        request<ContactSubmission>(`/admin/contacts/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      addNote: (id: string, body: string) =>
        request<ContactNote>(`/admin/contacts/${id}/notes`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
    },
```

**Step 3: Lint check**

```bash
cd dashboard
npm run lint
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add dashboard/lib/api.ts
git commit -m "feat: add contact submission types and API methods"
```

---

### Task 8: SSE hook

**Files:**
- Create: `dashboard/hooks/use-contact-note-stream.ts`

**Step 1: Write the hook**

```typescript
'use client'

import { useState, useEffect } from 'react'
import type { ContactNote } from '@/lib/api'

export function useContactNoteStream(submissionId: string, initialNotes: ContactNote[]) {
  const [notes, setNotes] = useState<ContactNote[]>(initialNotes)

  useEffect(() => {
    if (!submissionId) return
    const es = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/admin/contacts/${submissionId}/stream`,
      { withCredentials: true }
    )
    es.addEventListener('note', (e) => {
      const note = JSON.parse(e.data) as ContactNote
      setNotes((prev) => {
        // Deduplicate by id in case of reconnect replays.
        if (prev.some((n) => n.id === note.id)) return prev
        return [...prev, note]
      })
    })
    es.onerror = () => {
      // EventSource auto-reconnects; no action needed.
    }
    return () => es.close()
  }, [submissionId])

  return { notes, setNotes }
}
```

**Step 2: Build check**

```bash
cd dashboard
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

**Step 3: Commit**

```bash
git add dashboard/hooks/use-contact-note-stream.ts
git commit -m "feat: add useContactNoteStream SSE hook"
```

---

### Task 9: Admin nav and breadcrumb

**Files:**
- Modify: `dashboard/components/admin/admin-nav-main.tsx`
- Modify: `dashboard/components/admin/admin-breadcrumb.tsx`

**Step 1: Update admin-nav-main.tsx**

Read the file first. At the top of the file, add `MessageSquare` to the lucide import. In the `navItems` array, add:

```typescript
{ title: 'Contacts', url: '/admin/contacts', icon: MessageSquare, permission: 'contacts:read' },
```

The existing items have no `permission` field, so you need to add optional permission filtering. Change the nav items array type and rendering to gate on permission:

```typescript
const navItems: { title: string; url: string; icon: LucideIcon; permission?: string }[] = [
  { title: 'Organizations', url: '/admin/organizations', icon: Building2 },
  { title: 'Devices', url: '/admin/devices', icon: Tablet },
  { title: 'Contacts', url: '/admin/contacts', icon: MessageSquare, permission: 'contacts:read' },
  { title: 'Audit Logs', url: '/admin/audit-logs', icon: ScrollText },
]
```

In the render, filter before mapping:

```tsx
{navItems
  .filter((item) => !item.permission || (user.permissions?.includes(item.permission) ?? false))
  .map((item) => { ... })}
```

**Step 2: Update admin-breadcrumb.tsx**

Read the file first. Find the segment label map and add:

```typescript
contacts: 'Contacts',
```

**Step 3: Lint and build**

```bash
cd dashboard
npm run lint && npm run build 2>&1 | tail -10
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add dashboard/components/admin/admin-nav-main.tsx \
        dashboard/components/admin/admin-breadcrumb.tsx
git commit -m "feat: add Contacts to admin nav and breadcrumb"
```

---

### Task 10: Admin contacts list page

**Files:**
- Create: `dashboard/app/admin/contacts/page.tsx`

**Step 1: Write the page**

This is a server component that fetches submissions and renders a table.

```tsx
import { api } from '@/lib/api'
import { getServerUser } from '@/lib/server-api'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_progress: 'In Progress',
  closed: 'Closed',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  new: 'default',
  in_progress: 'secondary',
  closed: 'outline',
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const user = await getServerUser()
  if (!user) redirect('/staff/login')
  if (!user.permissions?.includes('contacts:read')) redirect('/admin')

  const params = await searchParams
  const submissions = await api.admin.contacts.list(
    params.status ? { status: params.status } : undefined
  ).catch(() => [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contact Submissions</h1>
        <p className="text-muted-foreground mt-1">Inbound inquiries from the public contact form.</p>
      </div>

      <div className="flex gap-2">
        {['', 'new', 'in_progress', 'closed'].map((s) => (
          <Link
            key={s || 'all'}
            href={s ? `/admin/contacts?status=${s}` : '/admin/contacts'}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              (params.status ?? '') === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {s ? STATUS_LABELS[s] : 'All'}
          </Link>
        ))}
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium w-4"></th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No submissions found.
                </td>
              </tr>
            )}
            {submissions.map((sub) => (
              <tr key={sub.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  {!sub.read_at && (
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title="Unread" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/contacts/${sub.id}`} className="font-medium hover:underline">
                    {sub.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{sub.email}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{sub.organization}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANTS[sub.status]}>
                    {STATUS_LABELS[sub.status]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDistanceToNow(new Date(sub.created_at), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step 2: Check if `date-fns` is installed**

```bash
grep '"date-fns"' dashboard/package.json
```

If not present:

```bash
cd dashboard && npm install date-fns
```

**Step 3: Build check**

```bash
cd dashboard
npm run build 2>&1 | tail -15
```

Expected: no errors.

**Step 4: Commit**

```bash
git add dashboard/app/admin/contacts/page.tsx
git commit -m "feat: add admin contacts list page"
```

---

### Task 11: Admin contact detail page

**Files:**
- Create: `dashboard/app/admin/contacts/[id]/page.tsx`
- Create: `dashboard/app/admin/contacts/[id]/contact-detail-client.tsx`

**Step 1: Write the server component**

```tsx
// dashboard/app/admin/contacts/[id]/page.tsx
import { api } from '@/lib/api'
import { getServerUser } from '@/lib/server-api'
import { redirect, notFound } from 'next/navigation'
import { ContactDetailClient } from './contact-detail-client'

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getServerUser()
  if (!user) redirect('/staff/login')
  if (!user.permissions?.includes('contacts:read')) redirect('/admin')

  const { id } = await params

  let submission
  try {
    submission = await api.admin.contacts.get(id)
  } catch {
    notFound()
  }

  return <ContactDetailClient submission={submission} currentUserId={user.id} />
}
```

**Step 2: Write the client component**

```tsx
// dashboard/app/admin/contacts/[id]/contact-detail-client.tsx
'use client'

import { useState } from 'react'
import { useContactNoteStream } from '@/hooks/use-contact-note-stream'
import { api, type ContactSubmission } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { formatDistanceToNow, format } from 'date-fns'
import { useEffect } from 'react'

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_progress: 'In Progress',
  closed: 'Closed',
}

interface Props {
  submission: ContactSubmission
  currentUserId: string
}

export function ContactDetailClient({ submission, currentUserId }: Props) {
  const [status, setStatus] = useState(submission.status)
  const [noteInput, setNoteInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { notes } = useContactNoteStream(submission.id, submission.notes ?? [])

  // Mark as read on mount.
  useEffect(() => {
    if (!submission.read_at) {
      api.admin.contacts.patch(submission.id, { mark_read: true }).catch(() => null)
    }
  }, [submission.id, submission.read_at])

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.admin.contacts.patch(submission.id, { status: newStatus })
      setStatus(newStatus)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleAddNote = async () => {
    if (!noteInput.trim()) return
    setSubmitting(true)
    try {
      await api.admin.contacts.addNote(submission.id, noteInput.trim())
      setNoteInput('')
      // Note will arrive via SSE - no need to manually update state.
    } catch {
      toast.error('Failed to add note')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
      {/* Left: submission details */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">{submission.name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {submission.email} - {submission.organization}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Submitted {formatDistanceToNow(new Date(submission.created_at), { addSuffix: true })}
          </p>
        </div>

        <div className="rounded-md border bg-muted/20 p-4 text-sm whitespace-pre-wrap">
          {submission.message}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Status</span>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Right: note thread */}
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Internal Notes
        </h2>

        <div className="flex-1 space-y-3 min-h-0 max-h-[480px] overflow-y-auto">
          {notes.length === 0 && (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          )}
          {notes.map((note) => (
            <div key={note.id} className="rounded-md border bg-card p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{note.author_name}</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(note.created_at), 'MMM d, h:mm a')}
                </span>
              </div>
              <p className="text-muted-foreground whitespace-pre-wrap">{note.body}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Textarea
            placeholder="Add a note..."
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleAddNote()
              }
            }}
          />
          <Button
            onClick={handleAddNote}
            disabled={submitting || !noteInput.trim()}
            size="sm"
          >
            {submitting ? 'Posting...' : 'Add Note'}
          </Button>
          <p className="text-xs text-muted-foreground">Cmd+Enter to submit</p>
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Build check**

```bash
cd dashboard
npm run build 2>&1 | tail -15
```

Fix any TypeScript errors. Common issues: `searchParams` must be awaited in Next.js 15+ (already done above), `notFound()` import from `next/navigation`.

**Step 4: Commit**

```bash
git add dashboard/app/admin/contacts/[id]/page.tsx \
        dashboard/app/admin/contacts/[id]/contact-detail-client.tsx
git commit -m "feat: add admin contact detail page with SSE note thread"
```

---

### Task 12: Wire contact form submission

**Files:**
- Modify: `dashboard/app/(marketing)/contact/page.tsx`

**Step 1: Read the file**

The current `handleSubmit` just calls `setSubmitted(true)`. Replace it with an actual API call.

**Step 2: Replace handleSubmit**

Change the imports at the top - add the `api` import:

```typescript
import { api } from '@/lib/api'
```

Wait - `api.admin.contacts` is for staff. The public endpoint is `POST /api/v1/contact`. The contact page doesn't use the `api` client - it needs to call the raw API URL directly. Add a simple fetch call:

```typescript
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/api/v1/contact`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }
    )
    if (!res.ok) throw new Error('Failed to submit')
    setSubmitted(true)
  } catch {
    // Show error state - add an error state variable.
    alert('Failed to send message. Please try again.')
  }
}
```

For a cleaner implementation, add an `error` state and show an inline error message instead of `alert`. Add `const [error, setError] = useState<string | null>(null)` and display it below the button.

**Step 3: Build and lint**

```bash
cd dashboard
npm run lint && npm run build 2>&1 | tail -10
```

Expected: 0 errors.

**Step 4: Commit**

```bash
git add dashboard/app/(marketing)/contact/page.tsx
git commit -m "feat: wire contact form to POST /api/v1/contact"
```

---

### Final: Full verification

```bash
cd routeguard-api
go build ./cmd/api
go test -v ./...

cd ../dashboard
npm run lint
npm run build
```

Expected: all tests pass, 0 lint errors, build succeeds.

```bash
git log --oneline -10
```
