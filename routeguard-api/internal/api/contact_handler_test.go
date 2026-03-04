package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/routeguard/api/internal/auth"
)

func TestSubmitContact_InvalidBody(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodPost, "/api/v1/contact", bytes.NewBufferString("{bad json"))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.SubmitContact(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestSubmitContact_MissingFields(t *testing.T) {
	h := &Handler{}
	body := `{"name":"Jane"}`
	r := httptest.NewRequest(http.MethodPost, "/api/v1/contact", bytes.NewBufferString(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.SubmitContact(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestAddContactNote_InvalidBody(t *testing.T) {
	h := &Handler{}
	ctx := context.WithValue(context.Background(), auth.SessionContextKey, &auth.SessionPayload{
		UserID: "staff-user-1",
	})
	r := httptest.NewRequest(http.MethodPost, "/admin/contacts/some-id/notes", bytes.NewBufferString("{bad"))
	r = r.WithContext(ctx)
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.AddContactNote(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestAddContactNote_EmptyBody(t *testing.T) {
	h := &Handler{}
	ctx := context.WithValue(context.Background(), auth.SessionContextKey, &auth.SessionPayload{
		UserID: "staff-user-1",
	})
	r := httptest.NewRequest(http.MethodPost, "/admin/contacts/some-id/notes", bytes.NewBufferString(`{"body":""}`))
	r = r.WithContext(ctx)
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.AddContactNote(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestAddContactNote_NoSession(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodPost, "/admin/contacts/some-id/notes", bytes.NewBufferString(`{"body":"hi"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.AddContactNote(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestPatchContact_InvalidBody(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodPatch, "/admin/contacts/some-id", bytes.NewBufferString("{bad"))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.PatchContact(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestPatchContact_InvalidStatus(t *testing.T) {
	h := &Handler{}
	body := `{"status":"invalid"}`
	r := httptest.NewRequest(http.MethodPatch, "/admin/contacts/some-id", bytes.NewBufferString(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.PatchContact(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}
