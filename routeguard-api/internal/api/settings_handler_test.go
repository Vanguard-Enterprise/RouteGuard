package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPatchOrgUserPhone_NoSession(t *testing.T) {
	h := &Handler{}
	r := httptest.NewRequest(http.MethodPatch, "/dashboard/settings/users/abc/phone", nil)
	w := httptest.NewRecorder()
	h.PatchOrgUserPhone(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want %d", w.Code, http.StatusUnauthorized)
	}
}
