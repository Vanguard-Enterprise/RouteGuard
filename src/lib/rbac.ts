import type { UserRole } from "@/db/schema";

type Permission =
  | "org:manage"
  | "users:manage"
  | "schools:read"
  | "schools:write"
  | "students:read"
  | "students:write"
  | "routes:read"
  | "routes:write"
  | "vehicles:read"
  | "vehicles:write"
  | "drivers:read"
  | "drivers:write"
  | "trips:read"
  | "trips:write"
  | "reports:read"
  | "settings:read"
  | "settings:write"
  | "api_keys:manage";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    "org:manage",
    "users:manage",
    "schools:read",
    "schools:write",
    "students:read",
    "students:write",
    "routes:read",
    "routes:write",
    "vehicles:read",
    "vehicles:write",
    "drivers:read",
    "drivers:write",
    "trips:read",
    "trips:write",
    "reports:read",
    "settings:read",
    "settings:write",
    "api_keys:manage",
  ],
  org_admin: [
    "users:manage",
    "schools:read",
    "schools:write",
    "students:read",
    "students:write",
    "routes:read",
    "routes:write",
    "vehicles:read",
    "vehicles:write",
    "drivers:read",
    "drivers:write",
    "trips:read",
    "trips:write",
    "reports:read",
    "settings:read",
    "settings:write",
    "api_keys:manage",
  ],
  school_admin: [
    "schools:read",
    "students:read",
    "students:write",
    "routes:read",
    "trips:read",
    "reports:read",
    "settings:read",
  ],
  driver: [
    "routes:read",
    "trips:read",
    "trips:write",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function canManageOrg(role: UserRole): boolean {
  return hasPermission(role, "org:manage");
}

export function canManageUsers(role: UserRole): boolean {
  return hasPermission(role, "users:manage");
}

export function canWriteSchools(role: UserRole): boolean {
  return hasPermission(role, "schools:write");
}

export function canWriteStudents(role: UserRole): boolean {
  return hasPermission(role, "students:write");
}

export function canWriteRoutes(role: UserRole): boolean {
  return hasPermission(role, "routes:write");
}

export function canReadReports(role: UserRole): boolean {
  return hasPermission(role, "reports:read");
}

export type { Permission };
