CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    driver_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_drivers_org_driver_id_active
    ON drivers (org_id, driver_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_drivers_org_id ON drivers(org_id);
CREATE INDEX idx_drivers_org_active ON drivers(org_id, is_active, is_available);

CREATE TABLE stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    stop_id TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_stops_org_stop_id_active
    ON stops (org_id, stop_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_stops_org_id ON stops(org_id);
CREATE INDEX idx_stops_org_active ON stops(org_id, is_active);

CREATE TABLE student_stop_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    stop_id UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
    service_window TEXT NOT NULL CHECK (service_window IN ('AM', 'PM')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_student_stop_assignments_active
    ON student_stop_assignments (org_id, student_id, service_window)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_student_stop_assignments_org_stop
    ON student_stop_assignments (org_id, stop_id, service_window)
    WHERE deleted_at IS NULL;

CREATE TABLE driver_vehicle_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_driver_vehicle_assignments_driver_active
    ON driver_vehicle_assignments (org_id, driver_id)
    WHERE deleted_at IS NULL AND is_active = true;
CREATE UNIQUE INDEX idx_driver_vehicle_assignments_vehicle_active
    ON driver_vehicle_assignments (org_id, vehicle_id)
    WHERE deleted_at IS NULL AND is_active = true;

CREATE TABLE planner_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('FASTEST_TIME', 'FEWEST_BUSES')),
    service_window TEXT NOT NULL CHECK (service_window IN ('AM', 'PM')),
    status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

CREATE INDEX idx_planner_runs_org_created_at ON planner_runs(org_id, created_at DESC);

CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    planner_run_id UUID NOT NULL REFERENCES planner_runs(id) ON DELETE CASCADE,
    route_code TEXT NOT NULL,
    service_window TEXT NOT NULL CHECK (service_window IN ('AM', 'PM')),
    status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
    objective_mode TEXT NOT NULL CHECK (objective_mode IN ('FASTEST_TIME', 'FEWEST_BUSES')),
    vehicle_id UUID REFERENCES vehicles(id),
    driver_id UUID REFERENCES drivers(id),
    estimated_travel_minutes INTEGER NOT NULL DEFAULT 0,
    assigned_students INTEGER NOT NULL DEFAULT 0,
    seat_utilization DOUBLE PRECISION NOT NULL DEFAULT 0,
    unassigned_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_routes_org_route_code_active
    ON routes (org_id, route_code)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_routes_org_run ON routes(org_id, planner_run_id);
CREATE INDEX idx_routes_org_status ON routes(org_id, status);

CREATE TABLE route_stops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    stop_id UUID NOT NULL REFERENCES stops(id),
    stop_order INTEGER NOT NULL,
    eta_minutes INTEGER NOT NULL DEFAULT 0,
    student_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(route_id, stop_order)
);

CREATE TABLE route_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id),
    stop_id UUID NOT NULL REFERENCES stops(id),
    stop_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(route_id, student_id)
);

CREATE TABLE route_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_route_assignments_driver_active
    ON route_assignments (org_id, driver_id)
    WHERE is_active = true;
CREATE UNIQUE INDEX idx_route_assignments_vehicle_active
    ON route_assignments (org_id, vehicle_id)
    WHERE is_active = true;

CREATE TABLE planner_run_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planner_run_id UUID NOT NULL REFERENCES planner_runs(id) ON DELETE CASCADE,
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(planner_run_id, route_id)
);

CREATE TABLE planner_run_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planner_run_id UUID NOT NULL REFERENCES planner_runs(id) ON DELETE CASCADE,
    issue_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planner_run_issues_run ON planner_run_issues(planner_run_id, created_at);

UPDATE org_roles
SET permissions = array_append(permissions, 'drivers:read')
WHERE name = 'Owner'
  AND NOT ('drivers:read' = ANY(permissions));

UPDATE org_roles
SET permissions = array_append(permissions, 'drivers:write')
WHERE name = 'Owner'
  AND NOT ('drivers:write' = ANY(permissions));

UPDATE org_roles
SET permissions = array_append(permissions, 'stops:read')
WHERE name = 'Owner'
  AND NOT ('stops:read' = ANY(permissions));

UPDATE org_roles
SET permissions = array_append(permissions, 'stops:write')
WHERE name = 'Owner'
  AND NOT ('stops:write' = ANY(permissions));

UPDATE org_roles
SET permissions = array_append(permissions, 'routes:read')
WHERE name = 'Owner'
  AND NOT ('routes:read' = ANY(permissions));

UPDATE org_roles
SET permissions = array_append(permissions, 'routes:write')
WHERE name = 'Owner'
  AND NOT ('routes:write' = ANY(permissions));

UPDATE org_roles
SET permissions = array_append(permissions, 'planning:run')
WHERE name = 'Owner'
  AND NOT ('planning:run' = ANY(permissions));

UPDATE org_roles
SET permissions = array_append(permissions, 'planning:publish')
WHERE name = 'Owner'
  AND NOT ('planning:publish' = ANY(permissions));
