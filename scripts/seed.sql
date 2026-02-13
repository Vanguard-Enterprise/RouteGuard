-- Platform Organization & Super Admin
INSERT INTO organizations (id, name, slug, type, timezone, settings, created_at, updated_at)
VALUES ('org-platform', 'RouteGuard Platform', 'routeguard-platform', 'company', 'America/New_York', '{}', unixepoch(), unixepoch());
INSERT INTO users (id, org_id, email, name, role, created_at)
VALUES ('user-sa', 'org-platform', 'admin@routeguard.com', 'Platform Admin', 'super_admin', unixepoch());

-- Demo Organization
INSERT INTO organizations (id, name, slug, type, timezone, settings, created_at, updated_at)
VALUES ('org-001', 'Lincoln School District', 'lincoln-sd', 'district', 'America/New_York', '{}', unixepoch(), unixepoch());

-- Users
INSERT INTO users (id, org_id, email, name, role, created_at)
VALUES ('user-001', 'org-001', 'admin@lincoln.edu', 'Sarah Johnson', 'org_admin', unixepoch());
INSERT INTO users (id, org_id, email, name, role, created_at)
VALUES ('user-002', 'org-001', 'principal@lincoln.edu', 'Mike Chen', 'school_admin', unixepoch());
INSERT INTO users (id, org_id, email, name, role, created_at)
VALUES ('user-003', 'org-001', 'driver@lincoln.edu', 'Tom Williams', 'driver', unixepoch());

-- Schools
INSERT INTO schools (id, org_id, name, address, city, state, zip, lat, lng, phone, contact_name, contact_email, created_at, updated_at)
VALUES ('school-001', 'org-001', 'Lincoln Elementary', '100 Main St', 'Springfield', 'IL', '62701', 39.7817, -89.6501, '(217) 555-0100', 'Mike Chen', 'principal@lincoln.edu', unixepoch(), unixepoch());
INSERT INTO schools (id, org_id, name, address, city, state, zip, lat, lng, phone, contact_name, contact_email, created_at, updated_at)
VALUES ('school-002', 'org-001', 'Jefferson Middle School', '200 Oak Ave', 'Springfield', 'IL', '62702', 39.7900, -89.6440, '(217) 555-0200', 'Lisa Park', 'lpark@lincoln.edu', unixepoch(), unixepoch());

-- Students
INSERT INTO students (id, org_id, school_id, first_name, last_name, student_number, grade, rfid_tag_id, address, city, state, zip, status, created_at, updated_at)
VALUES ('stu-001', 'org-001', 'school-001', 'Emma', 'Wilson', 'STU-001', '3', 'RFID-001', '10 Elm St', 'Springfield', 'IL', '62701', 'active', unixepoch(), unixepoch());
INSERT INTO students (id, org_id, school_id, first_name, last_name, student_number, grade, rfid_tag_id, address, city, state, zip, status, created_at, updated_at)
VALUES ('stu-002', 'org-001', 'school-001', 'Liam', 'Garcia', 'STU-002', '4', 'RFID-002', '22 Pine Rd', 'Springfield', 'IL', '62701', 'active', unixepoch(), unixepoch());
INSERT INTO students (id, org_id, school_id, first_name, last_name, student_number, grade, rfid_tag_id, address, city, state, zip, status, created_at, updated_at)
VALUES ('stu-003', 'org-001', 'school-001', 'Olivia', 'Brown', 'STU-003', '5', 'RFID-003', '35 Maple Dr', 'Springfield', 'IL', '62701', 'active', unixepoch(), unixepoch());
INSERT INTO students (id, org_id, school_id, first_name, last_name, student_number, grade, rfid_tag_id, address, city, state, zip, status, created_at, updated_at)
VALUES ('stu-004', 'org-001', 'school-002', 'Noah', 'Martinez', 'STU-004', '6', 'RFID-004', '48 Cedar Ln', 'Springfield', 'IL', '62702', 'active', unixepoch(), unixepoch());
INSERT INTO students (id, org_id, school_id, first_name, last_name, student_number, grade, rfid_tag_id, address, city, state, zip, status, created_at, updated_at)
VALUES ('stu-005', 'org-001', 'school-002', 'Sophia', 'Lee', 'STU-005', '7', 'RFID-005', '55 Birch Ave', 'Springfield', 'IL', '62702', 'active', unixepoch(), unixepoch());
INSERT INTO students (id, org_id, school_id, first_name, last_name, student_number, grade, rfid_tag_id, address, city, state, zip, status, created_at, updated_at)
VALUES ('stu-006', 'org-001', 'school-001', 'James', 'Taylor', 'STU-006', '3', 'RFID-006', '67 Walnut St', 'Springfield', 'IL', '62701', 'active', unixepoch(), unixepoch());
INSERT INTO students (id, org_id, school_id, first_name, last_name, student_number, grade, rfid_tag_id, address, city, state, zip, status, created_at, updated_at)
VALUES ('stu-007', 'org-001', 'school-001', 'Isabella', 'Anderson', 'STU-007', '4', 'RFID-007', '72 Oak St', 'Springfield', 'IL', '62701', 'active', unixepoch(), unixepoch());
INSERT INTO students (id, org_id, school_id, first_name, last_name, student_number, grade, rfid_tag_id, address, city, state, zip, status, created_at, updated_at)
VALUES ('stu-008', 'org-001', 'school-002', 'Benjamin', 'Thomas', 'STU-008', '8', 'RFID-008', '88 Spruce Ct', 'Springfield', 'IL', '62702', 'active', unixepoch(), unixepoch());

