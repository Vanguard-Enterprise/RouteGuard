package autoplan_test

import (
	"testing"

	"github.com/routeguard/api/internal/autoplan"
)

func TestClusterStudents_BasicGrouping(t *testing.T) {
	students := []autoplan.StudentPoint{
		{ID: "s1", Lat: 37.10, Lng: -122.10},
		{ID: "s2", Lat: 37.11, Lng: -122.11},
		{ID: "s3", Lat: 37.50, Lng: -122.50},
		{ID: "s4", Lat: 37.51, Lng: -122.51},
	}
	buses := []autoplan.BusSlot{
		{VehicleID: "v1", Capacity: 2},
		{VehicleID: "v2", Capacity: 2},
	}

	groups := autoplan.ClusterStudents(students, buses)

	if len(groups) != 2 {
		t.Fatalf("expected 2 groups, got %d", len(groups))
	}
	total := 0
	for _, g := range groups {
		total += len(g.StudentIDs)
	}
	if total != 4 {
		t.Fatalf("expected 4 students assigned, got %d", total)
	}
}

func TestClusterStudents_MoreStudentsThanCapacity(t *testing.T) {
	students := []autoplan.StudentPoint{
		{ID: "s1", Lat: 37.10, Lng: -122.10},
		{ID: "s2", Lat: 37.11, Lng: -122.11},
		{ID: "s3", Lat: 37.12, Lng: -122.12},
	}
	buses := []autoplan.BusSlot{
		{VehicleID: "v1", Capacity: 2},
	}

	groups := autoplan.ClusterStudents(students, buses)

	if len(groups[0].StudentIDs) != 2 {
		t.Fatalf("expected bus to be capped at capacity 2")
	}
	if len(groups[0].Unassigned) != 1 {
		t.Fatalf("expected 1 unassigned student")
	}
}
