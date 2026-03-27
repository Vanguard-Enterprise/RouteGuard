package repository_test

import (
	"context"
	"testing"

	"github.com/routeguard/api/internal/repository"
)

func createSupportTestUser(t *testing.T, ctx context.Context, users *repository.UserRepo, seed string) string {
	t.Helper()
	u, err := users.Create(ctx, "enc-"+seed, "hash-"+seed, "name-"+seed, nil)
	if err != nil {
		t.Fatalf("create user %s: %v", seed, err)
	}
	return u.ID
}

func TestSupportRepo_CreateAndIsolation(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	orgRepo := repository.NewOrgRepo(pool)
	userRepo := repository.NewUserRepo(pool)
	supportRepo := repository.NewSupportRepo(pool)

	orgA, err := orgRepo.Create(ctx, "enc-org-a", testOrgSlug("support-a"))
	if err != nil {
		t.Fatalf("create org A: %v", err)
	}
	orgB, err := orgRepo.Create(ctx, "enc-org-b", testOrgSlug("support-b"))
	if err != nil {
		t.Fatalf("create org B: %v", err)
	}

	userA := createSupportTestUser(t, ctx, userRepo, "support-a-user")

	ticket, msg, err := supportRepo.CreateTicketWithInitialMessage(ctx, orgA.ID, userA, "Need GPS help", "Tracking has a delay")
	if err != nil {
		t.Fatalf("create ticket with initial message: %v", err)
	}
	if ticket.Status != "open" {
		t.Fatalf("expected open status, got %s", ticket.Status)
	}
	if msg.TicketID != ticket.ID {
		t.Fatalf("expected message tied to ticket")
	}

	if _, err := supportRepo.GetOrgTicketByID(ctx, orgB.ID, ticket.ID); err == nil {
		t.Fatal("expected org-isolated lookup to fail")
	}

	items, total, err := supportRepo.ListOrgTickets(ctx, orgA.ID, "", 1, 25)
	if err != nil {
		t.Fatalf("list org tickets: %v", err)
	}
	if total < 1 || len(items) < 1 {
		t.Fatalf("expected at least one ticket for org A")
	}
}

func TestSupportRepo_StatusTransitionOnReply(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	orgRepo := repository.NewOrgRepo(pool)
	userRepo := repository.NewUserRepo(pool)
	supportRepo := repository.NewSupportRepo(pool)

	org, err := orgRepo.Create(ctx, "enc-org-c", testOrgSlug("support-c"))
	if err != nil {
		t.Fatalf("create org: %v", err)
	}
	orgUser := createSupportTestUser(t, ctx, userRepo, "support-c-org-user")
	adminUser := createSupportTestUser(t, ctx, userRepo, "support-c-admin-user")

	ticket, _, err := supportRepo.CreateTicketWithInitialMessage(ctx, org.ID, orgUser, "Need route fix", "Route missing students")
	if err != nil {
		t.Fatalf("create ticket: %v", err)
	}

	resolved := "resolved"
	updated, err := supportRepo.UpdateTicketForPlatform(ctx, ticket.ID, &resolved, &adminUser, true)
	if err != nil {
		t.Fatalf("resolve ticket: %v", err)
	}
	if updated.Status != "resolved" {
		t.Fatalf("expected resolved status, got %s", updated.Status)
	}

	_, afterMessage, err := supportRepo.AddMessage(ctx, ticket.ID, orgUser, org.ID, false, "Issue still happening")
	if err != nil {
		t.Fatalf("reply to resolved ticket: %v", err)
	}
	if afterMessage.Status != "in_progress" {
		t.Fatalf("expected in_progress after reply, got %s", afterMessage.Status)
	}
}
