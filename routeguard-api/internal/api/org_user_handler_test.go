package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreateOrgUserAdmin_MissingBody(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodPost, "/admin/organizations/abc/users", bytes.NewBufferString(`{}`))
	w := httptest.NewRecorder()
	h.CreateOrgUserAdmin(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}

func TestCreateOrgUserAdmin_ShortPassword(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodPost, "/admin/organizations/abc/users",
		bytes.NewBufferString(`{"name":"Test","email":"t@t.com","password":"short"}`))
	w := httptest.NewRecorder()
	h.CreateOrgUserAdmin(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", w.Code)
	}
}
