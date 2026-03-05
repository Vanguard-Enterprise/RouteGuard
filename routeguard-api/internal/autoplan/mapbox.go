package autoplan

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// FormatCoordinates formats StudentPoints as "lng,lat;lng,lat" for Mapbox API.
func FormatCoordinates(pts []StudentPoint) string {
	parts := make([]string, len(pts))
	for i, p := range pts {
		parts[i] = fmt.Sprintf("%f,%f", p.Lng, p.Lat)
	}
	return strings.Join(parts, ";")
}

type mapboxOptimizationResponse struct {
	Waypoints []struct {
		WaypointIndex int `json:"waypoint_index"`
		TripsIndex    int `json:"trips_index"`
	} `json:"waypoints"`
}

// OptimizeStops calls the Mapbox Optimization API and returns points in
// the optimal visit order. Returns the original order if the API fails.
func OptimizeStops(ctx context.Context, token string, pts []StudentPoint) ([]StudentPoint, error) {
	if len(pts) <= 1 {
		return pts, nil
	}
	coords := FormatCoordinates(pts)
	url := fmt.Sprintf(
		"https://api.mapbox.com/optimized-trips/v1/mapbox/driving/%s?roundtrip=false&source=first&destination=last&access_token=%s",
		coords, token,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return pts, fmt.Errorf("mapbox optimize: build request: %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return pts, fmt.Errorf("mapbox optimize: request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return pts, fmt.Errorf("mapbox optimize: status %d", resp.StatusCode)
	}

	var result mapboxOptimizationResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return pts, fmt.Errorf("mapbox optimize: decode: %w", err)
	}

	// Build reordered slice from waypoint_index
	ordered := make([]StudentPoint, len(pts))
	for _, wp := range result.Waypoints {
		if wp.WaypointIndex < len(pts) {
			ordered[wp.WaypointIndex] = pts[wp.TripsIndex]
		}
	}
	return ordered, nil
}
