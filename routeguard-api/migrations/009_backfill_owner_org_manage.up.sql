UPDATE org_roles
SET permissions = array_append(permissions, 'org:manage')
WHERE lower(name) = 'owner'
  AND NOT ('org:manage' = ANY(permissions));
