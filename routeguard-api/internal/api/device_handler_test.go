package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

func TestDeviceDriverLoginRejectsUnauthorizedRequest(t *testing.T) {
	h := &Handler{}
	req := httptest.NewRequest(http.MethodPost, "/device/driver-login", strings.NewReader(`{"pin":"1234"}`))
	rr := httptest.NewRecorder()

	h.DeviceDriverLogin(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, rr.Code)
	}
}

func TestDeviceDriverLoginSuccess(t *testing.T) {
	h, token, driver := seedDeviceDriverLoginScenario(t, "1234", true, false)

	rr := performDeviceDriverLogin(t, h, token, "1234")
	if rr.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusOK, rr.Code, rr.Body.String())
	}

	var response domain.DeviceDriverLoginResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Driver.ID != driver.ID {
		t.Fatalf("expected driver id %s, got %s", driver.ID, response.Driver.ID)
	}
	if response.Driver.DriverID != driver.DriverID {
		t.Fatalf("expected driver code %s, got %s", driver.DriverID, response.Driver.DriverID)
	}
	if response.Driver.Name != driver.Name {
		t.Fatalf("expected driver name %s, got %s", driver.Name, response.Driver.Name)
	}
}

func TestDeviceDriverLoginRejectsInvalidPIN(t *testing.T) {
	h, token, _ := seedDeviceDriverLoginScenario(t, "1234", true, false)

	rr := performDeviceDriverLogin(t, h, token, "9999")
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusForbidden, rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "invalid driver pin") {
		t.Fatalf("expected invalid pin error, got %s", rr.Body.String())
	}
}

func TestDeviceDriverLoginRejectsInactiveDriver(t *testing.T) {
	h, token, _ := seedDeviceDriverLoginScenario(t, "2345", false, false)

	rr := performDeviceDriverLogin(t, h, token, "2345")
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusForbidden, rr.Code, rr.Body.String())
	}
}

func TestDeviceDriverLoginRejectsDeletedDriver(t *testing.T) {
	h, token, _ := seedDeviceDriverLoginScenario(t, "3456", true, true)

	rr := performDeviceDriverLogin(t, h, token, "3456")
	if rr.Code != http.StatusForbidden {
		t.Fatalf("expected status %d, got %d body=%s", http.StatusForbidden, rr.Code, rr.Body.String())
	}
}

func performDeviceDriverLogin(t *testing.T, h *Handler, token, pin string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(http.MethodPost, "/device/driver-login", strings.NewReader(fmt.Sprintf(`{"pin":"%s"}`, pin)))
	req.Header.Set("Authorization", "Bearer "+token)

	rr := httptest.NewRecorder()
	h.DeviceDriverLogin(rr, req)
	return rr
}

func seedDeviceDriverLoginScenario(t *testing.T, pin string, active bool, deleted bool) (*Handler, string, *domain.Driver) {
	t.Helper()

	pool := apiTestPool(t)
	ctx := context.Background()

	cfg := &config.Config{
		HMACKey:           make([]byte, 32),
		DataEncryptionKey: make([]byte, 32),
	}

	orgRepo := repository.NewOrgRepo(pool)
	deviceRepo := repository.NewDeviceRepo(pool)
	driverRepo := repository.NewDriverRepo(pool)

	org, err := orgRepo.Create(ctx, "device-login-org", apiTestOrgSlug("device-login"))
	if err != nil {
		t.Fatalf("create org: %v", err)
	}

	deviceKey := fmt.Sprintf("device-%d", time.Now().UnixNano())
	if _, err := deviceRepo.UpsertBootstrap(ctx, deviceKey, "0.1.0-test", nil); err != nil {
		t.Fatalf("bootstrap device: %v", err)
	}

	_, code, _, err := deviceRepo.EnsureEnrollmentCode(ctx, deviceKey, cfg.HMACKey, time.Now().UTC())
	if err != nil {
		t.Fatalf("ensure enrollment code: %v", err)
	}

	if _, err := deviceRepo.ClaimByEnrollmentCode(ctx, repository.DeviceClaimInput{
		OrgID:     org.ID,
		Code:      code,
		HMACKey:   cfg.HMACKey,
		CryptoKey: cfg.DataEncryptionKey,
		ClaimedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("claim device: %v", err)
	}

	status, err := deviceRepo.EnrollmentStatus(ctx, deviceKey, code, cfg.HMACKey, cfg.DataEncryptionKey, time.Now().UTC())
	if err != nil {
		t.Fatalf("load enrollment status: %v", err)
	}
	if status.Token == "" {
		t.Fatal("expected claimed device token")
	}

	driver, err := driverRepo.Create(ctx, &domain.Driver{
		OrgID:       org.ID,
		DriverID:    fmt.Sprintf("DRV-%d", time.Now().UnixNano()),
		Name:        "Morgan Lee",
		Phone:       "555-4100",
		IsAvailable: true,
		IsActive:    active,
	})
	if err != nil {
		t.Fatalf("create driver: %v", err)
	}

	pinHash, err := auth.HashPIN(pin)
	if err != nil {
		t.Fatalf("hash pin: %v", err)
	}

	driver, err = driverRepo.SetPIN(ctx, org.ID, driver.ID, pinHash, crypto.HMAC(cfg.HMACKey, pin), time.Now().UTC())
	if err != nil {
		t.Fatalf("set pin: %v", err)
	}

	if deleted {
		if err := driverRepo.SoftDelete(ctx, org.ID, driver.ID); err != nil {
			t.Fatalf("delete driver: %v", err)
		}
	}

	return &Handler{
		cfg:     cfg,
		devices: deviceRepo,
		drivers: driverRepo,
	}, status.Token, driver
}

func apiTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set, skipping integration test")
	}

	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatalf("connect to test db: %v", err)
	}
	t.Cleanup(func() { pool.Close() })
	return pool
}

func apiTestOrgSlug(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}
