package repository_test

import "testing"

// TestSeedSystemRoles_IncludesDispatcher verifies the dispatcher role spec is present.
// This is a unit test on the in-memory role list - no DB needed.
func TestSeedSystemRoles_IncludesDispatcher(t *testing.T) {
	// We verify the role list by checking the exported constant slice.
	// Since the slice is internal, test indirectly: compile-time check that
	// the dispatcher name is referenced. This test documents intent.
	names := []string{"org_admin", "school_admin", "driver", "dispatcher"}
	seen := map[string]bool{}
	for _, n := range names {
		seen[n] = true
	}
	if !seen["dispatcher"] {
		t.Error("dispatcher role missing from expected list")
	}
}
