package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

func TestDriverRepo_SetAndClearPIN(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	orgRepo := repository.NewOrgRepo(pool)
	driverRepo := repository.NewDriverRepo(pool)

	org, err := orgRepo.Create(ctx, "enc-driver-org", testOrgSlug("drivers-pin"))
	if err != nil {
		t.Fatalf("create org: %v", err)
	}

	driver, err := driverRepo.Create(ctx, &domain.Driver{
		OrgID:       org.ID,
		DriverID:    "DRV-1001",
		Name:        "Alex Carter",
		Phone:       "555-1111",
		IsAvailable: true,
		IsActive:    true,
	})
	if err != nil {
		t.Fatalf("create driver: %v", err)
	}

	pinHash, err := auth.HashPIN("1234")
	if err != nil {
		t.Fatalf("hash pin: %v", err)
	}

	updated, err := driverRepo.SetPIN(ctx, org.ID, driver.ID, pinHash, crypto.HMAC(make([]byte, 32), "1234"), time.Now().UTC())
	if err != nil {
		t.Fatalf("set pin: %v", err)
	}
	if !updated.HasPIN {
		t.Fatal("expected driver to report has_pin after setting pin")
	}
	if updated.PinUpdatedAt == nil {
		t.Fatal("expected pin_updated_at to be set")
	}

	found, err := driverRepo.GetByID(ctx, org.ID, driver.ID)
	if err != nil {
		t.Fatalf("get driver: %v", err)
	}
	if !found.HasPIN || found.PinHash == nil {
		t.Fatal("expected stored pin metadata to be returned internally")
	}

	cleared, err := driverRepo.ClearPIN(ctx, org.ID, driver.ID)
	if err != nil {
		t.Fatalf("clear pin: %v", err)
	}
	if cleared.HasPIN {
		t.Fatal("expected has_pin to be false after clearing pin")
	}
	if cleared.PinUpdatedAt != nil {
		t.Fatal("expected pin_updated_at to clear with pin removal")
	}
}

func TestDriverRepo_SetPINRejectsDuplicateLookup(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	orgRepo := repository.NewOrgRepo(pool)
	driverRepo := repository.NewDriverRepo(pool)

	org, err := orgRepo.Create(ctx, "enc-driver-org-dup", testOrgSlug("drivers-pin-dup"))
	if err != nil {
		t.Fatalf("create org: %v", err)
	}

	driverA, err := driverRepo.Create(ctx, &domain.Driver{
		OrgID:       org.ID,
		DriverID:    "DRV-A",
		Name:        "Driver A",
		Phone:       "555-2001",
		IsAvailable: true,
		IsActive:    true,
	})
	if err != nil {
		t.Fatalf("create driver A: %v", err)
	}
	driverB, err := driverRepo.Create(ctx, &domain.Driver{
		OrgID:       org.ID,
		DriverID:    "DRV-B",
		Name:        "Driver B",
		Phone:       "555-2002",
		IsAvailable: true,
		IsActive:    true,
	})
	if err != nil {
		t.Fatalf("create driver B: %v", err)
	}

	pinHashA, _ := auth.HashPIN("2345")
	if _, err := driverRepo.SetPIN(ctx, org.ID, driverA.ID, pinHashA, crypto.HMAC(make([]byte, 32), "2345"), time.Now().UTC()); err != nil {
		t.Fatalf("set first pin: %v", err)
	}

	pinHashB, _ := auth.HashPIN("2345")
	if _, err := driverRepo.SetPIN(ctx, org.ID, driverB.ID, pinHashB, crypto.HMAC(make([]byte, 32), "2345"), time.Now().UTC()); err == nil {
		t.Fatal("expected duplicate pin lookup hash to fail")
	}
}

func TestDriverRepo_FindActiveByPINLookupHonorsStatusAndDeletion(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	orgRepo := repository.NewOrgRepo(pool)
	driverRepo := repository.NewDriverRepo(pool)

	org, err := orgRepo.Create(ctx, "enc-driver-org-active", testOrgSlug("drivers-pin-active"))
	if err != nil {
		t.Fatalf("create org: %v", err)
	}

	activeDriver, err := driverRepo.Create(ctx, &domain.Driver{
		OrgID:       org.ID,
		DriverID:    "DRV-ACTIVE",
		Name:        "Active Driver",
		Phone:       "555-3001",
		IsAvailable: true,
		IsActive:    true,
	})
	if err != nil {
		t.Fatalf("create active driver: %v", err)
	}
	activePinHash, _ := auth.HashPIN("3456")
	if _, err := driverRepo.SetPIN(ctx, org.ID, activeDriver.ID, activePinHash, crypto.HMAC(make([]byte, 32), "3456"), time.Now().UTC()); err != nil {
		t.Fatalf("set active pin: %v", err)
	}

	found, err := driverRepo.FindActiveByPINLookup(ctx, org.ID, crypto.HMAC(make([]byte, 32), "3456"))
	if err != nil {
		t.Fatalf("find active driver by pin lookup: %v", err)
	}
	if found.ID != activeDriver.ID {
		t.Fatalf("expected active driver %s, got %s", activeDriver.ID, found.ID)
	}
	ok, err := auth.VerifyPIN("3456", *found.PinHash)
	if err != nil || !ok {
		t.Fatalf("expected active driver pin to verify, ok=%v err=%v", ok, err)
	}
	ok, err = auth.VerifyPIN("9999", *found.PinHash)
	if err != nil {
		t.Fatalf("verify wrong pin: %v", err)
	}
	if ok {
		t.Fatal("expected wrong pin verification to fail")
	}

	inactiveDriver, err := driverRepo.Create(ctx, &domain.Driver{
		OrgID:       org.ID,
		DriverID:    "DRV-INACTIVE",
		Name:        "Inactive Driver",
		Phone:       "555-3002",
		IsAvailable: true,
		IsActive:    false,
	})
	if err != nil {
		t.Fatalf("create inactive driver: %v", err)
	}
	inactivePinHash, _ := auth.HashPIN("4567")
	if _, err := driverRepo.SetPIN(ctx, org.ID, inactiveDriver.ID, inactivePinHash, crypto.HMAC(make([]byte, 32), "4567"), time.Now().UTC()); err != nil {
		t.Fatalf("set inactive pin: %v", err)
	}
	if _, err := driverRepo.FindActiveByPINLookup(ctx, org.ID, crypto.HMAC(make([]byte, 32), "4567")); err == nil {
		t.Fatal("expected inactive driver lookup to fail")
	}

	if err := driverRepo.SoftDelete(ctx, org.ID, activeDriver.ID); err != nil {
		t.Fatalf("soft delete active driver: %v", err)
	}
	if _, err := driverRepo.FindActiveByPINLookup(ctx, org.ID, crypto.HMAC(make([]byte, 32), "3456")); err == nil {
		t.Fatal("expected deleted driver lookup to fail")
	}
}
