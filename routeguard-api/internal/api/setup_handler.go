package api

import (
	_ "embed"
	"net/http"
)

//go:embed scripts/setup.sh
var setupScript []byte

// SetupScript handles GET /setup.
// Public, no auth. Returns the device setup shell script.
func (h *Handler) SetupScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="setup.sh"`)
	w.WriteHeader(http.StatusOK)
	w.Write(setupScript)
}
