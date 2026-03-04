-- No-op: removing seeded system roles is destructive (users may be assigned to them).
-- To clean up, manually identify and remove the seeded rows after verifying no users depend on them.
SELECT 1;
