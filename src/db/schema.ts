import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ============================================================================
// Tenant & Auth
// ============================================================================

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  type: text("type", { enum: ["district", "company"] }).notNull().default("district"),
  ssoProvider: text("sso_provider"),
  ssoDomain: text("sso_domain"),
  ssoConnectionId: text("sso_connection_id"),
  logoUrl: text("logo_url"),
  timezone: text("timezone").notNull().default("America/New_York"),
  settings: text("settings").default("{}"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role", { enum: ["super_admin", "org_admin", "school_admin", "driver"] }).notNull(),
  ssoId: text("sso_id"),
  avatarUrl: text("avatar_url"),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("users_org_email_idx").on(table.orgId, table.email),
]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  permissions: text("permissions").default("{}"),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// Core Entities
// ============================================================================

export const schools = sqliteTable("schools", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  lat: real("lat"),
  lng: real("lng"),
  phone: text("phone"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const students = sqliteTable("students", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  schoolId: text("school_id").notNull().references(() => schools.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  studentNumber: text("student_number"),
  grade: text("grade"),
  rfidTagId: text("rfid_tag_id"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  lat: real("lat"),
  lng: real("lng"),
  status: text("status", { enum: ["active", "inactive", "graduated"] }).notNull().default("active"),
  medicalNotes: text("medical_notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const guardians = sqliteTable("guardians", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  altPhone: text("alt_phone"),
  email: text("email"),
  smsOptIn: integer("sms_opt_in", { mode: "boolean" }).notNull().default(true),
  language: text("language").notNull().default("en"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const studentGuardians = sqliteTable("student_guardians", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  studentId: text("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
  guardianId: text("guardian_id").notNull().references(() => guardians.id, { onDelete: "cascade" }),
  relationship: text("relationship", { enum: ["parent", "guardian", "emergency"] }).notNull().default("parent"),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
});

// ============================================================================
// Fleet
// ============================================================================

export const vehicles = sqliteTable("vehicles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  number: text("number"),
  capacity: integer("capacity"),
  year: integer("year"),
  make: text("make"),
  model: text("model"),
  vin: text("vin"),
  licensePlate: text("license_plate"),
  status: text("status", { enum: ["active", "maintenance", "retired"] }).notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const drivers = sqliteTable("drivers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  userId: text("user_id").references(() => users.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  licenseNumber: text("license_number"),
  licenseExpiry: integer("license_expiry", { mode: "timestamp" }),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// Routes & Stops
// ============================================================================

export const routes = sqliteTable("routes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  type: text("type", { enum: ["morning", "afternoon", "field_trip", "activity"] }).notNull().default("morning"),
  status: text("status", { enum: ["draft", "active", "archived"] }).notNull().default("draft"),
  description: text("description"),
  estimatedDurationMin: integer("estimated_duration_min"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const stops = sqliteTable("stops", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  routeId: text("route_id").notNull().references(() => routes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  lat: real("lat"),
  lng: real("lng"),
  sequenceOrder: integer("sequence_order").notNull(),
  scheduledTime: text("scheduled_time"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const studentStops = sqliteTable("student_stops", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  studentId: text("student_id").notNull().references(() => students.id),
  stopId: text("stop_id").notNull().references(() => stops.id, { onDelete: "cascade" }),
  routeId: text("route_id").notNull().references(() => routes.id),
  effectiveDate: text("effective_date"),
  endDate: text("end_date"),
});

export const routeAssignments = sqliteTable("route_assignments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  routeId: text("route_id").notNull().references(() => routes.id),
  vehicleId: text("vehicle_id").notNull().references(() => vehicles.id),
  driverId: text("driver_id").notNull().references(() => drivers.id),
  effectiveDate: text("effective_date"),
  endDate: text("end_date"),
  daysOfWeek: text("days_of_week").default("MTWRF"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// Live Operations
// ============================================================================

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  routeAssignmentId: text("route_assignment_id").notNull().references(() => routeAssignments.id),
  orgId: text("org_id").notNull().references(() => organizations.id),
  date: text("date").notNull(),
  status: text("status", { enum: ["scheduled", "in_progress", "completed", "cancelled"] }).notNull().default("scheduled"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const tripLocations = sqliteTable("trip_locations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  speed: real("speed"),
  heading: real("heading"),
  recordedAt: integer("recorded_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const scanEvents = sqliteTable("scan_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: text("trip_id").notNull().references(() => trips.id),
  studentId: text("student_id").references(() => students.id),
  stopId: text("stop_id").references(() => stops.id),
  rfidTagId: text("rfid_tag_id").notNull(),
  scanType: text("scan_type", { enum: ["board", "exit"] }).notNull(),
  authorized: integer("authorized", { mode: "boolean" }).notNull().default(true),
  recordedAt: integer("recorded_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const smsMessages = sqliteTable("sms_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  guardianId: text("guardian_id").notNull().references(() => guardians.id),
  tripId: text("trip_id").references(() => trips.id),
  studentId: text("student_id").references(() => students.id),
  messageType: text("message_type", { enum: ["eta", "board", "exit", "alert"] }).notNull(),
  messageBody: text("message_body").notNull(),
  twilioSid: text("twilio_sid"),
  status: text("status", { enum: ["queued", "sent", "delivered", "failed"] }).notNull().default("queued"),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// Reporting
// ============================================================================

export const dailySummaries = sqliteTable("daily_summaries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id").notNull().references(() => organizations.id),
  routeId: text("route_id").notNull().references(() => routes.id),
  date: text("date").notNull(),
  totalStudents: integer("total_students").notNull().default(0),
  boardedCount: integer("boarded_count").notNull().default(0),
  onTime: integer("on_time", { mode: "boolean" }).notNull().default(true),
  delayMinutes: integer("delay_minutes").default(0),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============================================================================
// Relations
// ============================================================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  schools: many(schools),
  students: many(students),
  vehicles: many(vehicles),
  drivers: many(drivers),
  routes: many(routes),
  apiKeys: many(apiKeys),
  trips: many(trips),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  organization: one(organizations, { fields: [schools.orgId], references: [organizations.id] }),
  students: many(students),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  organization: one(organizations, { fields: [students.orgId], references: [organizations.id] }),
  school: one(schools, { fields: [students.schoolId], references: [schools.id] }),
  guardianLinks: many(studentGuardians),
  studentStops: many(studentStops),
}));

export const guardiansRelations = relations(guardians, ({ one, many }) => ({
  organization: one(organizations, { fields: [guardians.orgId], references: [organizations.id] }),
  studentLinks: many(studentGuardians),
}));

export const studentGuardiansRelations = relations(studentGuardians, ({ one }) => ({
  student: one(students, { fields: [studentGuardians.studentId], references: [students.id] }),
  guardian: one(guardians, { fields: [studentGuardians.guardianId], references: [guardians.id] }),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  organization: one(organizations, { fields: [vehicles.orgId], references: [organizations.id] }),
  routeAssignments: many(routeAssignments),
}));

export const driversRelations = relations(drivers, ({ one, many }) => ({
  organization: one(organizations, { fields: [drivers.orgId], references: [organizations.id] }),
  user: one(users, { fields: [drivers.userId], references: [users.id] }),
  routeAssignments: many(routeAssignments),
}));

export const routesRelations = relations(routes, ({ one, many }) => ({
  organization: one(organizations, { fields: [routes.orgId], references: [organizations.id] }),
  stops: many(stops),
  studentStops: many(studentStops),
  routeAssignments: many(routeAssignments),
}));

export const stopsRelations = relations(stops, ({ one, many }) => ({
  route: one(routes, { fields: [stops.routeId], references: [routes.id] }),
  studentStops: many(studentStops),
}));

export const studentStopsRelations = relations(studentStops, ({ one }) => ({
  student: one(students, { fields: [studentStops.studentId], references: [students.id] }),
  stop: one(stops, { fields: [studentStops.stopId], references: [stops.id] }),
  route: one(routes, { fields: [studentStops.routeId], references: [routes.id] }),
}));

export const routeAssignmentsRelations = relations(routeAssignments, ({ one, many }) => ({
  route: one(routes, { fields: [routeAssignments.routeId], references: [routes.id] }),
  vehicle: one(vehicles, { fields: [routeAssignments.vehicleId], references: [vehicles.id] }),
  driver: one(drivers, { fields: [routeAssignments.driverId], references: [drivers.id] }),
  trips: many(trips),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  routeAssignment: one(routeAssignments, { fields: [trips.routeAssignmentId], references: [routeAssignments.id] }),
  organization: one(organizations, { fields: [trips.orgId], references: [organizations.id] }),
  locations: many(tripLocations),
  scanEvents: many(scanEvents),
  smsMessages: many(smsMessages),
}));

export const tripLocationsRelations = relations(tripLocations, ({ one }) => ({
  trip: one(trips, { fields: [tripLocations.tripId], references: [trips.id] }),
}));

export const scanEventsRelations = relations(scanEvents, ({ one }) => ({
  trip: one(trips, { fields: [scanEvents.tripId], references: [trips.id] }),
  student: one(students, { fields: [scanEvents.studentId], references: [students.id] }),
  stop: one(stops, { fields: [scanEvents.stopId], references: [stops.id] }),
}));

export const smsMessagesRelations = relations(smsMessages, ({ one }) => ({
  guardian: one(guardians, { fields: [smsMessages.guardianId], references: [guardians.id] }),
  trip: one(trips, { fields: [smsMessages.tripId], references: [trips.id] }),
  student: one(students, { fields: [smsMessages.studentId], references: [students.id] }),
}));

export const dailySummariesRelations = relations(dailySummaries, ({ one }) => ({
  organization: one(organizations, { fields: [dailySummaries.orgId], references: [organizations.id] }),
  route: one(routes, { fields: [dailySummaries.routeId], references: [routes.id] }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type School = typeof schools.$inferSelect;
export type NewSchool = typeof schools.$inferInsert;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type Guardian = typeof guardians.$inferSelect;
export type NewGuardian = typeof guardians.$inferInsert;
export type Vehicle = typeof vehicles.$inferSelect;
export type NewVehicle = typeof vehicles.$inferInsert;
export type Driver = typeof drivers.$inferSelect;
export type NewDriver = typeof drivers.$inferInsert;
export type Route = typeof routes.$inferSelect;
export type NewRoute = typeof routes.$inferInsert;
export type Stop = typeof stops.$inferSelect;
export type NewStop = typeof stops.$inferInsert;
export type Trip = typeof trips.$inferSelect;
export type ScanEvent = typeof scanEvents.$inferSelect;
export type SmsMessage = typeof smsMessages.$inferSelect;
export type DailySummary = typeof dailySummaries.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type RouteAssignment = typeof routeAssignments.$inferSelect;

export type UserRole = "super_admin" | "org_admin" | "school_admin" | "driver";
