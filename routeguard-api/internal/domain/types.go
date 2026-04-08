package domain

import (
	"encoding/json"
	"time"
)

type User struct {
	ID           string     `json:"id"`
	EmailEnc     string     `json:"-"`
	EmailHash    string     `json:"-"`
	Email        string     `json:"email"`
	NameEnc      string     `json:"-"`
	Name         string     `json:"name"`
	PasswordHash *string    `json:"-"`
	DisabledAt   *time.Time `json:"disabled_at"`
	LastLoginAt  *time.Time `json:"last_login_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type Organization struct {
	ID                  string     `json:"id"`
	NameEnc             string     `json:"-"`
	Name                string     `json:"name"`
	Slug                string     `json:"slug"`
	IsPlatform          bool       `json:"is_platform"`
	IsDemo              bool       `json:"is_demo"`
	DemoTemplateVersion *string    `json:"demo_template_version"`
	DemoLastResetAt     *time.Time `json:"demo_last_reset_at"`
	SuspendedAt         *time.Time `json:"suspended_at"`
	DeletedAt           *time.Time `json:"deleted_at"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type OrgMembership struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	OrgID     string    `json:"org_id"`
	CreatedAt time.Time `json:"created_at"`
}

type OrgRole struct {
	ID          string    `json:"id"`
	OrgID       string    `json:"org_id"`
	Name        string    `json:"name"`
	Permissions []string  `json:"permissions"`
	IsSystem    bool      `json:"is_system"`
	CreatedAt   time.Time `json:"created_at"`
}

type OrgMemberRole struct {
	ID           string    `json:"id"`
	MembershipID string    `json:"membership_id"`
	RoleID       string    `json:"role_id"`
	CreatedAt    time.Time `json:"created_at"`
}

type SSOConnection struct {
	ID                  string    `json:"id"`
	OrgID               string    `json:"org_id"`
	Type                string    `json:"type"`
	DisplayName         string    `json:"display_name"`
	Enabled             bool      `json:"enabled"`
	OIDCIssuerURL       *string   `json:"oidc_issuer_url,omitempty"`
	OIDCClientID        *string   `json:"oidc_client_id,omitempty"`
	OIDCClientSecretEnc *string   `json:"-"`
	OIDCScopes          *string   `json:"oidc_scopes,omitempty"`
	SAMLEntityID        *string   `json:"saml_entity_id,omitempty"`
	SAMLSSOURL          *string   `json:"saml_sso_url,omitempty"`
	SAMLCertificateEnc  *string   `json:"-"`
	SAMLMetadataURL     *string   `json:"saml_metadata_url,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type UserIdentity struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	Provider       string    `json:"provider"`
	ProviderUserID *string   `json:"provider_user_id,omitempty"`
	Metadata       []byte    `json:"metadata,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// SessionPayload is stored in Redis as the session value.
type SessionPayload struct {
	UserID      string   `json:"user_id"`
	OrgID       string   `json:"org_id"`
	HomeOrgID   string   `json:"home_org_id"`
	Permissions []string `json:"permissions"`
	CreatedAt   int64    `json:"created_at"`
}

// AuthMethodsResponse is returned by the /auth/lookup endpoint.
type AuthMethodsResponse struct {
	HasPassword bool              `json:"has_password"`
	SSOOptions  []SSOOptionPublic `json:"sso_options"`
}

// SSOOptionPublic is the public-facing SSO connection info for the login page.
type SSOOptionPublic struct {
	ConnectionID string `json:"connection_id"`
	Type         string `json:"type"`
	DisplayName  string `json:"display_name"`
	OrgSlug      string `json:"org_slug"`
	OrgName      string `json:"org_name"`
}

// OrgSummary is a lightweight org representation for the org selector.
type OrgSummary struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Slug       string `json:"slug"`
	IsPlatform bool   `json:"is_platform"`
}

// MeResponse is returned by /auth/me.
type MeResponse struct {
	User        User       `json:"user"`
	ActiveOrg   OrgSummary `json:"active_org"`
	HomeOrgID   string     `json:"home_org_id"`
	Permissions []string   `json:"permissions"`
}

