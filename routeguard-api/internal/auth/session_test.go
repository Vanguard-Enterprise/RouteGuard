package auth_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/routeguard/api/internal/auth"
)

func containsStr(s, substr string) bool {
	return strings.Contains(s, substr)
}

func TestTokenFromRequest_WithCookie(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: "abc123token"})

	got := auth.TokenFromRequest(r)
	if got != "abc123token" {
		t.Fatalf("got %q, want %q", got, "abc123token")
	}
}

func TestTokenFromRequest_NoCookie(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	got := auth.TokenFromRequest(r)
	if got != "" {
		t.Fatalf("got %q, want empty string", got)
	}
}

func TestSetSessionCookie(t *testing.T) {
	w := httptest.NewRecorder()
	auth.SetSessionCookie(w, "mytoken", false)

	resp := w.Result()
	cookies := resp.Cookies()
	if len(cookies) == 0 {
		t.Fatal("expected a cookie to be set")
	}

	var found *http.Cookie
	for _, c := range cookies {
		if c.Name == auth.SessionCookieName {
			found = c
			break
		}
	}
	if found == nil {
		t.Fatalf("cookie %q not found", auth.SessionCookieName)
	}
	if found.Value != "mytoken" {
		t.Fatalf("cookie value: got %q, want %q", found.Value, "mytoken")
	}
	if !found.HttpOnly {
		t.Fatal("cookie should be HttpOnly")
	}
	// Go's net/http normalises ".route-guard.com" to "route-guard.com"
	// per RFC 6265 §5.2.3 when serialising Set-Cookie headers.
	// Assert against the normalised domain value that Go actually emits.
	rawHeader := w.Header().Get("Set-Cookie")
	if rawHeader == "" {
		t.Fatal("Set-Cookie header not present")
	}
	const wantDomain = "Domain=route-guard.com"
	if !containsStr(rawHeader, wantDomain) {
		t.Fatalf("Set-Cookie header %q does not contain %q", rawHeader, wantDomain)
	}
}

func TestClearSessionCookie(t *testing.T) {
	w := httptest.NewRecorder()
	auth.ClearSessionCookie(w)

	resp := w.Result()
	cookies := resp.Cookies()
	if len(cookies) == 0 {
		t.Fatal("expected a cookie to be set")
	}

	var found *http.Cookie
	for _, c := range cookies {
		if c.Name == auth.SessionCookieName {
			found = c
			break
		}
	}
	if found == nil {
		t.Fatalf("cookie %q not found", auth.SessionCookieName)
	}
	if found.MaxAge != -1 {
		t.Fatalf("MaxAge: got %d, want -1", found.MaxAge)
	}
}