-- Guardians
INSERT INTO guardians (id, org_id, first_name, last_name, phone, email, sms_opt_in, language, created_at)
VALUES ('guard-001', 'org-001', 'Jennifer', 'Wilson', '+12175550001', 'jwilson@email.com', 1, 'en', unixepoch());
INSERT INTO guardians (id, org_id, first_name, last_name, phone, email, sms_opt_in, language, created_at)
VALUES ('guard-002', 'org-001', 'Carlos', 'Garcia', '+12175550002', 'cgarcia@email.com', 1, 'es', unixepoch());
INSERT INTO guardians (id, org_id, first_name, last_name, phone, email, sms_opt_in, language, created_at)
VALUES ('guard-003', 'org-001', 'Amy', 'Brown', '+12175550003', 'abrown@email.com', 1, 'en', unixepoch());
INSERT INTO guardians (id, org_id, first_name, last_name, phone, email, sms_opt_in, language, created_at)
VALUES ('guard-004', 'org-001', 'David', 'Martinez', '+12175550004', 'dmartinez@email.com', 1, 'en', unixepoch());
INSERT INTO guardians (id, org_id, first_name, last_name, phone, email, sms_opt_in, language, created_at)
VALUES ('guard-005', 'org-001', 'Susan', 'Lee', '+12175550005', 'slee@email.com', 1, 'en', unixepoch());

-- Student-Guardian links
INSERT INTO student_guardians (id, student_id, guardian_id, relationship, is_primary)
VALUES ('sg-001', 'stu-001', 'guard-001', 'parent', 1);
INSERT INTO student_guardians (id, student_id, guardian_id, relationship, is_primary)
VALUES ('sg-002', 'stu-002', 'guard-002', 'parent', 1);
INSERT INTO student_guardians (id, student_id, guardian_id, relationship, is_primary)
VALUES ('sg-003', 'stu-003', 'guard-003', 'parent', 1);
INSERT INTO student_guardians (id, student_id, guardian_id, relationship, is_primary)
VALUES ('sg-004', 'stu-004', 'guard-004', 'parent', 1);
INSERT INTO student_guardians (id, student_id, guardian_id, relationship, is_primary)
VALUES ('sg-005', 'stu-005', 'guard-005', 'parent', 1);

-- Vehicles
INSERT INTO vehicles (id, org_id, name, number, capacity, year, make, model, license_plate, status, created_at, updated_at)
VALUES ('veh-001', 'org-001', 'Bus 1', 'B-001', 48, 2022, 'Blue Bird', 'Vision', 'SCH-1001', 'active', unixepoch(), unixepoch());
INSERT INTO vehicles (id, org_id, name, number, capacity, year, make, model, license_plate, status, created_at, updated_at)
VALUES ('veh-002', 'org-001', 'Bus 2', 'B-002', 36, 2023, 'Thomas', 'C2', 'SCH-1002', 'active', unixepoch(), unixepoch());

