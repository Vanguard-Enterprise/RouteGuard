package autoplan

import "math"

// StudentPoint is a student with geocoordinates.
type StudentPoint struct {
	ID  string
	Lat float64
	Lng float64
}

// BusSlot is an available vehicle with its remaining capacity.
type BusSlot struct {
	VehicleID string
	Capacity  int
}

// BusGroup is the result of assigning students to one bus.
type BusGroup struct {
	VehicleID  string
	StudentIDs []string
	Points     []StudentPoint
	Unassigned []StudentPoint // only populated on the last bus if overflow
}

// ClusterStudents assigns students to buses using a greedy nearest-neighbor
// algorithm. Students are sorted by proximity to the centroid of all students,
// then packed into buses in order until each bus reaches capacity.
// Any students that exceed total capacity are returned as Unassigned on the last group.
func ClusterStudents(students []StudentPoint, buses []BusSlot) []BusGroup {
	if len(students) == 0 || len(buses) == 0 {
		return nil
	}

	// Compute centroid
	var cLat, cLng float64
	for _, s := range students {
		cLat += s.Lat
		cLng += s.Lng
	}
	cLat /= float64(len(students))
	cLng /= float64(len(students))

	// Sort students by distance from centroid
	sorted := make([]StudentPoint, len(students))
	copy(sorted, students)
	sortByDistance(sorted, cLat, cLng)

	groups := make([]BusGroup, 0, len(buses))
	idx := 0
	for _, bus := range buses {
		g := BusGroup{VehicleID: bus.VehicleID}
		for i := 0; i < bus.Capacity && idx < len(sorted); i++ {
			g.StudentIDs = append(g.StudentIDs, sorted[idx].ID)
			g.Points = append(g.Points, sorted[idx])
			idx++
		}
		groups = append(groups, g)
	}

	// Any remaining students go on Unassigned of the last group
	if idx < len(sorted) && len(groups) > 0 {
		groups[len(groups)-1].Unassigned = sorted[idx:]
	}

	return groups
}

func haversine(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLng := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func sortByDistance(pts []StudentPoint, lat, lng float64) {
	// Simple insertion sort (n is small - typically < 500 students)
	for i := 1; i < len(pts); i++ {
		key := pts[i]
		keyDist := haversine(key.Lat, key.Lng, lat, lng)
		j := i - 1
		for j >= 0 && haversine(pts[j].Lat, pts[j].Lng, lat, lng) > keyDist {
			pts[j+1] = pts[j]
			j--
		}
		pts[j+1] = key
	}
}
