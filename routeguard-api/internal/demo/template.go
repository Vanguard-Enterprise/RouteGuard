package demo

import (
	"embed"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"math/rand"
	"strings"
)

//go:embed templates/*.json
var templateFS embed.FS

type TemplateConfig struct {
	Version             string   `json:"version"`
	OrgName             string   `json:"org_name"`
	BillingStatus       string   `json:"billing_status"`
	BillingContactEmail string   `json:"billing_contact_email"`
	ContractNotes       string   `json:"contract_notes"`
	County              string   `json:"county"`
	Cities              []string `json:"cities"`
	Schools             []string `json:"schools"`
	StreetNames         []string `json:"street_names"`
	StudentFirstNames   []string `json:"student_first_names"`
	StudentLastNames    []string `json:"student_last_names"`
	DriverNames         []string `json:"driver_names"`
	RoutePrefix         string   `json:"route_prefix"`
}

type Dataset struct {
	OrgName             string
	TemplateVersion     string
	BillingStatus       string
	BillingContactEmail string
	ContractNotes       string
	Schools             []SchoolRecord
	Stops               []StopRecord
	Vehicles            []VehicleRecord
	Drivers             []DriverRecord
	Students            []StudentRecord
	Routes              []RouteRecord
}

type SchoolRecord struct {
	Key          string
	SchoolID     string
	Name         string
	Address      string
	ContactPhone string
	IsActive     bool
}

type StopRecord struct {
	Key       string
	StopID    string
	Name      string
	Address   string
	Latitude  float64
	Longitude float64
	Notes     string
	IsActive  bool
}

type VehicleRecord struct {
	Key          string
	VehicleID    string
	LicensePlate string
	Capacity     int
	IsActive     bool
}

type DriverRecord struct {
	Key         string
	DriverID    string
	Name        string
	Phone       string
	IsAvailable bool
	IsActive    bool
}

type StudentRecord struct {
	Key             string
	StudentID       string
	FirstName       string
	LastName        string
	Grade           string
	SchoolKey       string
	GuardianName    string
	GuardianContact string
	IsActive        bool
	StopKey         string
	ServiceWindow   string
}

type RouteRecord struct {
	Key                    string
	RouteCode              string
	ServiceWindow          string
	ObjectiveMode          string
	Status                 string
	VehicleKey             string
	DriverKey              string
	EstimatedTravelMinutes int
	AssignedStudents       int
	SeatUtilization        float64
	UnassignedCount        int
	StopKeys               []string
	StudentKeys            []string
}

func LoadTemplate(version string) (*TemplateConfig, error) {
	fileName := strings.ReplaceAll(version, "-", "_")
	path := fmt.Sprintf("templates/%s.json", fileName)
	data, err := templateFS.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read template %s: %w", version, err)
	}
	var cfg TemplateConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("decode template %s: %w", version, err)
	}
	return &cfg, nil
}

