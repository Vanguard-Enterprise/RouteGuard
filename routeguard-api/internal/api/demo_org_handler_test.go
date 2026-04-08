package api

import (
	"testing"

	"github.com/routeguard/api/internal/demo"
	"github.com/routeguard/api/internal/domain"
)

func TestIsProtectedDemoOrg(t *testing.T) {
	h := &Handler{}

	if !h.isProtectedDemoOrg(&domain.Organization{Slug: demo.CanonicalOrgSlug}) {
		t.Fatal("expected canonical slug org to be protected")
	}
	if !h.isProtectedDemoOrg(&domain.Organization{IsDemo: true, Slug: "other-org"}) {
		t.Fatal("expected demo-flagged org to be protected")
	}
	if h.isProtectedDemoOrg(&domain.Organization{Slug: "district-123"}) {
		t.Fatal("expected normal org to not be protected")
	}
}
