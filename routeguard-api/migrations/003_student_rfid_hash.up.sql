ALTER TABLE students ADD COLUMN rfid_tag_id_hash TEXT;
CREATE INDEX idx_students_rfid_tag_id_hash ON students(rfid_tag_id_hash) WHERE rfid_tag_id_hash IS NOT NULL;
