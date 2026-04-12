package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/domain"
)

const (
	deviceDriverSessionTTL                 = 12 * time.Hour
	maxDeviceLocationAccuracyMeters float64 = 5000
)

type deviceDriverSessionClaims struct {
	DeviceID  string    `json:"device_id"`
	OrgID     string    `json:"org_id"`
	DriverID  string    `json:"driver_id"`
	ExpiresAt time.Time `json:"expires_at"`
}

type googlePlacesSearchTextRequest struct {
	TextQuery    string `json:"textQuery"`
	LanguageCode string `json:"languageCode,omitempty"`
	RegionCode   string `json:"regionCode,omitempty"`
	PageSize     int    `json:"pageSize,omitempty"`
}

type googlePlacesSearchTextResponse struct {
	Places []struct {
		ID          string `json:"id"`
		DisplayName struct {
			Text string `json:"text"`
		} `json:"displayName"`
		FormattedAddress string `json:"formattedAddress"`
		Location         struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"location"`
	} `json:"places"`
}

type nominatimSearchItem struct {
	DisplayName string `json:"display_name"`
	Lat         string `json:"lat"`
	Lon         string `json:"lon"`
	PlaceID     any    `json:"place_id"`
}

type deviceGeolocationRequest struct {
	ConsiderIP       bool                         `json:"considerIp,omitempty"`
	WifiAccessPoints []deviceGeolocationAccessPt `json:"wifiAccessPoints,omitempty"`
}

type deviceGeolocationAccessPt struct {
	MacAddress     string  `json:"macAddress"`
	SignalStrength float64 `json:"signalStrength,omitempty"`
	Channel        int     `json:"channel,omitempty"`
}

type deviceGeolocationResponse struct {
	Location struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	} `json:"location"`
	Accuracy float64 `json:"accuracy"`
}

type mapboxDirectionsResponse struct {
	Message string `json:"message"`
	Routes  []struct {
		Distance float64 `json:"distance"`
		Duration float64 `json:"duration"`
		Geometry struct {
			Type        string      `json:"type"`
			Coordinates [][]float64 `json:"coordinates"`
		} `json:"geometry"`
		Legs []struct {
			Steps []struct {
				Distance float64 `json:"distance"`
				Duration float64 `json:"duration"`
				Maneuver struct {
					Instruction string    `json:"instruction"`
					Location    []float64 `json:"location"`
				} `json:"maneuver"`
			} `json:"steps"`
		} `json:"legs"`
	} `json:"routes"`
}

func (h *Handler) buildDeviceDriverSessionToken(device *domain.Device, driver *domain.Driver, now time.Time) (string, time.Time, error) {
	expiresAt := now.Add(deviceDriverSessionTTL)
	claims := deviceDriverSessionClaims{
		DeviceID:  device.ID,
		OrgID:     *device.OrgID,
		DriverID:  driver.ID,
		ExpiresAt: expiresAt,
	}

	payload, err := json.Marshal(claims)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("marshal driver session: %w", err)
	}

	token, err := crypto.Encrypt(h.cfg.DataEncryptionKey, string(payload))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("encrypt driver session: %w", err)
	}

	return token, expiresAt, nil
}

func (h *Handler) authenticateDeviceDriverSession(r *http.Request, device *domain.Device) (*domain.Driver, error) {
	token := strings.TrimSpace(r.Header.Get("X-RouteGuard-Driver-Session"))
	if token == "" {
		return nil, http.ErrNoCookie
	}

	payload, err := crypto.Decrypt(h.cfg.DataEncryptionKey, token)
	if err != nil {
		return nil, err
	}

	var claims deviceDriverSessionClaims
	if err := json.Unmarshal([]byte(payload), &claims); err != nil {
		return nil, err
	}

	if claims.DeviceID != device.ID || claims.OrgID != *device.OrgID || time.Now().UTC().After(claims.ExpiresAt) {
		return nil, http.ErrNoCookie
	}

	driver, err := h.drivers.GetByID(r.Context(), *device.OrgID, claims.DriverID)
	if err != nil {
		return nil, err
	}
	if !driver.IsActive {
		return nil, fmt.Errorf("inactive driver session")
	}
	return driver, nil
}

func (h *Handler) DeviceDriverHome(w http.ResponseWriter, r *http.Request) {
	device, err := h.authenticateDevice(r)
	if err != nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	driver, err := h.authenticateDeviceDriverSession(r, device)
	if err != nil {
		Error(w, http.StatusUnauthorized, "invalid driver session")
		return
	}

	response := domain.DeviceDriverHomeResponse{
		Driver: domain.DeviceDriverSummary{
			ID:       driver.ID,
			DriverID: driver.DriverID,
			Name:     driver.Name,
		},
		Routes: []domain.DeviceRouteHomeRoute{},
	}

	route, err := h.routes.FindActiveAssignedForDriver(r.Context(), *device.OrgID, driver.ID, device.VehicleID)
	if err != nil {
		if isNotFound(err) {
			JSON(w, http.StatusOK, response)
			return
		}
		Error(w, http.StatusInternalServerError, "failed to load driver home")
		return
	}

	stops, err := h.routes.ListDetailedRouteStops(r.Context(), route.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to load driver home")
		return
	}

	routeItem := domain.DeviceRouteHomeRoute{
		ID:                     route.ID,
		RouteCode:              route.RouteCode,
		ServiceWindow:          route.ServiceWindow,
		Status:                 route.Status,
		ObjectiveMode:          route.ObjectiveMode,
		EstimatedTravelMinutes: route.EstimatedTravelMinutes,
		AssignedStudents:       route.AssignedStudents,
		SeatUtilization:        route.SeatUtilization,
		UnassignedCount:        route.UnassignedCount,
		Stops:                  stops,
	}

	if geometry, err := h.fetchRouteGeometry(r.Context(), stops); err == nil {
		routeItem.Geometry = geometry
	}

	response.Routes = append(response.Routes, routeItem)
	JSON(w, http.StatusOK, response)
}

func (h *Handler) DeviceCurrentLocation(w http.ResponseWriter, r *http.Request) {
	if _, err := h.authenticateDevice(r); err != nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body struct {
		WifiAccessPoints []deviceGeolocationAccessPt `json:"wifiAccessPoints"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && err != io.EOF {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	location, err := h.fetchDeviceCurrentLocation(r.Context(), body.WifiAccessPoints)
	if err != nil {
		Error(w, http.StatusServiceUnavailable, "current location unavailable")
		return
	}

	JSON(w, http.StatusOK, location)
}

func (h *Handler) DeviceNavigationSearch(w http.ResponseWriter, r *http.Request) {
	if _, err := h.authenticateDevice(r); err != nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) < 3 {
		JSON(w, http.StatusOK, map[string]any{"items": []domain.DeviceNavigationSearchResult{}})
		return
	}

	results := make([]domain.DeviceNavigationSearchResult, 0)
	var err error
	if strings.TrimSpace(h.cfg.GoogleMapsAPIKey) != "" {
		results, err = h.searchGooglePlaces(r, query)
		if err == nil && len(results) > 0 {
			JSON(w, http.StatusOK, map[string]any{"items": results})
			return
		}
	}

	results, err = h.searchNominatim(r, query)
	if err != nil {
		Error(w, http.StatusServiceUnavailable, "navigation search unavailable")
		return
	}

	JSON(w, http.StatusOK, map[string]any{"items": results})
}

func (h *Handler) DeviceNavigationDirections(w http.ResponseWriter, r *http.Request) {
	if _, err := h.authenticateDevice(r); err != nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var body struct {
		Coordinates []domain.DeviceNavigationDirectionsPoint `json:"coordinates"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(body.Coordinates) < 2 {
		Error(w, http.StatusBadRequest, "at least two coordinates are required")
		return
	}
	for _, point := range body.Coordinates {
		if math.IsNaN(point.Latitude) || math.IsNaN(point.Longitude) {
			Error(w, http.StatusBadRequest, "coordinates are required")
			return
		}
	}

	directions, err := h.fetchDirections(r.Context(), body.Coordinates)
	if err != nil {
		Error(w, http.StatusServiceUnavailable, "navigation unavailable")
		return
	}

	JSON(w, http.StatusOK, directions)
}

func (h *Handler) DeviceMapboxProxy(w http.ResponseWriter, r *http.Request) {
	if _, err := h.authenticateDevice(r); err != nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	upstreamURL, err := url.Parse(rawURL)
	if err != nil || !h.isAllowedMapboxURL(upstreamURL) {
		Error(w, http.StatusBadRequest, "invalid upstream url")
		return
	}

	token := strings.TrimSpace(h.cfg.MapboxAccessToken)
	if token == "" {
		if h.proxyFallbackTile(w, r, upstreamURL) {
			return
		}
		Error(w, http.StatusServiceUnavailable, "map proxy unavailable")
		return
	}
	query := upstreamURL.Query()
	query.Set("access_token", token)
	upstreamURL.RawQuery = query.Encode()

	upstreamReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, upstreamURL.String(), nil)
	if err != nil {
		Error(w, http.StatusInternalServerError, "failed to create upstream request")
		return
	}
	if accept := strings.TrimSpace(r.Header.Get("Accept")); accept != "" {
		upstreamReq.Header.Set("Accept", accept)
	}

	resp, err := h.httpClient.Do(upstreamReq)
	if err != nil {
		if h.proxyFallbackTile(w, r, upstreamURL) {
			return
		}
		Error(w, http.StatusServiceUnavailable, "map proxy unavailable")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		if h.proxyFallbackTile(w, r, upstreamURL) {
			return
		}
		body, _ := io.ReadAll(resp.Body)
		if len(body) == 0 {
			Error(w, http.StatusServiceUnavailable, "map proxy unavailable")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":"map proxy unavailable"}`))
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		Error(w, http.StatusBadGateway, "map proxy unavailable")
		return
	}

	if contentType := strings.TrimSpace(resp.Header.Get("Content-Type")); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	if cacheControl := strings.TrimSpace(resp.Header.Get("Cache-Control")); cacheControl != "" {
		w.Header().Set("Cache-Control", cacheControl)
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(body)
}