type AuditEvent struct {
	ID         string          `json:"id"`
	ActorID    string          `json:"actor_id"`
	ActorEmail string          `json:"actor_email"`
	OrgID      *string         `json:"org_id"`
	EventType  string          `json:"event_type"`
	TargetType string          `json:"target_type"`
	TargetID   *string         `json:"target_id"`
	Metadata   json.RawMessage `json:"metadata"`
	IPAddress  *string         `json:"ip_address"`
	CreatedAt  time.Time       `json:"created_at"`
}

type OrgBilling struct {
	ID                  string     `json:"id"`
	OrgID               string     `json:"org_id"`
	BillingStatus       string     `json:"billing_status"`
	PilotEndsAt         *time.Time `json:"pilot_ends_at"`
	ContractNotes       string     `json:"contract_notes"`
	BillingContactEmail string     `json:"billing_contact_email"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type Integration struct {
	ID           string     `json:"id"`
	OrgID        string     `json:"org_id"`
	Type         string     `json:"type"`
	DisplayName  string     `json:"display_name"`
	BaseURL      string     `json:"base_url"`
	APIKeyEnc    string     `json:"-"`
	APISecretEnc string     `json:"-"`
	HasAPIKey    bool       `json:"has_api_key"`
	HasAPISecret bool       `json:"has_api_secret"`
	Enabled      bool       `json:"enabled"`
	SyncSchedule *string    `json:"sync_schedule"`
	LastSyncedAt *time.Time `json:"last_synced_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type Student struct {
	ID              string     `json:"id"`
	OrgID           string     `json:"org_id"`
	StudentID       string     `json:"student_id"`
	FirstName       string     `json:"first_name"`
	LastName        string     `json:"last_name"`
	Grade           string     `json:"grade"`
	School          string     `json:"school"`
	GuardianName    string     `json:"guardian_name"`
	GuardianContact string     `json:"guardian_contact"`
	IsActive        bool       `json:"is_active"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	DeletedAt       *time.Time `json:"deleted_at,omitempty"`
}

type School struct {
	ID           string     `json:"id"`
	OrgID        string     `json:"org_id"`
	SchoolID     string     `json:"school_id"`
	Name         string     `json:"name"`
	Address      string     `json:"address"`
	ContactPhone string     `json:"contact_phone"`
	IsActive     bool       `json:"is_active"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	DeletedAt    *time.Time `json:"deleted_at,omitempty"`
}

type Vehicle struct {
	ID           string     `json:"id"`
	OrgID        string     `json:"org_id"`
	VehicleID    string     `json:"vehicle_id"`
	LicensePlate string     `json:"license_plate"`
	Capacity     int        `json:"capacity"`
	IsActive     bool       `json:"is_active"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	DeletedAt    *time.Time `json:"deleted_at,omitempty"`
}

type Driver struct {
	ID          string     `json:"id"`
	OrgID       string     `json:"org_id"`
	DriverID    string     `json:"driver_id"`
	Name        string     `json:"name"`
	Phone       string     `json:"phone"`
	IsAvailable bool       `json:"is_available"`
	IsActive    bool       `json:"is_active"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty"`
}

type Stop struct {
	ID        string     `json:"id"`
	OrgID     string     `json:"org_id"`
	StopID    string     `json:"stop_id"`
	Name      string     `json:"name"`
	Address   string     `json:"address"`
	Latitude  float64    `json:"latitude"`
	Longitude float64    `json:"longitude"`
	Notes     string     `json:"notes"`
	IsActive  bool       `json:"is_active"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
}

type DriverVehicleAssignment struct {
	ID        string     `json:"id"`
	OrgID     string     `json:"org_id"`
	DriverID  string     `json:"driver_id"`
	VehicleID string     `json:"vehicle_id"`
	IsActive  bool       `json:"is_active"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
}

type PlannerRun struct {
	ID            string     `json:"id"`
	OrgID         string     `json:"org_id"`
	Mode          string     `json:"mode"`
	ServiceWindow string     `json:"service_window"`
	Status        string     `json:"status"`
	CreatedBy     string     `json:"created_by"`
	CreatedAt     time.Time  `json:"created_at"`
	PublishedAt   *time.Time `json:"published_at"`
}

