package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// DeviceContacts with no trip session returns 401.
func TestDeviceContacts_NoSession(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodGet, "/api/v1/device/contacts", nil)
	w := httptest.NewRecorder()
	h.DeviceContacts(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

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
