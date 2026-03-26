package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

func testOrgSlug(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}

func TestStudentRepo_CRUDAndScope(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	orgRepo := repository.NewOrgRepo(pool)
	studentRepo := repository.NewStudentRepo(pool)

	orgA, err := orgRepo.Create(ctx, "enc-org-a", testOrgSlug("students-a"))
	if err != nil {
		t.Fatalf("create org A: %v", err)
	}
	orgB, err := orgRepo.Create(ctx, "enc-org-b", testOrgSlug("students-b"))
	if err != nil {
		t.Fatalf("create org B: %v", err)
	}

	created, err := studentRepo.Create(ctx, &domain.Student{
		OrgID:           orgA.ID,
		StudentID:       "A-001",
		FirstName:       "Ada",
		LastName:        "Lovelace",
		Grade:           "5",
		School:          "North Elementary",
		GuardianName:    "Alex Lovelace",
		GuardianContact: "555-1111",
		IsActive:        true,
	})
	if err != nil {
		t.Fatalf("create student: %v", err)
	}

	found, err := studentRepo.GetByID(ctx, orgA.ID, created.ID)
	if err != nil {
		t.Fatalf("get student by id: %v", err)
	}
	if found.StudentID != "A-001" {
		t.Fatalf("expected student_id A-001, got %s", found.StudentID)
	}

	if _, err := studentRepo.GetByID(ctx, orgB.ID, created.ID); err == nil {
		t.Fatal("expected org-isolated lookup to fail")
	}

	found.Grade = "6"
	found.GuardianContact = "555-9999"
	updated, err := studentRepo.Update(ctx, found)
	if err != nil {
		t.Fatalf("update student: %v", err)
	}
	if updated.Grade != "6" {
		t.Fatalf("expected grade update to 6, got %s", updated.Grade)
	}

	if err := studentRepo.SoftDelete(ctx, orgA.ID, created.ID); err != nil {
		t.Fatalf("soft delete student: %v", err)
	}

	if _, err := studentRepo.GetByID(ctx, orgA.ID, created.ID); err == nil {
		t.Fatal("expected deleted student lookup to fail")
	}
}

func TestStudentRepo_UniqueStudentIDWithSoftDelete(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	orgRepo := repository.NewOrgRepo(pool)
	studentRepo := repository.NewStudentRepo(pool)

	org, err := orgRepo.Create(ctx, "enc-org-c", testOrgSlug("students-c"))
	if err != nil {
		t.Fatalf("create org: %v", err)
	}

	first, err := studentRepo.Create(ctx, &domain.Student{
		OrgID:           org.ID,
		StudentID:       "SAME-ID",
		FirstName:       "Grace",
		LastName:        "Hopper",
		Grade:           "7",
		School:          "West Middle",
		GuardianName:    "Pat Hopper",
		GuardianContact: "555-2222",
		IsActive:        true,
	})
	if err != nil {
		t.Fatalf("create first student: %v", err)
	}

	if _, err := studentRepo.Create(ctx, &domain.Student{
		OrgID:           org.ID,
		StudentID:       "SAME-ID",
		FirstName:       "Different",
		LastName:        "Student",
		Grade:           "8",
		School:          "West Middle",
		GuardianName:    "",
		GuardianContact: "",
		IsActive:        true,
	}); err == nil {
		t.Fatal("expected duplicate active student_id to fail")
	}

	if err := studentRepo.SoftDelete(ctx, org.ID, first.ID); err != nil {
		t.Fatalf("soft delete first student: %v", err)
	}

	if _, err := studentRepo.Create(ctx, &domain.Student{
		OrgID:           org.ID,
		StudentID:       "SAME-ID",
		FirstName:       "Reuse",
		LastName:        "Allowed",
		Grade:           "8",
		School:          "West Middle",
		GuardianName:    "",
		GuardianContact: "",
		IsActive:        true,
	}); err != nil {
		t.Fatalf("expected student_id reuse after soft delete, got error: %v", err)
	}
}
