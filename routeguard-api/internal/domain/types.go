// routeguard-api/internal/domain/types.go
package domain

import (
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// ============================================================
// Tenant & Auth
// ============================================================

// Organization maps to the organizations table.
type Organization struct {
	ID        string          `json:"id"`
	Name      string          `json:"name"`
	Slug      string          `json:"slug"`
	Type      string          `json:"type"`
	LogoURL   *string         `json:"logo_url"`
	Timezone  string          `json:"timezone"`
	Settings  json.RawMessage `json:"settings"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// User maps to the users table.
type User struct {
	ID          string     `json:"id"`
	OrgID       *string    `json:"org_id"`
	Email       string     `json:"email"`
	Name        string     `json:"name"`
	AvatarURL   *string    `json:"avatar_url"`
	LastLoginAt *time.Time `json:"last_login_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

// UserIdentity maps to the user_identities table.
type UserIdentity struct {
	ID             string          `json:"id"`
	UserID         string          `json:"user_id"`
	Provider       string          `json:"provider"`
	ProviderUserID *string         `json:"provider_user_id"`
	PasswordHash   *string         `json:"password_hash"`
	Metadata       json.RawMessage `json:"metadata"`
	CreatedAt      time.Time       `json:"created_at"`
}

// APIKey maps to the api_keys table.
type APIKey struct {
	ID         string     `json:"id"`
	OrgID      string     `json:"org_id"`
	Name       string     `json:"name"`
	KeyHash    string     `json:"-"`
	KeyPrefix  string     `json:"key_prefix"`
	Scopes     []string   `json:"scopes"`
	LastUsedAt *time.Time `json:"last_used_at"`
	ExpiresAt  *time.Time `json:"expires_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

// SSOConnection maps to the sso_connections table.
// OIDCClientSecretEnc and SamlCertificateEnc are AES-256-GCM encrypted at rest.
type SSOConnection struct {
	ID                   string     `json:"id"`
	OrgID                string     `json:"org_id"`
	Type                 string     `json:"type"`
	DisplayName          string     `json:"display_name"`
	Domain               string     `json:"domain"`
	Enabled              bool       `json:"enabled"`
	OIDCIssuerURL        *string    `json:"oidc_issuer_url"`
	OIDCClientID         *string    `json:"oidc_client_id"`
	OIDCClientSecretEnc  *string    `json:"-"`
	OIDCScopes           string     `json:"oidc_scopes"`
	SAMLEntityID         *string    `json:"saml_entity_id"`
	SAMLSSOUrl           *string    `json:"saml_sso_url"`
	SAMLCertificateEnc   *string    `json:"-"`
	SAMLMetadataURL      *string    `json:"saml_metadata_url"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

// ============================================================
// RBAC
// ============================================================

// OrgRole maps to the org_roles table.
type OrgRole struct {
	ID          string    `json:"id"`
	OrgID       string    `json:"org_id"`
	Name        string    `json:"name"`
	Permissions []string  `json:"permissions"`
	IsSystem    bool      `json:"is_system"`
	CreatedAt   time.Time `json:"created_at"`
}

// UserRole maps to the user_roles table.
type UserRole struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
	RoleID string `json:"role_id"`
}

// SSORoleMapping maps to the sso_role_mappings table.
type SSORoleMapping struct {
	ID              string `json:"id"`
	SSOConnectionID string `json:"sso_connection_id"`
	ClaimKey        string `json:"claim_key"`
	ClaimValue      string `json:"claim_value"`
	OrgRoleID       string `json:"org_role_id"`
}

// ============================================================
// Devices
// ============================================================

// Device maps to the devices table.
type Device struct {
	ID              string          `json:"id"`
	OrgID           string          `json:"org_id"`
	Serial          string          `json:"serial"`
	DeviceTokenHash *string         `json:"-"`
	Status          string          `json:"status"`
	VehicleID       *string         `json:"vehicle_id"`
	SeatCount       *int            `json:"seat_count"`
	BusLayout       json.RawMessage `json:"bus_layout"`
	ProvisionedAt   *time.Time      `json:"provisioned_at"`
	CreatedAt       time.Time       `json:"created_at"`
}

// ============================================================
// Core Entities
// ============================================================

// School maps to the schools table.
type School struct {
	ID           string     `json:"id"`
	OrgID        string     `json:"org_id"`
	Name         string     `json:"name"`
	Address      *string    `json:"address"`
	City         *string    `json:"city"`
	State        *string    `json:"state"`
	Zip          *string    `json:"zip"`
	Lat          *float64   `json:"lat"`
	Lng          *float64   `json:"lng"`
	Phone        *string    `json:"phone"`
	ContactName  *string    `json:"contact_name"`
	ContactEmail *string    `json:"contact_email"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// Student maps to the students table.
// SchoolID has ON DELETE RESTRICT — students must be reassigned before school deletion.
type Student struct {
	ID            string     `json:"id"`
	OrgID         string     `json:"org_id"`
	SchoolID      string     `json:"school_id"`
	FirstName     string     `json:"first_name"`
	LastName      string     `json:"last_name"`
	StudentNumber *string    `json:"student_number"`
	Grade         *string    `json:"grade"`
	RFIDTagID     *string    `json:"rfid_tag_id"`
	Address       *string    `json:"address"`
	City          *string    `json:"city"`
	State         *string    `json:"state"`
	Zip           *string    `json:"zip"`
	Lat           *float64   `json:"lat"`
	Lng           *float64   `json:"lng"`
	Status        string     `json:"status"`
	MedicalNotes  *string    `json:"medical_notes"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// Guardian maps to the guardians table.
type Guardian struct {
	ID        string    `json:"id"`
	OrgID     string    `json:"org_id"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	Phone     string    `json:"phone"`
	AltPhone  *string   `json:"alt_phone"`
	Email     *string   `json:"email"`
	SMSOptIn  bool      `json:"sms_opt_in"`
	Language  string    `json:"language"`
	CreatedAt time.Time `json:"created_at"`
}

// StudentGuardian maps to the student_guardians table.
type StudentGuardian struct {
	ID           string `json:"id"`
	StudentID    string `json:"student_id"`
	GuardianID   string `json:"guardian_id"`
	Relationship string `json:"relationship"`
	IsPrimary    bool   `json:"is_primary"`
}

// ============================================================
// Fleet
// ============================================================

// Vehicle maps to the vehicles table.
type Vehicle struct {
	ID           string    `json:"id"`
	OrgID        string    `json:"org_id"`
	Name         string    `json:"name"`
	Number       *string   `json:"number"`
	Capacity     *int      `json:"capacity"`
	Year         *int      `json:"year"`
	Make         *string   `json:"make"`
	Model        *string   `json:"model"`
	VIN          *string   `json:"vin"`
	LicensePlate *string   `json:"license_plate"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Driver maps to the drivers table.
// RFIDBadgeID is AES-256-GCM encrypted; RFIDBadgeIDHash is used for lookups.
type Driver struct {
	ID              string     `json:"id"`
	OrgID           string     `json:"org_id"`
	UserID          *string    `json:"user_id"`
	FirstName       string     `json:"first_name"`
	LastName        string     `json:"last_name"`
	Phone           *string    `json:"phone"`
	LicenseNumber   *string    `json:"license_number"`
	LicenseExpiry   *pgtype.Date `json:"license_expiry"`
	PinHash         *string    `json:"-"`
	RFIDBadgeID     *string    `json:"rfid_badge_id"`
	RFIDBadgeIDHash *string    `json:"-"`
	Status          string     `json:"status"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// ============================================================
// Routes & Stops
// ============================================================

// Route maps to the routes table.
type Route struct {
	ID                   string    `json:"id"`
	OrgID                string    `json:"org_id"`
	Name                 string    `json:"name"`
	Type                 string    `json:"type"`
	Status               string    `json:"status"`
	Description          *string   `json:"description"`
	EstimatedDurationMin *int      `json:"estimated_duration_min"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

// Stop maps to the stops table.
type Stop struct {
	ID            string     `json:"id"`
	RouteID       string     `json:"route_id"`
	Name          string     `json:"name"`
	Address       *string    `json:"address"`
	Lat           *float64   `json:"lat"`
	Lng           *float64   `json:"lng"`
	SequenceOrder int        `json:"sequence_order"`
	ScheduledTime *string    `json:"scheduled_time"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// StudentStop maps to the student_stops table.
type StudentStop struct {
	ID            string     `json:"id"`
	StudentID     string     `json:"student_id"`
	StopID        string     `json:"stop_id"`
	RouteID       string     `json:"route_id"`
	EffectiveDate *pgtype.Date `json:"effective_date"`
	EndDate       *pgtype.Date `json:"end_date"`
}

// RouteAssignment maps to the route_assignments table.
type RouteAssignment struct {
	ID            string     `json:"id"`
	RouteID       string     `json:"route_id"`
	VehicleID     string     `json:"vehicle_id"`
	DriverID      string     `json:"driver_id"`
	EffectiveDate *pgtype.Date `json:"effective_date"`
	EndDate       *pgtype.Date `json:"end_date"`
	DaysOfWeek    string       `json:"days_of_week"`
	CreatedAt     time.Time  `json:"created_at"`
}

// ============================================================
// Live Operations
// ============================================================

// Trip maps to the trips table.
type Trip struct {
	ID                string     `json:"id"`
	RouteAssignmentID string     `json:"route_assignment_id"`
	OrgID             string     `json:"org_id"`
	Date              pgtype.Date `json:"date"`
	Status            string      `json:"status"`
	StartedAt         *time.Time  `json:"started_at"`
	CompletedAt       *time.Time `json:"completed_at"`
	Notes             *string    `json:"notes"`
	CreatedAt         time.Time  `json:"created_at"`
}

// TripLocation maps to the trip_locations table.
type TripLocation struct {
	ID         string     `json:"id"`
	TripID     string     `json:"trip_id"`
	Lat        float64    `json:"lat"`
	Lng        float64    `json:"lng"`
	Speed      *float64   `json:"speed"`
	Heading    *float64   `json:"heading"`
	RecordedAt time.Time  `json:"recorded_at"`
}

// ScanEvent maps to the scan_events table.
type ScanEvent struct {
	ID         string    `json:"id"`
	TripID     string    `json:"trip_id"`
	StudentID  *string   `json:"student_id"`
	StopID     *string   `json:"stop_id"`
	RFIDTagID  string    `json:"rfid_tag_id"`
	ScanType   string    `json:"scan_type"`
	Authorized bool      `json:"authorized"`
	RecordedAt time.Time `json:"recorded_at"`
}

// SMSMessage maps to the sms_messages table.
type SMSMessage struct {
	ID          string     `json:"id"`
	GuardianID  string     `json:"guardian_id"`
	TripID      *string    `json:"trip_id"`
	StudentID   *string    `json:"student_id"`
	MessageType string     `json:"message_type"`
	MessageBody string     `json:"message_body"`
	TwilioSID   *string    `json:"twilio_sid"`
	Status      string     `json:"status"`
	SentAt      *time.Time `json:"sent_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

// ============================================================
// Reporting
// ============================================================

// DailySummary maps to the daily_summaries table.
type DailySummary struct {
	ID            string     `json:"id"`
	OrgID         string     `json:"org_id"`
	RouteID       string     `json:"route_id"`
	Date          pgtype.Date `json:"date"`
	TotalStudents int         `json:"total_students"`
	BoardedCount  int        `json:"boarded_count"`
	OnTime        bool       `json:"on_time"`
	DelayMinutes  *int       `json:"delay_minutes"`
	Notes         *string    `json:"notes"`
	CreatedAt     time.Time  `json:"created_at"`
}

// AuditLog maps to the audit_logs table.
type AuditLog struct {
	ID         string          `json:"id"`
	ActorID    *string         `json:"actor_id"`
	ActorType  string          `json:"actor_type"`
	Action     string          `json:"action"`
	TargetType *string         `json:"target_type"`
	TargetID   *string         `json:"target_id"`
	Metadata   json.RawMessage `json:"metadata"`
	IPAddress  *string         `json:"ip_address"`
	CreatedAt  time.Time       `json:"created_at"`
}

