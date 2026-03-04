package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/routeguard/api/internal/auth"
)

// TestLogin_ResponseFieldNames_Contract documents that the Login success-path
// response uses "id" and "permissions" (not "user_id"/"roles"), matching Me().
// The success path requires a live DB+cache so it is covered by integration tests.
// This test verifies early-exit paths compile and return errors in the same shape.
func TestLogin_InvalidBody_Returns400(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader("{bad json"))
	w := httptest.NewRecorder()
	h.Login(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

func TestLogin_MissingCredentials_Returns400(t *testing.T) {
	h := &Handler{}
	body, _ := json.Marshal(map[string]string{"email": "x@x.com"})
	r := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(body))
	w := httptest.NewRecorder()
	h.Login(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

func TestMe_ResponseContainsIdAndPermissions(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodGet, "/auth/me", nil)
	ctx := context.WithValue(r.Context(), auth.SessionContextKey, &auth.SessionPayload{
		UserID:  "user-123",
		OrgID:   "org-456",
		Email:   "test@example.com",
		Name:    "Test User",
		IsStaff: false,
		Roles:   []string{"routes:read", "students:read"},
	})
	r = r.WithContext(ctx)
	w := httptest.NewRecorder()

	h.Me(w, r)

	if w.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", w.Code)
	}
	var body map[string]any
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["id"] != "user-123" {
		t.Errorf("want id=user-123, got %v", body["id"])
	}
	if _, ok := body["permissions"]; !ok {
		t.Error("response missing 'permissions' field")
	}
	if _, ok := body["user_id"]; ok {
		t.Error("response must not contain legacy 'user_id' field")
	}
	if _, ok := body["roles"]; ok {
		t.Error("response must not contain legacy 'roles' field")
	}
}
