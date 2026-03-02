CREATE UNIQUE INDEX idx_students_rfid_tag_id_hash_org
  ON students(org_id, rfid_tag_id_hash)
  WHERE rfid_tag_id_hash IS NOT NULL;
