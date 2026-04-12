package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/api"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/middleware"
)

// PlatformOrgID is the well-known UUID for the RouteGuard platform organization.
const PlatformOrgID = "00000000-0000-0000-0000-000000000001"

type Server struct {
	router chi.Router
	cfg    *config.Config
	pool   *pgxpool.Pool
	cache  *cache.Cache
}

func New(cfg *config.Config, pool *pgxpool.Pool, c *cache.Cache) *Server {
	s := &Server{cfg: cfg, pool: pool, cache: c}
	s.router = s.buildRouter()
	return s
}

func (s *Server) buildRouter() chi.Router {
	r := chi.NewRouter()

	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Recoverer)
	r.Use(corsMiddleware(s.cfg))

	h := api.NewHandler(s.pool, s.cache, s.cfg)
	auditEvents := middleware.AuditEvents(s.pool, s.cfg)

	// Health checks
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Public auth (rate-limited)
	r.With(middleware.RateLimit(s.cache, 20)).Post("/auth/lookup", h.Lookup)
	r.With(middleware.RateLimit(s.cache, 20)).Post("/auth/login", h.Login)
	r.With(middleware.RateLimit(s.cache, 20)).Post("/auth/magic-link/consume", h.ConsumeMagicLink)

	// Device routes
	r.With(middleware.RateLimit(s.cache, 120)).Post("/device/bootstrap", h.DeviceBootstrap)
	r.With(middleware.RateLimit(s.cache, 120)).Post("/device/enrollment-code", h.DeviceEnrollmentCode)
	r.With(middleware.RateLimit(s.cache, 120)).Post("/device/enrollment-status", h.DeviceEnrollmentStatus)
	r.With(middleware.RateLimit(s.cache, 120)).Post("/device/check-in", h.DeviceCheckIn)
	r.With(middleware.RateLimit(s.cache, 120)).Post("/device/rfid-events", h.DeviceRFIDEvents)
	r.With(middleware.RateLimit(s.cache, 120)).Post("/device/driver-login", h.DeviceDriverLogin)
	r.With(middleware.RateLimit(s.cache, 120)).Get("/device/driver-home", h.DeviceDriverHome)
	r.With(middleware.RateLimit(s.cache, 120)).Get("/device/navigation/search", h.DeviceNavigationSearch)
	r.With(middleware.RateLimit(s.cache, 120)).Post("/device/navigation/directions", h.DeviceNavigationDirections)
	r.With(middleware.RateLimit(s.cache, 120)).Get("/device/mapbox/proxy", h.DeviceMapboxProxy)
	r.With(middleware.RateLimit(s.cache, 120)).Get("/device/releases/latest", h.DeviceLatestRelease)

	// Authenticated auth
	r.With(middleware.Authenticate(s.cache, s.pool), auditEvents).Post("/auth/logout", h.Logout)
	r.With(middleware.Authenticate(s.cache, s.pool), auditEvents).Get("/auth/me", h.Me)
	r.With(middleware.Authenticate(s.cache, s.pool), auditEvents).Post("/auth/switch-org", h.SwitchOrg)
	r.With(middleware.Authenticate(s.cache, s.pool), auditEvents).Get("/auth/orgs", h.ListMyOrgs)

	// Platform admin routes
	r.Route("/platform", func(r chi.Router) {
		r.Use(middleware.Authenticate(s.cache, s.pool))
		r.Use(auditEvents)
		r.Use(middleware.RequirePlatform(PlatformOrgID))

		// Orgs
		r.Get("/orgs", h.PlatformListOrgs)
		r.Post("/orgs", h.PlatformCreateOrg)
		r.Get("/orgs/{id}", h.PlatformGetOrg)
		r.Put("/orgs/{id}", h.PlatformUpdateOrg)
		r.Delete("/orgs/{id}", h.PlatformDeleteOrg)
		r.Post("/orgs/{id}/suspend", h.PlatformSuspendOrg)
		r.Post("/orgs/{id}/reactivate", h.PlatformReactivateOrg)
		r.Get("/orgs/{id}/members", h.PlatformListOrgMembers)
		r.Post("/orgs/{id}/members", h.PlatformAddOrgMember)
		r.Delete("/orgs/{id}/members/{userId}", h.PlatformRemoveOrgMember)
		r.Put("/orgs/{id}/members/{userId}/roles", h.PlatformUpdateMemberRoles)
		r.Get("/orgs/{id}/billing", h.PlatformGetBilling)
		r.Put("/orgs/{id}/billing", h.PlatformUpdateBilling)
		r.Get("/orgs/{id}/demo-reset", h.PlatformGetDemoResetStatus)
		r.Post("/orgs/{id}/demo-reset", h.PlatformResetDemoOrg)

		// Users
		r.Post("/users", h.PlatformCreateUser)
		r.Get("/users", h.PlatformListUsers)
		r.Get("/users/{id}", h.PlatformGetUser)
		r.Post("/users/{id}/disable", h.PlatformDisableUser)
		r.Post("/users/{id}/enable", h.PlatformEnableUser)
		r.Post("/users/{id}/reset-password", h.PlatformResetPassword)
		r.Delete("/users/{id}/sessions", h.PlatformRevokeSessions)

		// Audit
		r.Get("/audit", h.PlatformListAudit)

		// Billing (list all)
		r.Get("/billing", h.PlatformListAllBilling)

		// Stats
		r.Get("/stats", h.PlatformStats)

		// Updates
		r.Get("/updates/releases", h.PlatformListSoftwareReleases)
		r.Post("/updates/releases", h.PlatformCreateSoftwareRelease)
		r.Get("/updates/install-command", h.PlatformGetInstallCommand)
		r.Get("/updates/rollout", h.PlatformGetRollout)

		// Support
		r.Get("/support/tickets", h.PlatformListSupportTickets)
		r.Get("/support/tickets/{id}", h.PlatformGetSupportTicket)
		r.Patch("/support/tickets/{id}", h.PlatformUpdateSupportTicket)
		r.Get("/support/tickets/{id}/messages", h.PlatformListSupportMessages)
		r.Post("/support/tickets/{id}/messages", h.PlatformPostSupportMessage)
		r.Get("/support/stream", h.PlatformSupportStream)
	})

	// Org-level routes (session-scoped)
	r.Route("/org", func(r chi.Router) {
		r.Use(middleware.Authenticate(s.cache, s.pool))
		r.Use(auditEvents)

		r.Get("/settings", h.OrgGetSettings)
		r.With(middleware.RequirePermission("org:manage")).Put("/settings", h.OrgUpdateSettings)

		r.With(middleware.RequirePermission("members:read")).Get("/members", h.OrgListMembers)
		r.With(middleware.RequirePermission("members:write")).Post("/members", h.OrgCreateMember)
		r.With(middleware.RequirePermission("members:write")).Post("/members/invite", h.OrgInviteMember)
		r.With(middleware.RequirePermission("members:write")).Delete("/members/{userId}", h.OrgRemoveMember)
		r.With(middleware.RequirePermission("roles:write")).Put("/members/{userId}/roles", h.OrgUpdateMemberRoles)
		r.With(middleware.RequirePermission("roles:read")).Get("/roles", h.OrgListRoles)

		r.With(middleware.RequirePermission("sso:read")).Get("/sso", h.OrgListSSO)
		r.With(middleware.RequirePermission("sso:write")).Post("/sso", h.OrgCreateSSO)
		r.With(middleware.RequirePermission("sso:write")).Put("/sso/{id}", h.OrgUpdateSSO)
		r.With(middleware.RequirePermission("sso:write")).Delete("/sso/{id}", h.OrgDeleteSSO)

		r.Get("/billing", h.OrgGetBilling)
		r.With(middleware.RequirePermission("org:manage")).Put("/billing/contact", h.OrgUpdateBillingContact)

		r.Get("/integrations", h.OrgListIntegrations)
		r.With(middleware.RequirePermission("org:manage")).Post("/integrations", h.OrgCreateIntegration)
		r.With(middleware.RequirePermission("org:manage")).Put("/integrations/{id}", h.OrgUpdateIntegration)
		r.With(middleware.RequirePermission("org:manage")).Delete("/integrations/{id}", h.OrgDeleteIntegration)

		r.With(middleware.RequirePermission("org:manage")).Get("/devices", h.OrgListDevices)
		r.With(middleware.RequirePermission("org:manage")).Post("/devices/claim", h.OrgClaimDevice)
		r.With(middleware.RequirePermission("org:manage")).Put("/devices/{id}", h.OrgUpdateDevice)
		r.With(middleware.RequirePermission("org:manage")).Post("/devices/{id}/reset", h.OrgResetDevice)

		r.With(middleware.RequirePermission("org:manage")).Get("/students", h.OrgListStudents)
		r.With(middleware.RequirePermission("org:manage")).Get("/students/filter-options", h.OrgListStudentFilterOptions)
		r.With(middleware.RequirePermission("org:manage")).Get("/students/deleted", h.OrgListDeletedStudents)
		r.With(middleware.RequirePermission("org:manage")).Post("/students", h.OrgCreateStudent)
		r.With(middleware.RequirePermission("org:manage")).Put("/students/status", h.OrgBulkUpdateStudentStatus)
		r.With(middleware.RequirePermission("org:manage")).Delete("/students", h.OrgBulkDeleteStudents)
		r.With(middleware.RequirePermission("org:manage")).Get("/students/{id}", h.OrgGetStudent)
		r.With(middleware.RequirePermission("org:manage")).Put("/students/{id}", h.OrgUpdateStudent)
		r.With(middleware.RequirePermission("org:manage")).Delete("/students/{id}", h.OrgDeleteStudent)
		r.With(middleware.RequirePermission("org:manage")).Post("/students/{id}/restore", h.OrgRestoreStudent)

		r.With(middleware.RequirePermission("org:manage")).Get("/schools", h.OrgListSchools)
		r.With(middleware.RequirePermission("org:manage")).Get("/schools/deleted", h.OrgListDeletedSchools)
		r.With(middleware.RequirePermission("org:manage")).Post("/schools", h.OrgCreateSchool)
		r.With(middleware.RequirePermission("org:manage")).Get("/schools/{id}", h.OrgGetSchool)
		r.With(middleware.RequirePermission("org:manage")).Put("/schools/{id}", h.OrgUpdateSchool)
		r.With(middleware.RequirePermission("org:manage")).Delete("/schools/{id}", h.OrgDeleteSchool)
		r.With(middleware.RequirePermission("org:manage")).Post("/schools/{id}/restore", h.OrgRestoreSchool)

		r.With(middleware.RequirePermission("vehicles:read")).Get("/vehicles", h.OrgListVehicles)
		r.With(middleware.RequirePermission("vehicles:read")).Get("/vehicles/deleted", h.OrgListDeletedVehicles)
		r.With(middleware.RequirePermission("vehicles:write")).Post("/vehicles", h.OrgCreateVehicle)
		r.With(middleware.RequirePermission("vehicles:read")).Get("/vehicles/{id}", h.OrgGetVehicle)
		r.With(middleware.RequirePermission("vehicles:write")).Put("/vehicles/{id}", h.OrgUpdateVehicle)
		r.With(middleware.RequirePermission("vehicles:write")).Delete("/vehicles/{id}", h.OrgDeleteVehicle)
		r.With(middleware.RequirePermission("vehicles:write")).Post("/vehicles/{id}/restore", h.OrgRestoreVehicle)

		r.With(middleware.RequirePermission("drivers:read")).Get("/drivers", h.OrgListDrivers)
		r.With(middleware.RequirePermission("drivers:read")).Get("/drivers/deleted", h.OrgListDeletedDrivers)
		r.With(middleware.RequirePermission("drivers:write")).Post("/drivers", h.OrgCreateDriver)
		r.With(middleware.RequirePermission("drivers:read")).Get("/drivers/{id}", h.OrgGetDriver)
		r.With(middleware.RequirePermission("drivers:write")).Put("/drivers/{id}", h.OrgUpdateDriver)
		r.With(middleware.RequirePermission("drivers:write")).Delete("/drivers/{id}", h.OrgDeleteDriver)
		r.With(middleware.RequirePermission("drivers:write")).Post("/drivers/{id}/restore", h.OrgRestoreDriver)
		r.With(middleware.RequirePermission("drivers:write")).Put("/drivers/{id}/pin", h.OrgSetDriverPIN)
		r.With(middleware.RequirePermission("drivers:write")).Delete("/drivers/{id}/pin", h.OrgClearDriverPIN)

		r.With(middleware.RequirePermission("stops:read")).Get("/stops", h.OrgListStops)
		r.With(middleware.RequirePermission("stops:read")).Get("/stops/deleted", h.OrgListDeletedStops)
		r.With(middleware.RequirePermission("stops:write")).Post("/stops", h.OrgCreateStop)
		r.With(middleware.RequirePermission("stops:read")).Get("/stops/{id}", h.OrgGetStop)
		r.With(middleware.RequirePermission("stops:write")).Put("/stops/{id}", h.OrgUpdateStop)
		r.With(middleware.RequirePermission("stops:write")).Delete("/stops/{id}", h.OrgDeleteStop)
		r.With(middleware.RequirePermission("stops:write")).Post("/stops/{id}/restore", h.OrgRestoreStop)
		r.With(middleware.RequirePermission("stops:write")).Put("/students/{id}/stop-assignment", h.OrgUpsertStudentStopAssignment)

		r.With(middleware.RequirePermission("routes:read")).Get("/routes", h.OrgListRoutes)
		r.With(middleware.RequirePermission("routes:read")).Get("/routes/deleted", h.OrgListDeletedRoutes)
		r.With(middleware.RequirePermission("routes:read")).Get("/routes/{id}", h.OrgGetRoute)
		r.With(middleware.RequirePermission("routes:write")).Put("/routes/{id}", h.OrgUpdateRoute)
		r.With(middleware.RequirePermission("routes:write")).Delete("/routes/{id}", h.OrgDeleteRoute)
		r.With(middleware.RequirePermission("routes:write")).Post("/routes/{id}/restore", h.OrgRestoreRoute)
		r.With(middleware.RequirePermission("routes:write")).Get("/driver-vehicle-assignments", h.OrgListDriverVehicleAssignments)
		r.With(middleware.RequirePermission("routes:write")).Post("/driver-vehicle-assignments", h.OrgUpsertDriverVehicleAssignment)

		r.With(middleware.RequirePermission("planning:run")).Post("/planner-runs", h.OrgCreatePlannerRun)
		r.With(middleware.RequirePermission("planning:run")).Get("/planner-runs", h.OrgListPlannerRuns)
		r.With(middleware.RequirePermission("planning:run")).Get("/planner-runs/{id}", h.OrgGetPlannerRun)
		r.With(middleware.RequirePermission("planning:publish")).Post("/planner-runs/{id}/publish", h.OrgPublishPlannerRun)

		r.Get("/support/tickets", h.OrgListSupportTickets)
		r.Post("/support/tickets", h.OrgCreateSupportTicket)
		r.Get("/support/tickets/{id}", h.OrgGetSupportTicket)
		r.Get("/support/tickets/{id}/messages", h.OrgListSupportMessages)
		r.Post("/support/tickets/{id}/messages", h.OrgPostSupportMessage)
		r.Get("/support/stream", h.OrgSupportStream)
	})

	return r
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func corsMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
	allowedOrigins := map[string]struct{}{
		cfg.BaseURL:             {},
		"http://localhost:3000": {},
		"null":                  {},
		"qrc:":                  {},
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if _, ok := allowedOrigins[origin]; ok {
				w.Header().Add("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-RouteGuard-Driver-Session")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
