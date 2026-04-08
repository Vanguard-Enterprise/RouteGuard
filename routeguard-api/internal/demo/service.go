package demo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
	"github.com/routeguard/api/internal/repository"
)

var ErrResetInProgress = errors.New("demo reset already in progress")

type Service struct {
	pool    *pgxpool.Pool
	cfg     *config.Config
	orgs    *repository.OrgRepo
	billing *repository.BillingRepo
	audit   *repository.AuditRepo
	runs    *repository.DemoResetRepo
}

func NewService(pool *pgxpool.Pool, cfg *config.Config) *Service {
	return &Service{
		pool:    pool,
		cfg:     cfg,
		orgs:    repository.NewOrgRepo(pool),
		billing: repository.NewBillingRepo(pool),
		audit:   repository.NewAuditRepo(pool),
		runs:    repository.NewDemoResetRepo(pool),
	}
}

func (s *Service) ResetDemoOrg(ctx context.Context, orgID, actorUserID, actorEmail, resetMode string) (*domain.DemoResetRun, error) {
	if resetMode == "" {
		resetMode = "full"
	}
	templateVersion := s.cfg.DemoTemplateVersion
	if templateVersion == "" {
		templateVersion = "large-county-v1"
	}
	run, err := s.runs.Create(ctx, domain.DemoResetRun{
		OrgID:           orgID,
		TemplateVersion: templateVersion,
		ResetMode:       resetMode,
		Status:          "running",
		StartedByUserID: actorUserID,
		StartedByEmail:  actorEmail,
	})
	if err != nil {
		return nil, err
	}

	if err := s.emitAudit(ctx, actorUserID, actorEmail, orgID, "demo.reset.started", run.ID, map[string]any{
		"template_version": templateVersion,
		"reset_mode":       resetMode,
	}); err != nil {
		return nil, err
	}

	err = s.resetTx(ctx, orgID, actorUserID, templateVersion)
	if err != nil {
		msg := err.Error()
		failedRun, updateErr := s.runs.Complete(ctx, run.ID, "failed", &msg)
		if updateErr == nil {
			run = failedRun
		}
		_ = s.emitAudit(ctx, actorUserID, actorEmail, orgID, "demo.reset.failed", run.ID, map[string]any{
			"template_version": templateVersion,
			"reset_mode":       resetMode,
			"error":            msg,
		})
		return run, err
	}

	completedRun, err := s.runs.Complete(ctx, run.ID, "succeeded", nil)
	if err != nil {
		return nil, err
	}
	_ = s.emitAudit(ctx, actorUserID, actorEmail, orgID, "demo.reset.completed", completedRun.ID, map[string]any{
		"template_version": templateVersion,
		"reset_mode":       resetMode,
	})
	return completedRun, nil
}

func (s *Service) LatestRun(ctx context.Context, orgID string) (*domain.DemoResetRun, error) {
	return s.runs.LatestByOrg(ctx, orgID)
}

