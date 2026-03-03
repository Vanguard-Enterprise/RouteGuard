package api

import "net/http"

type baseImagesResponse struct {
	ARM64 string `json:"arm64"`
	X8664 string `json:"x86_64"`
}

// GetBaseImages handles GET /admin/images.
// Returns public RustFS URLs for the ARM64 and x86-64 base device images.
func (h *Handler) GetBaseImages(w http.ResponseWriter, r *http.Request) {
	base := h.cfg.RustFSImagesPublicURL
	JSON(w, http.StatusOK, baseImagesResponse{
		ARM64: base + "/arm64/routeguard-latest.img.gz",
		X8664: base + "/x86-64/routeguard-latest.img.gz",
	})
}
