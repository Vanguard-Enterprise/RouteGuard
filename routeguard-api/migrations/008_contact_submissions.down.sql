UPDATE staff_roles
SET permissions = array_remove(permissions, 'contacts:read')
WHERE name = 'super_admin' AND is_system = true;

DROP TABLE IF EXISTS contact_notes;
DROP TABLE IF EXISTS contact_submissions;
