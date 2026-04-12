package api

import (
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
