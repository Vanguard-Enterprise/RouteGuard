package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/middleware"
)

// okHandler is a simple handler that writes 200 OK.
var okHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
})

func TestSessionFromContext_WithSession(t *testing.T) {
	session := &auth.SessionPayload{UserID: "user1", Email: "a@b.com"}
	ctx := context.WithValue(context.Background(), middleware.SessionKey, session)
	got := middleware.SessionFromContext(ctx)
	if got == nil {
		t.Fatal("expected session, got nil")
	}
	if got.UserID != "user1" {
		t.Fatalf("UserID: got %q, want %q", got.UserID, "user1")
	}
}

func TestSessionFromContext_WithoutSession(t *testing.T) {
	got := middleware.SessionFromContext(context.Background())
	if got != nil {
		t.Fatalf("expected nil, got %+v", got)
	}
}

func TestRequireStaff_IsStaff(t *testing.T) {
	session := &auth.SessionPayload{UserID: "staff1", IsStaff: true}
	ctx := context.WithValue(context.Background(), middleware.SessionKey, session)

	r := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
	w := httptest.NewRecorder()

	middleware.RequireStaff(okHandler).ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestRequireStaff_NotStaff(t *testing.T) {
	session := &auth.SessionPayload{UserID: "org1", IsStaff: false}
	ctx := context.WithValue(context.Background(), middleware.SessionKey, session)

	r := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
	w := httptest.NewRecorder()

	middleware.RequireStaff(okHandler).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestRequireStaff_NoSession(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	middleware.RequireStaff(okHandler).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestRequirePermission_HasPermission(t *testing.T) {
	session := &auth.SessionPayload{
		UserID: "user1",
		Roles:  []string{"students:read", "routes:write"},
	}
	ctx := context.WithValue(context.Background(), middleware.SessionKey, session)

	r := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
	w := httptest.NewRecorder()

	middleware.RequirePermission("students:read")(okHandler).ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestRequirePermission_MissingPermission(t *testing.T) {
	session := &auth.SessionPayload{
		UserID: "user1",
		Roles:  []string{"students:read"},
	}
	ctx := context.WithValue(context.Background(), middleware.SessionKey, session)

	r := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
	w := httptest.NewRecorder()

	middleware.RequirePermission("routes:write")(okHandler).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestRequirePermission_NoSession(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	middleware.RequirePermission("students:read")(okHandler).ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestRequirePermission_EmptyRoles(t *testing.T) {
	session := &auth.SessionPayload{UserID: "user1", Roles: []string{}}
	ctx := context.WithValue(context.Background(), middleware.SessionKey, session)

	r := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
	w := httptest.NewRecorder()

	middleware.RequirePermission("students:read")(okHandler).ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}
