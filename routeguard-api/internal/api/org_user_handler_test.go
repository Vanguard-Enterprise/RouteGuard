package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
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

func TestDeleteOrgUserAdmin_MissingIDs(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodDelete, "/admin/organizations/org-1/users/user-1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "")
	rctx.URLParams.Add("userId", "")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	w := httptest.NewRecorder()
	h.DeleteOrgUserAdmin(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d", w.Code)
	}
}
