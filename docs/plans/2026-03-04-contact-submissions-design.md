# Contact Submissions - Design

**Date:** 2026-03-04
**Status:** Approved

## Problem

The contact form at `/contact` collects name, email, organization, and message but submits nowhere - `handleSubmit` only flips a local `submitted` flag. There is no admin visibility into inbound inquiries and no way for staff to track or respond to them.

## Goals

- Persist contact form submissions to the database
- Give staff an admin panel to view, triage, and annotate submissions
- Support a live-updating threaded note system so multiple staff members can collaborate on a submission in real time
- Gate the feature behind a new RBAC permission

## Database

### `contact_submissions`

```sql
CREATE TABLE contact_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  organization TEXT NOT NULL,
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'in_progress', 'closed')),
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `contact_notes`

```sql
CREATE TABLE contact_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  UUID NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  author_id      UUID NOT NULL REFERENCES users(id),
  body           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_notes_submission_id ON contact_notes(submission_id);
```

## RBAC

New permission: `contacts:read` - scopes all contact submission read and write actions (viewing, status updates, notes).

Added to `super_admin` system role via migration:

```sql
UPDATE staff_roles
SET permissions = array_append(permissions, 'contacts:read')
WHERE name = 'super_admin' AND is_system = true;
```

## API Endpoints

### Public

#### `POST /api/v1/contact`

Unauthenticated. Rate-limited (20 req/IP/hour). Accepts the contact form payload and creates a `contact_submissions` row.

Request:
```json
{
  "name": "Jane Smith",
  "email": "jane@school.edu",
  "organization": "Springfield USD",
  "message": "We have 40 buses and are looking for a solution."
}
```

Response `201 Created`: empty body.

### Staff (require `contacts:read` permission)

#### `GET /admin/contacts`

Paginated list of submissions. Query params: `page`, `limit`, `status` filter.

Response: array of submission objects (without notes), newest first.

#### `GET /admin/contacts/{id}`

Single submission with all notes, ordered by `created_at` ascending.

Response:
```json
{
  "id": "...",
  "name": "Jane Smith",
  "email": "jane@school.edu",
  "organization": "Springfield USD",
  "message": "...",
  "status": "new",
  "read_at": null,
  "created_at": "...",
  "notes": [
    {
      "id": "...",
      "author_id": "...",
      "author_name": "Alice (staff)",
      "body": "Called, left voicemail.",
      "created_at": "..."
    }
  ]
}
```

#### `PATCH /admin/contacts/{id}`

Update status and/or mark as read.

Request (all fields optional):
```json
{
  "status": "in_progress",
  "mark_read": true
}
```

Response `200 OK`: updated submission object (without notes).

#### `POST /admin/contacts/{id}/notes`

Append a note to the thread. Publishes the new note to Redis channel `contact:notes:{id}` after saving.

Request:
```json
{ "body": "Sent intro deck via email." }
```

Response `201 Created`: the new note object.

#### `GET /admin/contacts/{id}/stream`

SSE endpoint. Subscribes to Redis pub/sub channel `contact:notes:{id}`. Pushes a `note` event for each new note published to that channel. Follows the same pattern as `GET /dashboard/stream/trips`.

Event payload: serialized note object (same shape as the notes array items above).

## Redis Key

`contact:notes:{submission_id}` - pub/sub only, no persistence.

## Frontend

### Admin Nav (`components/admin/admin-nav-main.tsx`)

Add "Contacts" to the main nav group with a `MessageSquare` icon, gated on `user.permissions?.includes('contacts:read')`.

### Pages

#### `/admin/contacts`

Table columns: unread indicator (dot), name, organization, status badge, submitted date.
Clicking a row navigates to `/admin/contacts/[id]`.
Status filter tabs: All / New / In Progress / Closed.

#### `/admin/contacts/[id]`

Two-column layout:

- **Left:** submission details - name, email, org, message, submitted date. Status selector (dropdown) that calls `PATCH /admin/contacts/{id}` on change. Marks submission as read on mount via `PATCH`.
- **Right:** note thread. Notes displayed oldest-to-newest, each showing author name and timestamp. Text area + "Add Note" button at the bottom posts to `POST /admin/contacts/{id}/notes`.

Live updates via `useContactNoteStream(submissionId)` hook - opens `EventSource` to `GET /admin/contacts/{id}/stream`. On `note` event, appends the new note to local state without a refetch.

### Hook (`hooks/use-contact-note-stream.ts`)

Mirrors `use-trip-stream.ts`. Opens `EventSource` with `withCredentials: true`, listens for `note` events, maintains a `notes` state array. Closes the connection on unmount.

### Breadcrumb

Add `contacts` segment to the label map in `admin-breadcrumb.tsx`.

## Files to Change

### `routeguard-api/`
- `migrations/008_contact_submissions.up.sql` - new tables + RBAC update
- `migrations/008_contact_submissions.down.sql` - drop tables + revert permission
- `internal/domain/types.go` - `ContactSubmission`, `ContactNote` types
- `internal/repository/contact_repo.go` - new repo
- `internal/api/contact_handler.go` - all handlers
- `internal/server/server.go` - wire routes

### `dashboard/`
- `components/admin/admin-nav-main.tsx` - add Contacts nav item
- `components/admin/admin-breadcrumb.tsx` - add `contacts` segment
- `app/admin/contacts/page.tsx` - list page
- `app/admin/contacts/[id]/page.tsx` - detail page (server component shell)
- `app/admin/contacts/[id]/contact-detail-client.tsx` - client component with SSE hook
- `hooks/use-contact-note-stream.ts` - new hook
- `lib/api.ts` - add contact API methods
- `app/(marketing)/contact/page.tsx` - wire form submit to `POST /api/v1/contact`

## What Is Not Changing

- Contact page visual design
- Email/phone contact info in `components/contact.tsx`
- Staff role management UI (permission is added via migration, not the UI)
- Any org dashboard functionality
