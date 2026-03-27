package api

import "testing"

func TestChoosePairsFewestBuses(t *testing.T) {
	pairs := []plannerPair{
		{DriverID: "d1", VehicleID: "v1", Capacity: 20},
		{DriverID: "d2", VehicleID: "v2", Capacity: 40},
		{DriverID: "d3", VehicleID: "v3", Capacity: 30},
	}
	selected := choosePairs("FEWEST_BUSES", pairs, 45)
	if len(selected) != 2 {
		t.Fatalf("expected 2 pairs, got %d", len(selected))
	}
	if selected[0].VehicleID != "v2" || selected[1].VehicleID != "v3" {
		t.Fatalf("expected highest capacities first, got %#v", selected)
	}
}

func TestChoosePairsFastestUsesAll(t *testing.T) {
	pairs := []plannerPair{
		{DriverID: "d1", VehicleID: "v1", Capacity: 20},
		{DriverID: "d2", VehicleID: "v2", Capacity: 10},
	}
	selected := choosePairs("FASTEST_TIME", pairs, 5)
	if len(selected) != len(pairs) {
		t.Fatalf("expected all pairs for fastest mode, got %d", len(selected))
	}
}

func TestRepositoryBuildRouteCode(t *testing.T) {
	code := repositoryBuildRouteCode(1700000000, 3)
	if code != "PM-1700000000-3" {
		t.Fatalf("unexpected route code: %s", code)
	}
}