func (h *Handler) proxyFallbackTile(w http.ResponseWriter, r *http.Request, requestedURL *url.URL) bool {
	fallbackURL, ok := h.fallbackTileURL(requestedURL)
	if !ok {
		return false
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, fallbackURL, nil)
	if err != nil {
		return false
	}
	req.Header.Set("User-Agent", "RouteGuard/1.0 (Device Map Fallback)")
	if accept := strings.TrimSpace(r.Header.Get("Accept")); accept != "" {
		req.Header.Set("Accept", accept)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return false
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false
	}

	if contentType := strings.TrimSpace(resp.Header.Get("Content-Type")); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	if cacheControl := strings.TrimSpace(resp.Header.Get("Cache-Control")); cacheControl != "" {
		w.Header().Set("Cache-Control", cacheControl)
	} else {
		w.Header().Set("Cache-Control", "public, max-age=300")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
	return true
}

func (h *Handler) fallbackTileURL(requestedURL *url.URL) (string, bool) {
	if requestedURL == nil {
		return "", false
	}

	parts := strings.Split(strings.Trim(requestedURL.Path, "/"), "/")
	if len(parts) < 8 {
		return "", false
	}
	if parts[0] != "styles" || parts[1] != "v1" || parts[4] != "tiles" {
		return "", false
	}

	z := parts[len(parts)-3]
	x := parts[len(parts)-2]
	y := parts[len(parts)-1]
	y = strings.TrimSuffix(y, "@2x")
	y = strings.TrimSuffix(y, ".png")
	if z == "" || x == "" || y == "" {
		return "", false
	}

	return fmt.Sprintf("https://tile.openstreetmap.org/%s/%s/%s.png", z, x, y), true
}

func (h *Handler) isAllowedMapboxURL(value *url.URL) bool {
	if value == nil {
		return false
	}
	if value.Scheme != "https" {
		return false
	}

	host := strings.ToLower(value.Hostname())
	if strings.HasSuffix(host, "mapbox.com") {
		return true
	}

	base, err := url.Parse(h.mapboxBaseURL)
	if err != nil {
		return false
	}
	return strings.EqualFold(host, base.Hostname())
}

func (h *Handler) searchGooglePlaces(r *http.Request, query string) ([]domain.DeviceNavigationSearchResult, error) {
	payload, err := json.Marshal(googlePlacesSearchTextRequest{
		TextQuery:    query,
		LanguageCode: "en",
		RegionCode:   "US",
		PageSize:     5,
	})
	if err != nil {
		return nil, err
	}

	requestURL := strings.TrimRight(h.googleBaseURL, "/") + "/places:searchText"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, requestURL, strings.NewReader(string(payload)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", h.cfg.GoogleMapsAPIKey)
	req.Header.Set("X-Goog-FieldMask", "places.id,places.displayName.text,places.formattedAddress,places.location")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("google places status %d", resp.StatusCode)
	}

	var parsed googlePlacesSearchTextResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	items := make([]domain.DeviceNavigationSearchResult, 0, len(parsed.Places))
	for _, place := range parsed.Places {
		if place.Location.Latitude == 0 && place.Location.Longitude == 0 {
			continue
		}
		items = append(items, domain.DeviceNavigationSearchResult{
			ID:        place.ID,
			Label:     strings.TrimSpace(place.DisplayName.Text),
			Address:   strings.TrimSpace(place.FormattedAddress),
			Latitude:  place.Location.Latitude,
			Longitude: place.Location.Longitude,
			Source:    "google",
		})
	}

	return items, nil
}

func (h *Handler) searchNominatim(r *http.Request, query string) ([]domain.DeviceNavigationSearchResult, error) {
	requestURL := strings.TrimRight(h.nominatimBaseURL, "/") + "/search?format=jsonv2&limit=5&countrycodes=us&q=" + url.QueryEscape(query)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept-Language", "en-US")
	req.Header.Set("User-Agent", "RouteGuard/1.0 (Device Navigation Search)")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("nominatim status %d", resp.StatusCode)
	}

	var parsed []nominatimSearchItem
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	items := make([]domain.DeviceNavigationSearchResult, 0, len(parsed))
	for _, result := range parsed {
		lat, errLat := strconv.ParseFloat(strings.TrimSpace(result.Lat), 64)
		lng, errLng := strconv.ParseFloat(strings.TrimSpace(result.Lon), 64)
		if errLat != nil || errLng != nil {
			continue
		}
		items = append(items, domain.DeviceNavigationSearchResult{
			ID:        fmt.Sprint(result.PlaceID),
			Label:     strings.TrimSpace(result.DisplayName),
			Address:   strings.TrimSpace(result.DisplayName),
			Latitude:  lat,
			Longitude: lng,
			Source:    "nominatim",
		})
	}

	return items, nil
}

