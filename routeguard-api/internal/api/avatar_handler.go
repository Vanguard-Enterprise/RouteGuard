package api

import (
	"crypto/rand"
	"fmt"
	"io"
	"net/http"

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/repository"
)

const maxAvatarBytes = 5 << 20 // 5 MB

var allowedAvatarMIME = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

// UploadAvatar handles POST /admin/profile/avatar.
// Accepts a multipart form with an "avatar" file field.
// Validates MIME type and size, uploads to RustFS, updates users.avatar_url.
func (h *Handler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Cap the total request body to prevent large payloads from buffering into memory.
	r.Body = http.MaxBytesReader(w, r.Body, maxAvatarBytes+4096)
	if err := r.ParseMultipartForm(maxAvatarBytes); err != nil {
		Error(w, http.StatusBadRequest, "file too large or invalid multipart form")
		return
	}

	file, header, err := r.FormFile("avatar")
	if err != nil {
		Error(w, http.StatusBadRequest, "avatar file is required")
		return
	}
	defer file.Close()

	if header.Size > maxAvatarBytes {
		Error(w, http.StatusBadRequest, "file must be 5 MB or smaller")
		return
	}

	// Detect MIME type from content (do not trust the browser-supplied Content-Type).
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	mimeType := http.DetectContentType(buf[:n])

	ext, ok := allowedAvatarMIME[mimeType]
	if !ok {
		Error(w, http.StatusBadRequest, "file must be JPEG, PNG, WebP, or GIF")
		return
	}

	// Seek back to the start so we can stream the full file to RustFS.
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	key := fmt.Sprintf("%s/%s%s", session.UserID, randomID(), ext)

	publicURL, err := h.storage.Upload(r.Context(), key, mimeType, header.Size, file)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	userRepo := repository.NewUserRepo(h.pool)
	user, err := userRepo.UpdateProfile(r.Context(), session.UserID, session.Name, &publicURL)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Refresh session name (AvatarURL is not stored in session payload - intentional).
	token := auth.TokenFromRequest(r)
	if token != "" {
		updated := *session
		updated.Name = user.Name
		if err := auth.UpdateSession(r.Context(), h.cache, token, updated); err != nil {
			// Non-fatal: DB update succeeded; session will refresh on next login.
		}
	}

	permissions, err := userRepo.GetUserPermissions(r.Context(), user.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"id":            user.ID,
		"org_id":        user.OrgID,
		"email":         user.Email,
		"name":          user.Name,
		"avatar_url":    user.AvatarURL,
		"last_login_at": user.LastLoginAt,
		"created_at":    user.CreatedAt,
		"permissions":   permissions,
	})
}

// randomID generates a hex-encoded 16-byte random ID for use as a filename component.
func randomID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%x", b)
}
