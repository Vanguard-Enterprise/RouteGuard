package api

import (
	"net/http/httptest"
	"testing"
)

func TestRealIP_ForwardedFor(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Forwarded-For", "1.2.3.4, 10.0.0.1")
	got := realIP(r)
	if got != "1.2.3.4" {
		t.Fatalf("got %q, want %q", got, "1.2.3.4")
	}
}

func TestRealIP_RealIP(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("X-Real-IP", "5.6.7.8")
	got := realIP(r)
	if got != "5.6.7.8" {
		t.Fatalf("got %q, want %q", got, "5.6.7.8")
	}
}

func TestRealIP_RemoteAddr(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "9.10.11.12:54321"
	got := realIP(r)
	if got != "9.10.11.12" {
		t.Fatalf("got %q, want %q", got, "9.10.11.12")
	}
}