type Route struct {
	ID                     string     `json:"id"`
	OrgID                  string     `json:"org_id"`
	PlannerRunID           string     `json:"planner_run_id"`
	RouteCode              string     `json:"route_code"`
	ServiceWindow          string     `json:"service_window"`
	Status                 string     `json:"status"`
	ObjectiveMode          string     `json:"objective_mode"`
	VehicleID              *string    `json:"vehicle_id,omitempty"`
	DriverID               *string    `json:"driver_id,omitempty"`
	EstimatedTravelMinutes int        `json:"estimated_travel_minutes"`
	AssignedStudents       int        `json:"assigned_students"`
	SeatUtilization        float64    `json:"seat_utilization"`
	UnassignedCount        int        `json:"unassigned_count"`
	CreatedAt              time.Time  `json:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at"`
	DeletedAt              *time.Time `json:"deleted_at,omitempty"`
}

type RouteStop struct {
	ID           string    `json:"id"`
	RouteID      string    `json:"route_id"`
	StopID       string    `json:"stop_id"`
	StopOrder    int       `json:"stop_order"`
	ETAMinutes   int       `json:"eta_minutes"`
	StudentCount int       `json:"student_count"`
	CreatedAt    time.Time `json:"created_at"`
}

type RouteStudent struct {
	ID        string    `json:"id"`
	RouteID   string    `json:"route_id"`
	StudentID string    `json:"student_id"`
	StopID    string    `json:"stop_id"`
	StopOrder int       `json:"stop_order"`
	CreatedAt time.Time `json:"created_at"`
}

type SoftwareRelease struct {
	ID           string    `json:"id"`
	Version      string    `json:"version"`
	ReleaseDate  string    `json:"release_date"`
	ReleaseNotes string    `json:"release_notes"`
	CreatedAt    time.Time `json:"created_at"`
}

type PlatformStats struct {
	TotalOrgs      int `json:"total_orgs"`
	SuspendedOrgs  int `json:"suspended_orgs"`
	TotalUsers     int `json:"total_users"`
	ActiveSessions int `json:"active_sessions"`
	ActiveTrips    int `json:"active_trips"`
}

type DemoResetRun struct {
	ID              string     `json:"id"`
	OrgID           string     `json:"org_id"`
	TemplateVersion string     `json:"template_version"`
	ResetMode       string     `json:"reset_mode"`
	Status          string     `json:"status"`
	StartedByUserID string     `json:"started_by_user_id"`
	StartedByEmail  string     `json:"started_by_email"`
	StartedAt       time.Time  `json:"started_at"`
	CompletedAt     *time.Time `json:"completed_at"`
	LastError       *string    `json:"last_error"`
}

type PageResponse[T any] struct {
	Items      []T `json:"items"`
	Total      int `json:"total"`
	Page       int `json:"page"`
	PerPage    int `json:"per_page"`
	TotalPages int `json:"total_pages"`
}

type CursorResponse[T any] struct {
	Items      []T    `json:"items"`
	NextCursor string `json:"next_cursor"`
	HasMore    bool   `json:"has_more"`
}

type UserDetail struct {
	User
	Memberships []UserOrgMembership `json:"memberships"`
}

type UserOrgMembership struct {
	OrgID   string    `json:"org_id"`
	OrgName string    `json:"org_name"`
	OrgSlug string    `json:"org_slug"`
	Roles   []OrgRole `json:"roles"`
}

type SupportTicket struct {
	ID                  string     `json:"id"`
	OrgID               string     `json:"org_id"`
	CreatedByUserID     string     `json:"created_by_user_id"`
	AssignedAdminUserID *string    `json:"assigned_admin_user_id"`
	Subject             string     `json:"subject"`
	Status              string     `json:"status"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
	LastMessageAt       time.Time  `json:"last_message_at"`
	ResolvedAt          *time.Time `json:"resolved_at"`
}

type SupportMessage struct {
	ID               string    `json:"id"`
	TicketID         string    `json:"ticket_id"`
	SenderUserID     string    `json:"sender_user_id"`
	SenderOrgID      string    `json:"sender_org_id"`
	SenderIsPlatform bool      `json:"sender_is_platform"`
	Body             string    `json:"body"`
	CreatedAt        time.Time `json:"created_at"`
}
