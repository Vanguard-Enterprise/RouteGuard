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
	if err != nil {
		return "", fmt.Errorf("bcrypt hash: %w", err)
	}
	return string(b), nil
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
		return "", fmt.Errorf("generate salt: %w", err)
	}
	hash := argon2.IDKey([]byte(pin), salt, 3, 64*1024, 4, 32)
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=3,p=4$%s$%s",
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

// CheckPIN verifies a driver PIN against an Argon2id encoded hash.
// Returns nil if the PIN matches, error otherwise.
// The encoded hash must be in the format produced by HashPIN.
func CheckPIN(pin, encoded string) error {
	// Split: ["", "argon2id", "v=19", "m=65536,t=3,p=4", "<salt>", "<hash>"]
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 {
		return fmt.Errorf("invalid hash format: expected 6 parts, got %d", len(parts))
	}
	if parts[1] != "argon2id" {
		return fmt.Errorf("unsupported algorithm: %q", parts[1])
	}

	// Parse parameters from the encoded string so future parameter migrations work correctly.
	var memory uint32
	var iterations uint32
	var parallelism uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil {
		return fmt.Errorf("invalid parameters %q: %w", parts[3], err)
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return fmt.Errorf("invalid salt encoding: %w", err)
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return fmt.Errorf("invalid hash encoding: %w", err)
	}

	// Derive key using parameters parsed from the hash, not hardcoded values.
	keyLen := uint32(len(expected))
	actual := argon2.IDKey([]byte(pin), salt, iterations, memory, parallelism, keyLen)
	if subtle.ConstantTimeCompare(actual, expected) != 1 {
		return fmt.Errorf("invalid PIN")
	}
	return nil
}
