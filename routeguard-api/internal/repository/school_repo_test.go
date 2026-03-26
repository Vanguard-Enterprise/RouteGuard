package repository_test

import (
	"context"
	"testing"

	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

func TestSchoolRepo_CRUDAndScope(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	orgRepo := repository.NewOrgRepo(pool)
	schoolRepo := repository.NewSchoolRepo(pool)

	orgA, err := orgRepo.Create(ctx, "enc-org-a", testOrgSlug("schools-a"))
	if err != nil {
		t.Fatalf("create org A: %v", err)
	}
	orgB, err := orgRepo.Create(ctx, "enc-org-b", testOrgSlug("schools-b"))
	if err != nil {
		t.Fatalf("create org B: %v", err)
	}

	created, err := schoolRepo.Create(ctx, &domain.School{
		OrgID:        orgA.ID,
		SchoolID:     "SCH-001",
		Name:         "North Academy",
		Address:      "1 North St",
		ContactPhone: "555-1001",
		IsActive:     true,
	})
	if err != nil {
		t.Fatalf("create school: %v", err)
	}

	found, err := schoolRepo.GetByID(ctx, orgA.ID, created.ID)
	if err != nil {
		t.Fatalf("get school by id: %v", err)
	}
	if found.SchoolID != "SCH-001" {
		t.Fatalf("expected school_id SCH-001, got %s", found.SchoolID)
	}

	if _, err := schoolRepo.GetByID(ctx, orgB.ID, created.ID); err == nil {
		t.Fatal("expected org-isolated lookup to fail")
	}

	found.Name = "North Academy Updated"
	found.ContactPhone = "555-1999"
	updated, err := schoolRepo.Update(ctx, found)
	if err != nil {
		t.Fatalf("update school: %v", err)
	}
	if updated.Name != "North Academy Updated" {
		t.Fatalf("expected updated name, got %s", updated.Name)
	}

	if err := schoolRepo.SoftDelete(ctx, orgA.ID, created.ID); err != nil {
		t.Fatalf("soft delete school: %v", err)
	}

	if _, err := schoolRepo.GetByID(ctx, orgA.ID, created.ID); err == nil {
		t.Fatal("expected deleted school lookup to fail")
	}
}

func TestSchoolRepo_UniqueSchoolIDWithSoftDelete(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	orgRepo := repository.NewOrgRepo(pool)
	schoolRepo := repository.NewSchoolRepo(pool)

	org, err := orgRepo.Create(ctx, "enc-org-c", testOrgSlug("schools-c"))
	if err != nil {
		t.Fatalf("create org: %v", err)
	}

	first, err := schoolRepo.Create(ctx, &domain.School{
		OrgID:        org.ID,
		SchoolID:     "SAME-ID",
		Name:         "West School",
		Address:      "55 West Rd",
		ContactPhone: "555-2001",
		IsActive:     true,
	})
	if err != nil {
		t.Fatalf("create first school: %v", err)
	}

	if _, err := schoolRepo.Create(ctx, &domain.School{
		OrgID:        org.ID,
		SchoolID:     "SAME-ID",
		Name:         "Duplicate",
		Address:      "22 Dup St",
		ContactPhone: "555-0000",
		IsActive:     true,
	}); err == nil {
		t.Fatal("expected duplicate active school_id to fail")
	}

	if err := schoolRepo.SoftDelete(ctx, org.ID, first.ID); err != nil {
		t.Fatalf("soft delete first school: %v", err)
	}

	if _, err := schoolRepo.Create(ctx, &domain.School{
		OrgID:        org.ID,
		SchoolID:     "SAME-ID",
		Name:         "Reuse Allowed",
		Address:      "99 Reuse Ave",
		ContactPhone: "555-3003",
		IsActive:     true,
	}); err != nil {
		t.Fatalf("expected school_id reuse after soft delete, got error: %v", err)
	}
}

func TestSchoolRepo_ListByOrg_FilterAndPagination(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	orgRepo := repository.NewOrgRepo(pool)
	schoolRepo := repository.NewSchoolRepo(pool)

	org, err := orgRepo.Create(ctx, "enc-org-d", testOrgSlug("schools-d"))
	if err != nil {
		t.Fatalf("create org: %v", err)
	}

	_, _ = schoolRepo.Create(ctx, &domain.School{OrgID: org.ID, SchoolID: "SC-001", Name: "Alpha School", Address: "A", ContactPhone: "555-1111", IsActive: true})
	_, _ = schoolRepo.Create(ctx, &domain.School{OrgID: org.ID, SchoolID: "SC-002", Name: "Beta School", Address: "B", ContactPhone: "555-2222", IsActive: false})
	_, _ = schoolRepo.Create(ctx, &domain.School{OrgID: org.ID, SchoolID: "SC-003", Name: "Gamma Campus", Address: "C", ContactPhone: "555-3333", IsActive: true})

	activeItems, activeTotal, err := schoolRepo.ListByOrg(ctx, org.ID, "", "active", 1, 50)
	if err != nil {
		t.Fatalf("list active schools: %v", err)
	}
	if activeTotal != 2 || len(activeItems) != 2 {
		t.Fatalf("expected 2 active schools, got total=%d len=%d", activeTotal, len(activeItems))
	}

	searchItems, _, err := schoolRepo.ListByOrg(ctx, org.ID, "gamma", "all", 1, 50)
	if err != nil {
		t.Fatalf("search schools: %v", err)
	}
	if len(searchItems) != 1 || searchItems[0].SchoolID != "SC-003" {
		t.Fatalf("expected one gamma school, got %+v", searchItems)
	}

	pageItems, _, err := schoolRepo.ListByOrg(ctx, org.ID, "", "all", 1, 2)
	if err != nil {
		t.Fatalf("list paginated schools: %v", err)
	}
	if len(pageItems) != 2 {
		t.Fatalf("expected 2 schools on first page, got %d", len(pageItems))
	}
}
