// Package deviceauth provides shared context types for device authentication.
// It is intentionally kept dependency-free (no imports of api or middleware) to
// avoid import cycles: both the api and middleware packages import this package.
package deviceauth

import (
	"context"

	"github.com/routeguard/api/internal/domain"
)

// contextKey is an unexported type for context keys in this package.
type contextKey string

// DeviceContextKey is the context key under which the authenticated *domain.Device
// is stored by the DeviceAuthenticate middleware.
const DeviceContextKey contextKey = "device"

// DeviceFromContext retrieves the authenticated device from the request context.
// Returns nil if no device is present (e.g., on routes that do not require device auth).
func DeviceFromContext(ctx context.Context) *domain.Device {
	d, _ := ctx.Value(DeviceContextKey).(*domain.Device)
	return d
}
