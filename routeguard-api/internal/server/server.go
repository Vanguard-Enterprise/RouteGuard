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

type Server struct {
	router chi.Router
	cfg    *config.Config
	pool   *pgxpool.Pool
	cache  *cache.Cache
}

func New(cfg *config.Config, pool *pgxpool.Pool, c *cache.Cache) (*Server, error) {
	s := &Server{cfg: cfg, pool: pool, cache: c}
	s.router = s.buildRouter()
	return s, nil
}

func (s *Server) buildRouter() chi.Router {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Recoverer)
	r.Use(corsMiddleware(s.cfg))

	h := api.NewHandler(s.pool, s.cache, s.cfg)

	// Health checks
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Auth routes
	r.Post("/auth/login", h.Login)
	r.Post("/auth/logout", h.Logout)
	r.With(middleware.Authenticate(s.cache)).Get("/auth/me", h.Me)

	// SSO routes — OIDC
	r.Get("/auth/sso/{slug}/init", h.OIDCInit)
	r.Get("/auth/sso/callback", h.OIDCCallback)

	// SSO routes — SAML 2.0
	r.Get("/auth/sso/saml/metadata", h.SAMLMetadata)
	r.Get("/auth/sso/{slug}/saml/init", h.SAMLInit)
	r.Post("/auth/sso/saml/acs", h.SAMLACS)

	// Device provisioning (no device auth — this is how devices obtain their credential)
	r.Post("/api/v1/devices/provision", h.ProvisionDevice)

	// Device-authenticated routes
	r.With(middleware.DeviceAuthenticate(s.pool, s.cache)).Post("/api/v1/devices/heartbeat", h.DeviceHeartbeat)

	// Driver auth — PIN and RFID (device auth required; auth comes from the device hardware)
	r.With(middleware.DeviceAuthenticate(s.pool, s.cache)).Post("/api/v1/auth/pin", h.DriverPINAuth)
	r.With(middleware.DeviceAuthenticate(s.pool, s.cache)).Post("/api/v1/auth/rfid", h.DriverRFIDAuth)

	// Admin routes — staff only
	r.Route("/admin", func(r chi.Router) {
		r.Use(middleware.Authenticate(s.cache))
		r.Use(middleware.RequireStaff)

		// Organization CRUD
		r.Get("/organizations", h.ListOrgs)
		r.Post("/organizations", h.CreateOrg)
		r.Get("/organizations/{id}", h.GetOrg)
		r.Patch("/organizations/{id}", h.UpdateOrg)
		r.Delete("/organizations/{id}", h.DeleteOrg)

		// SSO connections (admin manages by org)
		r.Get("/organizations/{id}/sso", h.ListOrgSSO)
		r.Post("/organizations/{id}/sso", h.CreateOrgSSO)
		r.Patch("/organizations/{id}/sso/{connectionId}", h.UpdateOrgSSO)
		r.Delete("/organizations/{id}/sso/{connectionId}", h.DeleteOrgSSO)

		// Device admin
		r.Get("/devices", h.ListAdminDevices)
		r.Post("/devices", h.CreateAdminDevice)
		r.Patch("/devices/{id}", h.UpdateAdminDevice)
		r.Delete("/devices/{id}", h.DeleteAdminDevice)

		// Audit logs
		r.Get("/audit-logs", h.ListAuditLogs)
	})

	// Dashboard routes — authenticated org users
	r.Route("/dashboard", func(r chi.Router) {
		r.Use(middleware.Authenticate(s.cache))

		// SSO settings (org admin permission required)
		r.With(middleware.RequirePermission("org:manage")).Get("/settings/sso", h.ListMySSO)
		r.With(middleware.RequirePermission("org:manage")).Post("/settings/sso", h.CreateMySSO)
		r.With(middleware.RequirePermission("org:manage")).Patch("/settings/sso/{id}", h.UpdateMySSO)
		r.With(middleware.RequirePermission("org:manage")).Delete("/settings/sso/{id}", h.DeleteMySSO)

		// Audit logs (org admin permission required)
		r.With(middleware.RequirePermission("org:manage")).Get("/audit-logs", h.ListMyAuditLogs)

		// Schools
		r.With(middleware.RequirePermission("schools:read")).Get("/schools", h.ListMySchools)
		r.With(middleware.RequirePermission("schools:write")).Post("/schools", h.CreateMySchool)
		r.With(middleware.RequirePermission("schools:read")).Get("/schools/{id}", h.GetMySchool)
		r.With(middleware.RequirePermission("schools:write")).Patch("/schools/{id}", h.UpdateMySchool)
		r.With(middleware.RequirePermission("schools:write")).Delete("/schools/{id}", h.DeleteMySchool)

		// Students
		r.With(middleware.RequirePermission("students:read")).Get("/students", h.ListMyStudents)
		r.With(middleware.RequirePermission("students:write")).Post("/students", h.CreateMyStudent)
		r.With(middleware.RequirePermission("students:write")).Post("/students/import", h.ImportStudents)
		r.With(middleware.RequirePermission("students:read")).Get("/students/{id}", h.GetMyStudent)
		r.With(middleware.RequirePermission("students:write")).Patch("/students/{id}", h.UpdateMyStudent)
		r.With(middleware.RequirePermission("students:write")).Delete("/students/{id}", h.DeleteMyStudent)

		// Guardians (nested under students)
		r.With(middleware.RequirePermission("guardians:read")).Get("/students/{studentId}/guardians", h.ListStudentGuardians)
		r.With(middleware.RequirePermission("guardians:write")).Post("/students/{studentId}/guardians", h.CreateStudentGuardian)
	})

	return r
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func corsMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin == cfg.BaseURL || origin == "http://localhost:3000" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
