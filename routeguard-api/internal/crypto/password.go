package crypto

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

// HashPassword hashes a password using bcrypt with cost 12.
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(b), err
}

// CheckPassword verifies a password against a bcrypt hash.
// Returns nil if the password matches, error otherwise.
func CheckPassword(password, hash string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

// HashPIN hashes a driver PIN using Argon2id.
// Format: $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
func HashPIN(pin string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(pin), salt, 3, 64*1024, 4, 32)
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=3,p=4$%s$%s",
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

// CheckPIN verifies a driver PIN against an Argon2id hash.
// Returns nil if the PIN matches, error otherwise.
func CheckPIN(pin, encoded string) error {
	parts := strings.Split(encoded, "$")
	// Format: ["", "argon2id", "v=19", "m=65536,t=3,p=4", "<salt>", "<hash>"]
	if len(parts) != 6 {
		return fmt.Errorf("invalid hash format: expected 6 parts, got %d", len(parts))
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return fmt.Errorf("invalid salt encoding: %w", err)
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return fmt.Errorf("invalid hash encoding: %w", err)
	}
	actual := argon2.IDKey([]byte(pin), salt, 3, 64*1024, 4, 32)
	if subtle.ConstantTimeCompare(actual, expected) != 1 {
		return fmt.Errorf("invalid PIN")
	}
	return nil
}
