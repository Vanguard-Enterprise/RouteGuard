package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestFallbackTileURL(t *testing.T) {
	handler := &Handler{}

	requestURL, err := url.Parse("https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1/tiles/256/7/33/44@2x")
	if err != nil {
		t.Fatalf("parse request url: %v", err)
	}

	got, ok := handler.fallbackTileURL(requestURL)
	if !ok {
		t.Fatal("expected fallback tile URL to be produced")
	}

	want := "https://tile.openstreetmap.org/7/33/44.png"
	if got != want {
		t.Fatalf("unexpected fallback tile url: got %q want %q", got, want)
	}
}

func TestFallbackTileURLRejectsUnexpectedPath(t *testing.T) {
	handler := &Handler{}

	requestURL, err := url.Parse("https://api.mapbox.com/directions/v5/mapbox/driving/0,0;1,1")
	if err != nil {
		t.Fatalf("parse request url: %v", err)
	}

	if got, ok := handler.fallbackTileURL(requestURL); ok || got != "" {
		t.Fatalf("expected no fallback URL, got %q", got)
	}
}

func TestUsableGeolocationMAC(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "valid", value: "e4:38:83:52:1e:4b", want: true},
		{name: "broadcast", value: "ff:ff:ff:ff:ff:ff", want: false},
		{name: "iana reserved", value: "00:00:5e:12:34:56", want: false},
		{name: "locally administered", value: "02:11:22:33:44:55", want: false},
		{name: "invalid", value: "nope", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := usableGeolocationMAC(test.value); got != test.want {
				t.Fatalf("usableGeolocationMAC(%q) = %v, want %v", test.value, got, test.want)
			}
		})
	}
}

func TestFetchBeaconDBGeolocation(t *testing.T) {
	var requestBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method %s", r.Method)
		}
		if r.URL.Path != "/geolocate" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"location":{"lat":32.7767,"lng":-96.797},"accuracy":42}`))
	}))
	defer server.Close()

	handler := &Handler{
		httpClient:      server.Client(),
		beaconDBBaseURL: server.URL,
	}

	location, err := handler.fetchBeaconDBGeolocation(context.Background(), []deviceGeolocationAccessPt{
		{MacAddress: "e4:38:83:52:1e:4b", SignalStrength: -79},
	})
	if err != nil {
		t.Fatalf("fetchBeaconDBGeolocation returned error: %v", err)
	}

	if got := location["latitude"]; got != 32.7767 {
		t.Fatalf("unexpected latitude: %v", got)
	}
	if got := location["longitude"]; got != -96.797 {
		t.Fatalf("unexpected longitude: %v", got)
	}
	if got := location["accuracy"]; got != 42.0 {
		t.Fatalf("unexpected accuracy: %v", got)
	}
	if _, ok := requestBody["considerIp"]; ok {
		t.Fatalf("expected considerIp to be omitted from request body, got %v", requestBody["considerIp"])
	}
}

func TestFetchDeviceCurrentLocationRequiresWifiSignals(t *testing.T) {
	handler := &Handler{}

	if _, err := handler.fetchDeviceCurrentLocation(context.Background(), nil); err == nil {
		t.Fatal("expected current location resolution to fail without wifi access points")
	}
}
