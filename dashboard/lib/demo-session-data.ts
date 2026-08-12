import type { AuthUser, MeResponse, OrgOption } from "./api"

export const DEMO_ORG: OrgOption = {
  id: "demo-org",
  name: "RouteGuard Demo District",
  slug: "routeguard-demo",
  is_platform: false,
}

export const DEMO_USER: AuthUser = {
  id: "demo-user",
  email: "demo@route-guard.local",
  name: "Demo User",
}

export const DEMO_ME: MeResponse = {
  user: DEMO_USER,
  active_org: DEMO_ORG,
  home_org_id: DEMO_ORG.id,
  permissions: [
    "org:manage",
    "vehicles:read",
    "vehicles:write",
    "drivers:read",
    "drivers:write",
    "stops:read",
    "stops:write",
    "planning:run",
  ],
}
