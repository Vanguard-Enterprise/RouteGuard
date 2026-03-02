DROP INDEX IF EXISTS idx_students_rfid_tag_id_hash;
ALTER TABLE students DROP COLUMN IF EXISTS rfid_tag_id_hash;