func (h *Handler) fetchDeviceCurrentLocation(ctx context.Context, wifiAccessPoints []deviceGeolocationAccessPt) (map[string]any, error) {
	sanitized := sanitizeGeolocationAccessPoints(wifiAccessPoints)
	if len(sanitized) == 0 {
		return nil, fmt.Errorf("no wifi access points available")
	}

	if strings.TrimSpace(h.cfg.GoogleMapsAPIKey) != "" {
		location, err := h.fetchGoogleGeolocation(ctx, sanitized)
		if err == nil {
			return location, nil
		}
	}

	return h.fetchBeaconDBGeolocation(ctx, sanitized)
}

func sanitizeGeolocationAccessPoints(points []deviceGeolocationAccessPt) []deviceGeolocationAccessPt {
	sanitized := make([]deviceGeolocationAccessPt, 0, len(points))
	seen := make(map[string]struct{}, len(points))

	for _, point := range points {
		mac := strings.ToLower(strings.TrimSpace(point.MacAddress))
		if !usableGeolocationMAC(mac) {
			continue
		}
		if _, ok := seen[mac]; ok {
			continue
		}

		item := deviceGeolocationAccessPt{
			MacAddress: mac,
		}
		if point.SignalStrength != 0 {
			item.SignalStrength = point.SignalStrength
		}
		if point.Channel > 0 {
			item.Channel = point.Channel
		}

		sanitized = append(sanitized, item)
		seen[mac] = struct{}{}
		if len(sanitized) == 12 {
			break
		}
	}

	return sanitized
}