func GenerateDataset(version string) (*Dataset, error) {
	cfg, err := LoadTemplate(version)
	if err != nil {
		return nil, err
	}
	rng := rand.New(rand.NewSource(seedForVersion(version)))
	ds := &Dataset{
		OrgName:             cfg.OrgName,
		TemplateVersion:     cfg.Version,
		BillingStatus:       cfg.BillingStatus,
		BillingContactEmail: cfg.BillingContactEmail,
		ContractNotes:       cfg.ContractNotes,
	}

	for i, schoolName := range cfg.Schools {
		key := fmt.Sprintf("school-%d", i+1)
		city := cfg.Cities[i%len(cfg.Cities)]
		ds.Schools = append(ds.Schools, SchoolRecord{
			Key:          key,
			SchoolID:     fmt.Sprintf("SCH-%03d", i+1),
			Name:         schoolName,
			Address:      fmt.Sprintf("%d %s Ave, %s, %s", 100+i*17, cfg.StreetNames[i%len(cfg.StreetNames)], city, cfg.County),
			ContactPhone: fmt.Sprintf("555-01%02d", i+10),
			IsActive:     true,
		})
	}

	for i := 0; i < 24; i++ {
		street := cfg.StreetNames[i%len(cfg.StreetNames)]
		city := cfg.Cities[i%len(cfg.Cities)]
		ds.Stops = append(ds.Stops, StopRecord{
			Key:       fmt.Sprintf("stop-%02d", i+1),
			StopID:    fmt.Sprintf("STOP-%03d", i+1),
			Name:      fmt.Sprintf("%s & %s", street, cfg.StreetNames[(i+3)%len(cfg.StreetNames)]),
			Address:   fmt.Sprintf("%d %s St, %s, %s", 200+i*9, street, city, cfg.County),
			Latitude:  39.55 + float64(i)*0.011,
			Longitude: -82.98 - float64(i)*0.013,
			Notes:     "Protected demo stop",
			IsActive:  true,
		})
	}

	for i := 0; i < 10; i++ {
		ds.Vehicles = append(ds.Vehicles, VehicleRecord{
			Key:          fmt.Sprintf("vehicle-%02d", i+1),
			VehicleID:    fmt.Sprintf("BUS-%03d", 200+i),
			LicensePlate: fmt.Sprintf("RGD%03d", 600+i),
			Capacity:     48 + (i%3)*6,
			IsActive:     true,
		})
	}

	for i, name := range cfg.DriverNames {
		ds.Drivers = append(ds.Drivers, DriverRecord{
			Key:         fmt.Sprintf("driver-%02d", i+1),
			DriverID:    fmt.Sprintf("DRV-%03d", 300+i),
			Name:        name,
			Phone:       fmt.Sprintf("555-21%02d", i+10),
			IsAvailable: i%5 != 0,
			IsActive:    true,
		})
	}

	grades := []string{"K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"}
	for i := 0; i < 120; i++ {
		first := cfg.StudentFirstNames[rng.Intn(len(cfg.StudentFirstNames))]
		last := cfg.StudentLastNames[rng.Intn(len(cfg.StudentLastNames))]
		school := ds.Schools[i%len(ds.Schools)]
		stop := ds.Stops[i%len(ds.Stops)]
		ds.Students = append(ds.Students, StudentRecord{
			Key:             fmt.Sprintf("student-%03d", i+1),
			StudentID:       fmt.Sprintf("STU-%05d", 10000+i),
			FirstName:       first,
			LastName:        last,
			Grade:           grades[i%len(grades)],
			SchoolKey:       school.Key,
			GuardianName:    fmt.Sprintf("%s %s", cfg.StudentFirstNames[(i+5)%len(cfg.StudentFirstNames)], last),
			GuardianContact: fmt.Sprintf("555-31%02d", i%90),
			IsActive:        true,
			StopKey:         stop.Key,
			ServiceWindow:   "AM",
		})
	}

	for i := 0; i < 8; i++ {
		studentKeys := make([]string, 0, 15)
		stopSet := map[string]struct{}{}
		for j := i; j < len(ds.Students); j += 8 {
			studentKeys = append(studentKeys, ds.Students[j].Key)
			stopSet[ds.Students[j].StopKey] = struct{}{}
		}
		stopKeys := make([]string, 0, len(stopSet))
		for _, stop := range ds.Stops {
			if _, ok := stopSet[stop.Key]; ok {
				stopKeys = append(stopKeys, stop.Key)
			}
		}
		assigned := len(studentKeys)
		capacity := ds.Vehicles[i%len(ds.Vehicles)].Capacity
		ds.Routes = append(ds.Routes, RouteRecord{
			Key:                    fmt.Sprintf("route-%02d", i+1),
			RouteCode:              fmt.Sprintf("%s-%02d", cfg.RoutePrefix, i+1),
			ServiceWindow:          "AM",
			ObjectiveMode:          "FASTEST_TIME",
			Status:                 "active",
			VehicleKey:             ds.Vehicles[i%len(ds.Vehicles)].Key,
			DriverKey:              ds.Drivers[i%len(ds.Drivers)].Key,
			EstimatedTravelMinutes: 32 + i*4,
			AssignedStudents:       assigned,
			SeatUtilization:        float64(assigned) / float64(capacity),
			UnassignedCount:        0,
			StopKeys:               stopKeys,
			StudentKeys:            studentKeys,
		})
	}

	return ds, nil
}

func seedForVersion(version string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(version))
	return int64(h.Sum64())
}
