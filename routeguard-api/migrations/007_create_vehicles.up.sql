CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    vehicle_id TEXT NOT NULL,
    license_plate TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_vehicles_org_vehicle_id_active
    ON vehicles (org_id, vehicle_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_vehicles_org_id ON vehicles(org_id);
CREATE INDEX idx_vehicles_org_active ON vehicles(org_id, is_active);
CREATE INDEX idx_vehicles_org_vehicle_search ON vehicles(org_id, lower(vehicle_id), lower(license_plate));

UPDATE org_roles
SET permissions = array_append(permissions, 'vehicles:read')
WHERE name = 'Owner'
  AND NOT ('vehicles:read' = ANY(permissions));

UPDATE org_roles
SET permissions = array_append(permissions, 'vehicles:write')
WHERE name = 'Owner'
  AND NOT ('vehicles:write' = ANY(permissions));