func usableGeolocationMAC(value string) bool {
	mac, err := net.ParseMAC(value)
	if err != nil || len(mac) != 6 {
		return false
	}

	isBroadcast := true
	for _, octet := range mac {
		if octet != 0xff {
			isBroadcast = false
			break
		}
	}
	if isBroadcast {
		return false
	}
	if mac[0] == 0x00 && mac[1] == 0x00 && mac[2] == 0x5e {
		return false
	}
	if mac[0]&0x02 != 0 {
		return false
	}

	return true
}

func (h *Handler) fetchGoogleGeolocation(ctx context.Context, wifiAccessPoints []deviceGeolocationAccessPt) (map[string]any, error) {
	requestBody, err := json.Marshal(deviceGeolocationRequest{
		WifiAccessPoints: wifiAccessPoints,
	})
	if err != nil {
		return nil, err
	}

	requestURL := strings.TrimRight(h.googleGeoBaseURL, "/") + "/geolocation/v1/geolocate?key=" + url.QueryEscape(h.cfg.GoogleMapsAPIKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, strings.NewReader(string(requestBody)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("google geolocation status %d", resp.StatusCode)
	}

	return decodeGeolocationResponse(resp.Body)
}

func (h *Handler) fetchBeaconDBGeolocation(ctx context.Context, wifiAccessPoints []deviceGeolocationAccessPt) (map[string]any, error) {
	requestBody, err := json.Marshal(deviceGeolocationRequest{
		WifiAccessPoints: wifiAccessPoints,
	})
	if err != nil {
		return nil, err
	}

	requestURL := strings.TrimRight(h.beaconDBBaseURL, "/") + "/geolocate"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, requestURL, strings.NewReader(string(requestBody)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "RouteGuard/1.0 (Device Location)")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("beacondb geolocation status %d", resp.StatusCode)
	}

	return decodeGeolocationResponse(resp.Body)
}

