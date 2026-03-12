package api

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/repository"
)

type Handler struct {
	pool    *pgxpool.Pool
	cache   *cache.Cache
	cfg     *config.Config
	users   *repository.UserRepo
	orgs    *repository.OrgRepo
	members *repository.MembershipRepo
	roles   *repository.RoleRepo
	sso     *repository.SSORepo
	audit        *repository.AuditRepo
	billing      *repository.BillingRepo
	integrations *repository.IntegrationRepo
}

func NewHandler(pool *pgxpool.Pool, c *cache.Cache, cfg *config.Config) *Handler {
	return &Handler{
		pool:    pool,
		cache:   c,
		cfg:     cfg,
		users:   repository.NewUserRepo(pool),
		orgs:    repository.NewOrgRepo(pool),
		members: repository.NewMembershipRepo(pool),
		roles:   repository.NewRoleRepo(pool),
		sso:     repository.NewSSORepo(pool),
		audit:        repository.NewAuditRepo(pool),
		billing:      repository.NewBillingRepo(pool),
		integrations: repository.NewIntegrationRepo(pool),
	}
}
