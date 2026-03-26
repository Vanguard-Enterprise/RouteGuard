UPDATE org_roles
SET permissions = array_remove(permissions, 'vehicles:write');

UPDATE org_roles
SET permissions = array_remove(permissions, 'vehicles:read');

DROP INDEX IF EXISTS idx_vehicles_org_vehicle_search;
DROP INDEX IF EXISTS idx_vehicles_org_active;
DROP INDEX IF EXISTS idx_vehicles_org_id;
DROP INDEX IF EXISTS idx_vehicles_org_vehicle_id_active;
DROP TABLE IF EXISTS vehicles;
