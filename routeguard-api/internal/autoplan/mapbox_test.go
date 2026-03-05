package autoplan_test

import (
	"testing"

	"github.com/routeguard/api/internal/autoplan"
)

func TestFormatCoordinates(t *testing.T) {
	pts := []autoplan.StudentPoint{
		{Lat: 37.10, Lng: -122.10},
		{Lat: 37.20, Lng: -122.20},
	}
	result := autoplan.FormatCoordinates(pts)
	expected := "-122.100000,37.100000;-122.200000,37.200000"
	if result != expected {
		t.Fatalf("expected %q, got %q", expected, result)
	}
}
