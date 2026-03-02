package notifications

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// TwilioClient sends SMS messages via the Twilio REST API.
type TwilioClient struct {
	accountSID string
	authToken  string
	fromNumber string
	httpClient *http.Client
}

// NewTwilioClient creates a TwilioClient with the given credentials.
func NewTwilioClient(accountSID, authToken, fromNumber string) *TwilioClient {
	return &TwilioClient{
		accountSID: accountSID,
		authToken:  authToken,
		fromNumber: fromNumber,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Send sends an SMS to the given E.164 phone number.
// Returns the Twilio message SID or an error.
func (c *TwilioClient) Send(ctx context.Context, to, body string) (string, error) {
	endpoint := fmt.Sprintf("https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json", c.accountSID)
	form := url.Values{
		"From": {c.fromNumber},
		"To":   {to},
		"Body": {body},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("twilio: create request: %w", err)
	}
	req.SetBasicAuth(c.accountSID, c.authToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("twilio: send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("twilio: unexpected status %d", resp.StatusCode)
	}

	var result struct {
		SID string `json:"sid"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("twilio: decode response: %w", err)
	}
	return result.SID, nil
}

// BoardMessage returns the SMS body for a student boarding the bus.
func BoardMessage(studentName string) string {
	return fmt.Sprintf("RouteGuard: %s has boarded the school bus.", studentName)
}

// ExitMessage returns the SMS body for a student exiting the bus.
func ExitMessage(studentName string) string {
	return fmt.Sprintf("RouteGuard: %s has exited the school bus.", studentName)
}
