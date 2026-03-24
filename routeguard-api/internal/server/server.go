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

	// Authenticated auth
	r.With(middleware.Authenticate(s.cache, s.pool)).Post("/auth/logout", h.Logout)
	r.With(middleware.Authenticate(s.cache, s.pool)).Get("/auth/me", h.Me)
	r.With(middleware.Authenticate(s.cache, s.pool)).Post("/auth/switch-org", h.SwitchOrg)
	r.With(middleware.Authenticate(s.cache, s.pool)).Get("/auth/orgs", h.ListMyOrgs)

	// Platform admin routes
	r.Route("/platform", func(r chi.Router) {
		r.Use(middleware.Authenticate(s.cache, s.pool))
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
	})

	// Org-level routes (session-scoped)
	r.Route("/org", func(r chi.Router) {
		r.Use(middleware.Authenticate(s.cache, s.pool))

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
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
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
