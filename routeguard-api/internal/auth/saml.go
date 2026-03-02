package auth

import "fmt"

// SAMLRelayState is stored in Redis during the SAML SP-initiated flow.
// It ties the RelayState token back to the connection and the redirect target.
type SAMLRelayState struct {
	ConnectionID  string `json:"connection_id"`
	RedirectAfter string `json:"redirect_after"`
}

// SAMLStateKey returns the Redis key for a given SAML relay state token.
func SAMLStateKey(token string) string {
	return fmt.Sprintf("saml_state:%s", token)
}
