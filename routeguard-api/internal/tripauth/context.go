// Package tripauth provides shared context types for trip session authentication.
// It is intentionally kept dependency-free (no imports of api or middleware) to
// avoid import cycles: both the api and middleware packages import this package.
package tripauth

import "context"

// contextKey is an unexported type for context keys in this package.
type contextKey string

// TripSessionContextKey is the context key under which the authenticated
// *TripSessionPayload is stored by the TripSessionAuthenticate middleware.
const TripSessionContextKey contextKey = "trip_session"

// TripSessionPayload is stored in Redis under "trip_session:<token>" after a driver
// authenticates via PIN or RFID. It carries the minimal identity needed to authorise
// trip lifecycle operations on behalf of the driver+device pair.
type TripSessionPayload struct {
	DriverID string `json:"driver_id"`
	DeviceID string `json:"device_id"`
	OrgID    string `json:"org_id"`
}

// TripSessionFromContext retrieves the authenticated trip session from the request context.
// Returns nil if no session is present (e.g., on routes that do not require trip auth).
func TripSessionFromContext(ctx context.Context) *TripSessionPayload {
	v, _ := ctx.Value(TripSessionContextKey).(*TripSessionPayload)
	return v
}
