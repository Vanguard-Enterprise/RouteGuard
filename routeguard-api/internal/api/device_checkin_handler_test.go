package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDeviceCheckin_MissingSerial(t *testing.T) {
	h := &Handler{}
	body := `{}`
	r := httptest.NewRequest(http.MethodPost, "/api/v1/devices/checkin", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.DeviceCheckin(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestDeviceCheckin_InvalidBody(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodPost, "/api/v1/devices/checkin", strings.NewReader("not json"))
	w := httptest.NewRecorder()
	h.DeviceCheckin(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want %d", w.Code, http.StatusBadRequest)
	}
}