func (s *Service) resetTx(ctx context.Context, orgID, actorUserID, templateVersion string) error {
	ds, err := GenerateDataset(templateVersion)
	if err != nil {
		return err
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var locked bool
	if err := tx.QueryRow(ctx, `SELECT pg_try_advisory_xact_lock(hashtext($1))`, "demo-reset:"+orgID).Scan(&locked); err != nil {
		return fmt.Errorf("lock demo reset: %w", err)
	}
	if !locked {
		return ErrResetInProgress
	}

	org, err := s.orgs.GetByID(ctx, orgID)
	if err != nil {
		return err
	}
	if !org.IsDemo {
		return fmt.Errorf("organization %s is not marked as a demo org", orgID)
	}

	nameEnc, err := crypto.Encrypt(s.cfg.DataEncryptionKey, ds.OrgName)
	if err != nil {
		return fmt.Errorf("encrypt demo org name: %w", err)
	}

	if err := s.clearOrgData(ctx, tx, orgID); err != nil {
		return err
	}
	if err := s.insertDataset(ctx, tx, orgID, actorUserID, nameEnc, ds); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (s *Service) clearOrgData(ctx context.Context, tx pgx.Tx, orgID string) error {
	statements := []string{
		`DELETE FROM support_tickets WHERE org_id = $1`,
		`DELETE FROM route_assignments WHERE org_id = $1`,
		`DELETE FROM routes WHERE org_id = $1`,
		`DELETE FROM planner_runs WHERE org_id = $1`,
		`DELETE FROM driver_vehicle_assignments WHERE org_id = $1`,
		`DELETE FROM student_stop_assignments WHERE org_id = $1`,
		`DELETE FROM integrations WHERE org_id = $1`,
		`DELETE FROM sso_connections WHERE org_id = $1`,
		`DELETE FROM stops WHERE org_id = $1`,
		`DELETE FROM drivers WHERE org_id = $1`,
		`DELETE FROM vehicles WHERE org_id = $1`,
		`DELETE FROM schools WHERE org_id = $1`,
		`DELETE FROM students WHERE org_id = $1`,
	}
	for _, stmt := range statements {
		if _, err := tx.Exec(ctx, stmt, orgID); err != nil {
			return fmt.Errorf("clear demo org data: %w", err)
		}
	}
	return nil
}

func (s *Service) insertDataset(ctx context.Context, tx pgx.Tx, orgID, actorUserID, nameEnc string, ds *Dataset) error {
	if _, err := tx.Exec(ctx,
		`UPDATE organizations
		 SET name_enc = $2, is_demo = true, demo_template_version = $3, demo_last_reset_at = now(), updated_at = now()
		 WHERE id = $1`,
		orgID, nameEnc, ds.TemplateVersion,
	); err != nil {
		return fmt.Errorf("update demo org metadata: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO org_billing (org_id, billing_status, contract_notes, billing_contact_email)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (org_id) DO UPDATE
		 SET billing_status = EXCLUDED.billing_status,
		     contract_notes = EXCLUDED.contract_notes,
		     billing_contact_email = EXCLUDED.billing_contact_email,
		     pilot_ends_at = NULL,
		     updated_at = now()`,
		orgID, ds.BillingStatus, ds.ContractNotes, ds.BillingContactEmail,
	); err != nil {
		return fmt.Errorf("seed demo billing: %w", err)
	}

	schoolIDs := map[string]string{}
	for _, school := range ds.Schools {
		var id string
		if err := tx.QueryRow(ctx,
			`INSERT INTO schools (org_id, school_id, name, address, contact_phone, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING id`,
			orgID, school.SchoolID, school.Name, school.Address, school.ContactPhone, school.IsActive,
		).Scan(&id); err != nil {
			return fmt.Errorf("insert demo school: %w", err)
		}
		schoolIDs[school.Key] = id
	}

	stopIDs := map[string]string{}
	for _, stop := range ds.Stops {
		var id string
		if err := tx.QueryRow(ctx,
			`INSERT INTO stops (org_id, stop_id, name, address, latitude, longitude, notes, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 RETURNING id`,
			orgID, stop.StopID, stop.Name, stop.Address, stop.Latitude, stop.Longitude, stop.Notes, stop.IsActive,
		).Scan(&id); err != nil {
			return fmt.Errorf("insert demo stop: %w", err)
		}
		stopIDs[stop.Key] = id
	}

	vehicleIDs := map[string]string{}
	for _, vehicle := range ds.Vehicles {
		var id string
		if err := tx.QueryRow(ctx,
			`INSERT INTO vehicles (org_id, vehicle_id, license_plate, capacity, is_active)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING id`,
			orgID, vehicle.VehicleID, vehicle.LicensePlate, vehicle.Capacity, vehicle.IsActive,
		).Scan(&id); err != nil {
			return fmt.Errorf("insert demo vehicle: %w", err)
		}
		vehicleIDs[vehicle.Key] = id
	}

	driverIDs := map[string]string{}
	for _, driver := range ds.Drivers {
		var id string
		if err := tx.QueryRow(ctx,
			`INSERT INTO drivers (org_id, driver_id, name, phone, is_available, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING id`,
			orgID, driver.DriverID, driver.Name, driver.Phone, driver.IsAvailable, driver.IsActive,
		).Scan(&id); err != nil {
			return fmt.Errorf("insert demo driver: %w", err)
		}
		driverIDs[driver.Key] = id
	}

	studentIDs := map[string]string{}
	for _, student := range ds.Students {
		var id string
		if err := tx.QueryRow(ctx,
			`INSERT INTO students (org_id, student_id, first_name, last_name, grade, school, guardian_name, guardian_contact, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING id`,
			orgID, student.StudentID, student.FirstName, student.LastName, student.Grade, ds.schoolNameByKey(student.SchoolKey), student.GuardianName, student.GuardianContact, student.IsActive,
		).Scan(&id); err != nil {
			return fmt.Errorf("insert demo student: %w", err)
		}
		studentIDs[student.Key] = id
		if _, err := tx.Exec(ctx,
			`INSERT INTO student_stop_assignments (org_id, student_id, stop_id, service_window, is_active)
			 VALUES ($1, $2, $3, $4, true)`,
			orgID, id, stopIDs[student.StopKey], student.ServiceWindow,
		); err != nil {
			return fmt.Errorf("insert demo stop assignment: %w", err)
		}
	}

	for i := range ds.Routes {
		route := ds.Routes[i]
		var plannerRunID string
		if err := tx.QueryRow(ctx,
			`INSERT INTO planner_runs (org_id, mode, service_window, status, created_by)
			 VALUES ($1, $2, $3, 'published', $4)
			 RETURNING id`,
			orgID, route.ObjectiveMode, route.ServiceWindow, actorUserID,
		).Scan(&plannerRunID); err != nil {
			return fmt.Errorf("insert demo planner run: %w", err)
		}

		var routeID string
		if err := tx.QueryRow(ctx,
			`INSERT INTO routes (
				org_id, planner_run_id, route_code, service_window, status, objective_mode, vehicle_id, driver_id,
				estimated_travel_minutes, assigned_students, seat_utilization, unassigned_count
			 )
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			 RETURNING id`,
			orgID, plannerRunID, route.RouteCode, route.ServiceWindow, route.Status, route.ObjectiveMode,
			vehicleIDs[route.VehicleKey], driverIDs[route.DriverKey], route.EstimatedTravelMinutes,
			route.AssignedStudents, route.SeatUtilization, route.UnassignedCount,
		).Scan(&routeID); err != nil {
			return fmt.Errorf("insert demo route: %w", err)
		}

		if _, err := tx.Exec(ctx,
			`INSERT INTO planner_run_routes (planner_run_id, route_id) VALUES ($1, $2)`,
			plannerRunID, routeID,
		); err != nil {
			return fmt.Errorf("insert planner route link: %w", err)
		}

		if _, err := tx.Exec(ctx,
			`INSERT INTO driver_vehicle_assignments (org_id, driver_id, vehicle_id, is_active)
			 VALUES ($1, $2, $3, true)
			 ON CONFLICT DO NOTHING`,
			orgID, driverIDs[route.DriverKey], vehicleIDs[route.VehicleKey],
		); err != nil {
			return fmt.Errorf("insert driver vehicle assignment: %w", err)
		}

		if _, err := tx.Exec(ctx,
			`INSERT INTO route_assignments (org_id, route_id, driver_id, vehicle_id, is_active)
			 VALUES ($1, $2, $3, $4, true)`,
			orgID, routeID, driverIDs[route.DriverKey], vehicleIDs[route.VehicleKey],
		); err != nil {
			return fmt.Errorf("insert route assignment: %w", err)
		}

		for idx, stopKey := range route.StopKeys {
			if _, err := tx.Exec(ctx,
				`INSERT INTO route_stops (route_id, stop_id, stop_order, eta_minutes, student_count)
				 VALUES ($1, $2, $3, $4, $5)`,
				routeID, stopIDs[stopKey], idx+1, (idx+1)*7, countStudentsForStop(route.StudentKeys, route.StopKeys[idx], ds),
			); err != nil {
				return fmt.Errorf("insert route stop: %w", err)
			}
		}

		for idx, studentKey := range route.StudentKeys {
			if _, err := tx.Exec(ctx,
				`INSERT INTO route_students (route_id, student_id, stop_id, stop_order)
				 VALUES ($1, $2, $3, $4)`,
				routeID, studentIDs[studentKey], stopIDs[ds.stopKeyForStudent(studentKey)], idx+1,
			); err != nil {
				return fmt.Errorf("insert route student: %w", err)
			}
		}
	}

	return nil
}

func (s *Service) emitAudit(ctx context.Context, actorID, actorEmail, orgID, eventType, targetID string, metadata map[string]any) error {
	var orgPtr *string
	if orgID != "" {
		orgPtr = &orgID
	}
	var targetPtr *string
	if targetID != "" {
		targetPtr = &targetID
	}
	body, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	_, err = s.audit.Create(ctx, domain.AuditEvent{
		ActorID:    actorID,
		ActorEmail: actorEmail,
		OrgID:      orgPtr,
		EventType:  eventType,
		TargetType: "demo_reset",
		TargetID:   targetPtr,
		Metadata:   body,
	})
	return err
}

func (d *Dataset) schoolNameByKey(key string) string {
	for _, school := range d.Schools {
		if school.Key == key {
			return school.Name
		}
	}
	return ""
}

func (d *Dataset) stopKeyForStudent(studentKey string) string {
	for _, student := range d.Students {
		if student.Key == studentKey {
			return student.StopKey
		}
	}
	return ""
}

func countStudentsForStop(studentKeys []string, stopKey string, d *Dataset) int {
	count := 0
	for _, studentKey := range studentKeys {
		if d.stopKeyForStudent(studentKey) == stopKey {
			count++
		}
	}
	return count
}
