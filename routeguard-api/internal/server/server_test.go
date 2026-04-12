package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/routeguard/api/internal/config"
)

func TestCORSMiddleware_AllowsQRCOrigin(t *testing.T) {
	mw := corsMiddleware(&config.Config{
		BaseURL: "https://route-guard.com",
	})

	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/device/mapbox/proxy", nil)
	req.Header.Set("Origin", "qrc:")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected preflight status %d, got %d", http.StatusNoContent, recorder.Code)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "qrc:" {
		t.Fatalf("expected qrc origin to be allowed, got %q", got)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Headers"); got == "" {
		t.Fatal("expected access-control headers to be present")
	}
}

func TestCORSMiddleware_AllowsConfiguredBaseURL(t *testing.T) {
	mw := corsMiddleware(&config.Config{
		BaseURL: "https://route-guard.com",
	})

	handler := mw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	}))

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "https://route-guard.com")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected status %d, got %d", http.StatusAccepted, recorder.Code)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "https://route-guard.com" {
		t.Fatalf("expected configured origin to be echoed, got %q", got)
	}
}