-- Drivers
INSERT INTO drivers (id, org_id, user_id, first_name, last_name, phone, license_number, status, created_at, updated_at)
VALUES ('drv-001', 'org-001', 'user-003', 'Tom', 'Williams', '+12175550010', 'CDL-12345', 'active', unixepoch(), unixepoch());
INSERT INTO drivers (id, org_id, first_name, last_name, phone, license_number, status, created_at, updated_at)
VALUES ('drv-002', 'org-001', 'Maria', 'Santos', '+12175550011', 'CDL-67890', 'active', unixepoch(), unixepoch());

-- Routes
INSERT INTO routes (id, org_id, name, type, status, description, estimated_duration_min, created_at, updated_at)
VALUES ('route-001', 'org-001', 'Lincoln Elementary AM', 'morning', 'active', 'Morning pickup route for Lincoln Elementary', 35, unixepoch(), unixepoch());
INSERT INTO routes (id, org_id, name, type, status, description, estimated_duration_min, created_at, updated_at)
VALUES ('route-002', 'org-001', 'Jefferson Middle PM', 'afternoon', 'active', 'Afternoon dropoff route for Jefferson Middle School', 40, unixepoch(), unixepoch());

-- Stops (morning route)
INSERT INTO stops (id, route_id, name, address, lat, lng, sequence_order, scheduled_time, created_at, updated_at)
VALUES ('stop-001', 'route-001', 'Elm & 1st', '10 Elm St, Springfield, IL', 39.775, -89.655, 1, '07:15', unixepoch(), unixepoch());
INSERT INTO stops (id, route_id, name, address, lat, lng, sequence_order, scheduled_time, created_at, updated_at)
VALUES ('stop-002', 'route-001', 'Pine & Oak', '22 Pine Rd, Springfield, IL', 39.778, -89.652, 2, '07:22', unixepoch(), unixepoch());
INSERT INTO stops (id, route_id, name, address, lat, lng, sequence_order, scheduled_time, created_at, updated_at)
VALUES ('stop-003', 'route-001', 'Maple & Cedar', '35 Maple Dr, Springfield, IL', 39.780, -89.648, 3, '07:30', unixepoch(), unixepoch());
INSERT INTO stops (id, route_id, name, address, lat, lng, sequence_order, scheduled_time, created_at, updated_at)
VALUES ('stop-004', 'route-001', 'Lincoln Elementary', '100 Main St, Springfield, IL', 39.7817, -89.6501, 4, '07:45', unixepoch(), unixepoch());

-- Stops (afternoon route)
INSERT INTO stops (id, route_id, name, address, lat, lng, sequence_order, scheduled_time, created_at, updated_at)
VALUES ('stop-005', 'route-002', 'Jefferson Middle School', '200 Oak Ave, Springfield, IL', 39.7900, -89.6440, 1, '15:15', unixepoch(), unixepoch());
INSERT INTO stops (id, route_id, name, address, lat, lng, sequence_order, scheduled_time, created_at, updated_at)
VALUES ('stop-006', 'route-002', 'Cedar & Spruce', '48 Cedar Ln, Springfield, IL', 39.788, -89.647, 2, '15:25', unixepoch(), unixepoch());
INSERT INTO stops (id, route_id, name, address, lat, lng, sequence_order, scheduled_time, created_at, updated_at)
VALUES ('stop-007', 'route-002', 'Birch & Walnut', '55 Birch Ave, Springfield, IL', 39.785, -89.650, 3, '15:35', unixepoch(), unixepoch());

-- Route assignments
INSERT INTO route_assignments (id, route_id, vehicle_id, driver_id, effective_date, days_of_week, created_at)
VALUES ('ra-001', 'route-001', 'veh-001', 'drv-001', '2025-01-01', 'MTWRF', unixepoch());
INSERT INTO route_assignments (id, route_id, vehicle_id, driver_id, effective_date, days_of_week, created_at)
VALUES ('ra-002', 'route-002', 'veh-002', 'drv-002', '2025-01-01', 'MTWRF', unixepoch());
