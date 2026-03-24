package api

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"
)

var errInvalidRoleAssignment = errors.New("invalid role for organization")

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func normalizeName(name string) string {
	return strings.TrimSpace(name)
}

func uniqueRoleIDs(roleIDs []string) []string {
	seen := make(map[string]struct{}, len(roleIDs))
	unique := make([]string, 0, len(roleIDs))
	for _, roleID := range roleIDs {
		roleID = strings.TrimSpace(roleID)
		if roleID == "" {
			continue
		}
		if _, exists := seen[roleID]; exists {
			continue
		}
		seen[roleID] = struct{}{}
		unique = append(unique, roleID)
	}
	return unique
}

func permissionLabel(permission string) string {
	switch permission {
	case "org:manage":
		return "organization manager"
	case "platform:manage":
		return "platform administrator"
	default:
		return permission
	}
}

func (h *Handler) validateRoleAssignments(ctx context.Context, orgID string, roleIDs []string) ([]string, []string, error) {
	roleIDs = uniqueRoleIDs(roleIDs)

	orgRoles, err := h.roles.ListByOrg(ctx, orgID)
	if err != nil {
		return nil, nil, fmt.Errorf("list roles: %w", err)
	}

	rolePermissions := make(map[string][]string, len(orgRoles))
	for _, role := range orgRoles {
		rolePermissions[role.ID] = role.Permissions
	}

	permissionSet := make(map[string]struct{})
	for _, roleID := range roleIDs {
		permissions, ok := rolePermissions[roleID]
		if !ok {
			return nil, nil, errInvalidRoleAssignment
		}
		for _, permission := range permissions {
			permissionSet[permission] = struct{}{}
		}
	}

	resolvedPermissions := make([]string, 0, len(permissionSet))
	for permission := range permissionSet {
		resolvedPermissions = append(resolvedPermissions, permission)
	}
	sort.Strings(resolvedPermissions)

	return roleIDs, resolvedPermissions, nil
}

func (h *Handler) ensureCriticalPermissionsRetained(ctx context.Context, orgID, targetUserID string, targetPermissions []string) error {
	org, err := h.orgs.GetByID(ctx, orgID)
	if err != nil {
		return fmt.Errorf("load org: %w", err)
	}

	requiredPermissions := []string{"org:manage"}
	if org.IsPlatform {
		requiredPermissions = append(requiredPermissions, "platform:manage")
	}

	memberships, err := h.members.ListMembersByOrg(ctx, orgID)
	if err != nil {
		return fmt.Errorf("list members: %w", err)
	}

	currentPermissionsByUser := make(map[string][]string, len(memberships))
	for _, membership := range memberships {
		permissions, err := h.members.GetUserPermissions(ctx, membership.UserID, orgID)
		if err != nil {
			return fmt.Errorf("load permissions: %w", err)
		}
		currentPermissionsByUser[membership.UserID] = permissions
	}

	for _, permission := range requiredPermissions {
		currentCount := 0
		proposedCount := 0

		for userID, permissions := range currentPermissionsByUser {
			if slices.Contains(permissions, permission) {
				currentCount++
			}

			proposedPermissions := permissions
			if userID == targetUserID {
				proposedPermissions = targetPermissions
			}
			if slices.Contains(proposedPermissions, permission) {
				proposedCount++
			}
		}

		if currentCount > 0 && proposedCount == 0 {
			return fmt.Errorf("cannot remove the last %s", permissionLabel(permission))
		}
	}

	return nil
}
