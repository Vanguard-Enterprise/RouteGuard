package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// GetAssignment with no trip session context returns 401.
func TestGetAssignment_NoSession(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodGet, "/api/v1/trips/assignment", nil)
	w := httptest.NewRecorder()
	h.GetAssignment(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}
