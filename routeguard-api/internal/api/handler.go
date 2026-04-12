package api

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/demo"
	"github.com/routeguard/api/internal/repository"
)

type Handler struct {
	pool             *pgxpool.Pool
	cache            *cache.Cache
	cfg              *config.Config
	users            *repository.UserRepo
	orgs             *repository.OrgRepo
	members          *repository.MembershipRepo
	roles            *repository.RoleRepo
	sso              *repository.SSORepo
	audit            *repository.AuditRepo
	billing          *repository.BillingRepo
	demoResets       *repository.DemoResetRepo
	demoService      *demo.Service
	integrations     *repository.IntegrationRepo
	students         *repository.StudentRepo
	schools          *repository.SchoolRepo
	vehicles         *repository.VehicleRepo
	devices          *repository.DeviceRepo
	drivers          *repository.DriverRepo
	stops            *repository.StopRepo
	routes           *repository.RouteRepo
	planner          *repository.PlannerRepo
	support          *repository.SupportRepo
	httpClient       *http.Client
	googleBaseURL    string
	nominatimBaseURL string
	mapboxBaseURL    string
}

func NewHandler(pool *pgxpool.Pool, c *cache.Cache, cfg *config.Config) *Handler {
	return &Handler{
		pool:             pool,
		cache:            c,
		cfg:              cfg,
		users:            repository.NewUserRepo(pool),
		orgs:             repository.NewOrgRepo(pool),
		members:          repository.NewMembershipRepo(pool),
		roles:            repository.NewRoleRepo(pool),
		sso:              repository.NewSSORepo(pool),
		audit:            repository.NewAuditRepo(pool),
		billing:          repository.NewBillingRepo(pool),
		demoResets:       repository.NewDemoResetRepo(pool),
		demoService:      demo.NewService(pool, cfg),
		integrations:     repository.NewIntegrationRepo(pool),
		students:         repository.NewStudentRepo(pool),
		schools:          repository.NewSchoolRepo(pool),
		vehicles:         repository.NewVehicleRepo(pool),
		devices:          repository.NewDeviceRepo(pool),
		drivers:          repository.NewDriverRepo(pool),
		stops:            repository.NewStopRepo(pool),
		routes:           repository.NewRouteRepo(pool),
		planner:          repository.NewPlannerRepo(pool),
		support:          repository.NewSupportRepo(pool),
		httpClient:       http.DefaultClient,
		googleBaseURL:    "https://places.googleapis.com/v1",
		nominatimBaseURL: "https://nominatim.openstreetmap.org",
		mapboxBaseURL:    "https://api.mapbox.com",
	}
}
