UPDATE org_roles
SET permissions = array_remove(permissions, 'org:manage')
WHERE lower(name) IN ('super admin', 'superadmin');
