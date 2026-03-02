package auth

import "fmt"

// OAuthState is stored in Redis for the duration of an OAuth authorization code flow.
// It ties the browser's state parameter back to the original request parameters and
// holds the PKCE code verifier needed to complete the token exchange.
type OAuthState struct {
	State         string `json:"state"`
	CodeVerifier  string `json:"code_verifier"`
	ConnectionID  string `json:"connection_id"`
	RedirectAfter string `json:"redirect_after"` // default: "/dashboard"
}

// OAuthStateKey returns the Redis key for a given state token.
func OAuthStateKey(state string) string {
	return fmt.Sprintf("oauth_state:%s", state)
}
