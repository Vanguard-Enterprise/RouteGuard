import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  organizations,
  users,
  schools,
  students,
  guardians,
  studentGuardians,
  vehicles,
  drivers,
  routes,
  stops,
  routeAssignments,
} from "@/db/schema";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const db = await getDb();

  // Create demo organization
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Lincoln School District",
      slug: "lincoln-sd",
      type: "district",
      timezone: "America/New_York",
    })
    .returning();

  // Create demo users
  const [admin] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email: "admin@lincoln.edu",
      name: "Sarah Johnson",
      role: "org_admin",
    })
    .returning();

  const [schoolAdmin] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email: "principal@lincoln.edu",
      name: "Mike Chen",
      role: "school_admin",
    })
    .returning();

  const [driverUser] = await db
    .insert(users)
    .values({
      orgId: org.id,
      email: "driver@lincoln.edu",
      name: "Tom Williams",
      role: "driver",
    })
    .returning();

  // Create schools
  const [lincoln] = await db
    .insert(schools)
    .values({
      orgId: org.id,
      name: "Lincoln Elementary",
      address: "100 Main St",
      city: "Springfield",
      state: "IL",
      zip: "62701",
      lat: 39.7817,
      lng: -89.6501,
      phone: "(217) 555-0100",
      contactName: "Mike Chen",
      contactEmail: "principal@lincoln.edu",
    })
    .returning();

  const [jefferson] = await db
    .insert(schools)
    .values({
      orgId: org.id,
      name: "Jefferson Middle School",
      address: "200 Oak Ave",
      city: "Springfield",
      state: "IL",
      zip: "62702",
      lat: 39.7900,
      lng: -89.6440,
      phone: "(217) 555-0200",
      contactName: "Lisa Park",
      contactEmail: "lpark@lincoln.edu",
    })
    .returning();

  // Create students
  const studentData = [
    { firstName: "Emma", lastName: "Wilson", grade: "3", schoolId: lincoln.id, rfidTagId: "RFID-001", address: "10 Elm St", city: "Springfield", state: "IL", zip: "62701" },
    { firstName: "Liam", lastName: "Garcia", grade: "4", schoolId: lincoln.id, rfidTagId: "RFID-002", address: "22 Pine Rd", city: "Springfield", state: "IL", zip: "62701" },
    { firstName: "Olivia", lastName: "Brown", grade: "5", schoolId: lincoln.id, rfidTagId: "RFID-003", address: "35 Maple Dr", city: "Springfield", state: "IL", zip: "62701" },
    { firstName: "Noah", lastName: "Martinez", grade: "6", schoolId: jefferson.id, rfidTagId: "RFID-004", address: "48 Cedar Ln", city: "Springfield", state: "IL", zip: "62702" },
    { firstName: "Sophia", lastName: "Lee", grade: "7", schoolId: jefferson.id, rfidTagId: "RFID-005", address: "55 Birch Ave", city: "Springfield", state: "IL", zip: "62702" },
    { firstName: "James", lastName: "Taylor", grade: "3", schoolId: lincoln.id, rfidTagId: "RFID-006", address: "67 Walnut St", city: "Springfield", state: "IL", zip: "62701" },
    { firstName: "Isabella", lastName: "Anderson", grade: "4", schoolId: lincoln.id, rfidTagId: "RFID-007", address: "72 Oak St", city: "Springfield", state: "IL", zip: "62701" },
    { firstName: "Benjamin", lastName: "Thomas", grade: "8", schoolId: jefferson.id, rfidTagId: "RFID-008", address: "88 Spruce Ct", city: "Springfield", state: "IL", zip: "62702" },
  ];

  const insertedStudents = await db
    .insert(students)
    .values(studentData.map((s) => ({ ...s, orgId: org.id, studentNumber: `STU-${Math.random().toString(36).slice(2, 8).toUpperCase()}` })))
    .returning();

  // Create guardians
  const guardianData = [
    { firstName: "Jennifer", lastName: "Wilson", phone: "+12175550001", email: "jwilson@email.com", orgId: org.id },
    { firstName: "Carlos", lastName: "Garcia", phone: "+12175550002", email: "cgarcia@email.com", orgId: org.id },
    { firstName: "Amy", lastName: "Brown", phone: "+12175550003", email: "abrown@email.com", orgId: org.id },
    { firstName: "David", lastName: "Martinez", phone: "+12175550004", email: "dmartinez@email.com", orgId: org.id },
    { firstName: "Susan", lastName: "Lee", phone: "+12175550005", email: "slee@email.com", orgId: org.id },
  ];

  const insertedGuardians = await db.insert(guardians).values(guardianData).returning();

  // Link guardians to students
  await db.insert(studentGuardians).values([
    { studentId: insertedStudents[0].id, guardianId: insertedGuardians[0].id, relationship: "parent" as const, isPrimary: true },
    { studentId: insertedStudents[1].id, guardianId: insertedGuardians[1].id, relationship: "parent" as const, isPrimary: true },
    { studentId: insertedStudents[2].id, guardianId: insertedGuardians[2].id, relationship: "parent" as const, isPrimary: true },
    { studentId: insertedStudents[3].id, guardianId: insertedGuardians[3].id, relationship: "parent" as const, isPrimary: true },
    { studentId: insertedStudents[4].id, guardianId: insertedGuardians[4].id, relationship: "parent" as const, isPrimary: true },
  ]);

  // Create vehicles
  const [bus1] = await db
    .insert(vehicles)
    .values({
      orgId: org.id,
      name: "Bus 1",
      number: "B-001",
      capacity: 48,
      year: 2022,
      make: "Blue Bird",
      model: "Vision",
      licensePlate: "SCH-1001",
    })
    .returning();

  const [bus2] = await db
    .insert(vehicles)
    .values({
      orgId: org.id,
      name: "Bus 2",
      number: "B-002",
      capacity: 36,
      year: 2023,
      make: "Thomas",
      model: "C2",
      licensePlate: "SCH-1002",
    })
    .returning();

  // Create drivers
  const [driver1] = await db
    .insert(drivers)
    .values({
      orgId: org.id,
      userId: driverUser.id,
      firstName: "Tom",
      lastName: "Williams",
      phone: "+12175550010",
      licenseNumber: "CDL-12345",
    })
    .returning();

  const [driver2] = await db
    .insert(drivers)
    .values({
      orgId: org.id,
      firstName: "Maria",
      lastName: "Santos",
      phone: "+12175550011",
      licenseNumber: "CDL-67890",
    })
    .returning();

  // Create routes with stops
  const [morningRoute] = await db
    .insert(routes)
    .values({
      orgId: org.id,
      name: "Lincoln Elementary AM",
      type: "morning",
      status: "active",
      description: "Morning pickup route for Lincoln Elementary",
      estimatedDurationMin: 35,
    })
    .returning();

  await db.insert(stops).values([
    { routeId: morningRoute.id, name: "Elm & 1st", address: "10 Elm St, Springfield, IL", lat: 39.775, lng: -89.655, sequenceOrder: 1, scheduledTime: "07:15" },
    { routeId: morningRoute.id, name: "Pine & Oak", address: "22 Pine Rd, Springfield, IL", lat: 39.778, lng: -89.652, sequenceOrder: 2, scheduledTime: "07:22" },
    { routeId: morningRoute.id, name: "Maple & Cedar", address: "35 Maple Dr, Springfield, IL", lat: 39.780, lng: -89.648, sequenceOrder: 3, scheduledTime: "07:30" },
    { routeId: morningRoute.id, name: "Lincoln Elementary", address: "100 Main St, Springfield, IL", lat: 39.7817, lng: -89.6501, sequenceOrder: 4, scheduledTime: "07:45" },
  ]);

  const [afternoonRoute] = await db
    .insert(routes)
    .values({
      orgId: org.id,
      name: "Jefferson Middle PM",
      type: "afternoon",
      status: "active",
      description: "Afternoon dropoff route for Jefferson Middle School",
      estimatedDurationMin: 40,
    })
    .returning();

  await db.insert(stops).values([
    { routeId: afternoonRoute.id, name: "Jefferson Middle School", address: "200 Oak Ave, Springfield, IL", lat: 39.7900, lng: -89.6440, sequenceOrder: 1, scheduledTime: "15:15" },
    { routeId: afternoonRoute.id, name: "Cedar & Spruce", address: "48 Cedar Ln, Springfield, IL", lat: 39.788, lng: -89.647, sequenceOrder: 2, scheduledTime: "15:25" },
    { routeId: afternoonRoute.id, name: "Birch & Walnut", address: "55 Birch Ave, Springfield, IL", lat: 39.785, lng: -89.650, sequenceOrder: 3, scheduledTime: "15:35" },
  ]);

  // Create route assignments
  await db.insert(routeAssignments).values([
    { routeId: morningRoute.id, vehicleId: bus1.id, driverId: driver1.id, effectiveDate: "2025-01-01", daysOfWeek: "MTWRF" },
    { routeId: afternoonRoute.id, vehicleId: bus2.id, driverId: driver2.id, effectiveDate: "2025-01-01", daysOfWeek: "MTWRF" },
  ]);

  return NextResponse.json({
    message: "Seed data created successfully",
    org: { id: org.id, name: org.name, slug: org.slug },
    users: {
      admin: { email: admin.email, role: admin.role },
      schoolAdmin: { email: schoolAdmin.email, role: schoolAdmin.role },
      driver: { email: driverUser.email, role: driverUser.role },
    },
    schools: 2,
    students: insertedStudents.length,
    guardians: insertedGuardians.length,
    vehicles: 2,
    drivers: 2,
    routes: 2,
  });
}
