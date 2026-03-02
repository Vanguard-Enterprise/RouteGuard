package api

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"net/http"
	"net/url"
	"sort"

	"github.com/routeguard/api/internal/repository"
)

// validateTwilioSignatureHeader computes the expected HMAC-SHA1 signature for
// the given URL and POST params and compares it (constant-time) to the
// provided header value.
//
// Algorithm:
//  1. Start with the full webhook URL.
//  2. Sort POST parameter names alphabetically.
//  3. Append each name+value pair (no separator) to the URL string.
//  4. Compute HMAC-SHA1 using the Twilio auth token as the key.
//  5. Base64-encode the result and compare to the X-Twilio-Signature header.
func validateTwilioSignatureHeader(authToken, webhookURL string, params url.Values, header string) bool {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	s := webhookURL
	for _, k := range keys {
		s += k + params.Get(k)
	}

	mac := hmac.New(sha1.New, []byte(authToken))
	mac.Write([]byte(s))
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(header))
}

// TwilioStatusWebhook handles POST /webhooks/twilio/status.
// Twilio calls this endpoint to deliver message status updates.
// The handler validates the Twilio HMAC-SHA1 signature, then maps the
// incoming MessageStatus to our internal status and persists the update.
func (h *Handler) TwilioStatusWebhook(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		Error(w, http.StatusBadRequest, "invalid form body")
		return
	}

	// Validate Twilio signature when an auth token is configured (skip in dev).
	if h.cfg.TwilioAuthToken != "" {
		webhookURL := h.cfg.APIBaseURL + r.URL.Path
		if !validateTwilioSignatureHeader(h.cfg.TwilioAuthToken, webhookURL, r.PostForm, r.Header.Get("X-Twilio-Signature")) {
			Error(w, http.StatusForbidden, "invalid signature")
			return
		}
	}

	messageSID := r.PostFormValue("MessageSid")
	messageStatus := r.PostFormValue("MessageStatus")

	// Map Twilio status to our internal status.
	var internalStatus string
	switch messageStatus {
	case "delivered":
		internalStatus = "delivered"
	case "failed", "undelivered":
		internalStatus = "failed"
	case "sent":
		internalStatus = "sent"
	default:
		// Ignore all other Twilio status values (queued, sending, etc.)
		NoContent(w)
		return
	}

	smsRepo := repository.NewSMSRepo(h.pool)
	if err := smsRepo.UpdateSMSStatus(r.Context(), messageSID, internalStatus); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	NoContent(w)
}