func decodeGeolocationResponse(body io.Reader) (map[string]any, error) {
	var parsed deviceGeolocationResponse
	if err := json.NewDecoder(body).Decode(&parsed); err != nil {
		return nil, err
	}
	if math.IsNaN(parsed.Location.Lat) || math.IsNaN(parsed.Location.Lng) {
		return nil, fmt.Errorf("invalid geolocation response")
	}
	if parsed.Accuracy <= 0 || parsed.Accuracy > maxDeviceLocationAccuracyMeters {
		return nil, fmt.Errorf("geolocation accuracy %.2f is too coarse", parsed.Accuracy)
	}

	return map[string]any{
		"latitude":  parsed.Location.Lat,
		"longitude": parsed.Location.Lng,
		"accuracy":  parsed.Accuracy,
	}, nil
}

func (h *Handler) fetchRouteGeometry(ctx context.Context, stops []domain.DeviceRouteHomeStop) (*domain.DeviceRouteGeometry, error) {
	if len(stops) < 2 || strings.TrimSpace(h.cfg.MapboxAccessToken) == "" {
		return nil, fmt.Errorf("route geometry unavailable")
	}

	points := make([]domain.DeviceNavigationDirectionsPoint, 0, len(stops))
	for _, stop := range stops {
		points = append(points, domain.DeviceNavigationDirectionsPoint{
			Latitude:  stop.Latitude,
			Longitude: stop.Longitude,
			Label:     stop.Name,
			Address:   stop.Address,
		})
	}

	directions, err := h.fetchDirections(ctx, points)
	if err != nil {
		return nil, err
	}
	return directions.Geometry, nil
}

func (h *Handler) fetchDirections(ctx context.Context, points []domain.DeviceNavigationDirectionsPoint) (*domain.DeviceNavigationDirectionsResponse, error) {
	if len(points) < 2 {
		return nil, fmt.Errorf("at least two points are required")
	}
	if strings.TrimSpace(h.cfg.MapboxAccessToken) == "" {
		return nil, fmt.Errorf("mapbox token not configured")
	}

	coordinates := make([]string, 0, len(points))
	for _, point := range points {
		coordinates = append(coordinates, fmt.Sprintf("%f,%f", point.Longitude, point.Latitude))
	}

	requestURL := fmt.Sprintf(
		"%s/directions/v5/mapbox/driving/%s?alternatives=false&continue_straight=true&geometries=geojson&overview=full&steps=true&access_token=%s",
		strings.TrimRight(h.mapboxBaseURL, "/"),
		strings.Join(coordinates, ";"),
		url.QueryEscape(h.cfg.MapboxAccessToken),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("mapbox directions status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed mapboxDirectionsResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	if len(parsed.Routes) == 0 {
		return nil, fmt.Errorf("no routes returned")
	}

	route := parsed.Routes[0]
	response := &domain.DeviceNavigationDirectionsResponse{
		DistanceMeters:  route.Distance,
		DurationSeconds: route.Duration,
		Geometry: &domain.DeviceRouteGeometry{
			Type:        route.Geometry.Type,
			Coordinates: route.Geometry.Coordinates,
		},
		Maneuvers: []domain.DeviceNavigationManeuver{},
	}

	for _, leg := range route.Legs {
		for _, step := range leg.Steps {
			if len(step.Maneuver.Location) < 2 {
				continue
			}
			response.Maneuvers = append(response.Maneuvers, domain.DeviceNavigationManeuver{
				Instruction:     step.Maneuver.Instruction,
				DistanceMeters:  step.Distance,
				DurationSeconds: step.Duration,
				Location: domain.DeviceNavigationDirectionsPoint{
					Longitude: step.Maneuver.Location[0],
					Latitude:  step.Maneuver.Location[1],
				},
			})
		}
	}

	return response, nil
}
