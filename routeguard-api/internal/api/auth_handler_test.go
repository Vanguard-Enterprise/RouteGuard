package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/routeguard/api/internal/auth"
)

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
