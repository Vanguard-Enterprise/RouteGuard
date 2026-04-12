package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/crypto/argon2"
)

const (
	pinLength             = 4
	pinMemory      uint32 = 64 * 1024
	pinIterations  uint32 = 3
	pinParallelism uint8  = 4
	pinSaltLength         = 16
	pinKeyLength   uint32 = 32
)

// ValidatePIN enforces the RouteGuard driver PIN format.
func ValidatePIN(pin string) error {
	if len(pin) != pinLength {
		return fmt.Errorf("pin must be exactly %d digits", pinLength)
	}
	for _, r := range pin {
		if !unicode.IsDigit(r) {
			return fmt.Errorf("pin must contain only digits")
		}
	}
	return nil
}

// HashPIN generates an Argon2id hash for a driver PIN.
func HashPIN(pin string) (string, error) {
	if err := ValidatePIN(pin); err != nil {
		return "", err
	}

	salt := make([]byte, pinSaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate pin salt: %w", err)
	}

	hash := argon2.IDKey([]byte(pin), salt, pinIterations, pinMemory, pinParallelism, pinKeyLength)
	return fmt.Sprintf(
		"$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		pinMemory,
		pinIterations,
		pinParallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

// VerifyPIN checks a PIN against an encoded Argon2id hash.
func VerifyPIN(pin, encoded string) (bool, error) {
	if err := ValidatePIN(pin); err != nil {
		return false, err
	}

	params, salt, hash, err := parseEncodedPINHash(encoded)
	if err != nil {
		return false, err
	}

	actual := argon2.IDKey([]byte(pin), salt, params.iterations, params.memory, params.parallelism, uint32(len(hash)))
	return subtle.ConstantTimeCompare(actual, hash) == 1, nil
}

type pinHashParams struct {
	memory      uint32
	iterations  uint32
	parallelism uint8
}

func parseEncodedPINHash(encoded string) (pinHashParams, []byte, []byte, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return pinHashParams{}, nil, nil, fmt.Errorf("invalid pin hash format")
	}

	versionPart := strings.TrimPrefix(parts[2], "v=")
	version, err := strconv.Atoi(versionPart)
	if err != nil || version != argon2.Version {
		return pinHashParams{}, nil, nil, fmt.Errorf("invalid pin hash version")
	}

	var params pinHashParams
	for _, pair := range strings.Split(parts[3], ",") {
		name, value, ok := strings.Cut(pair, "=")
		if !ok {
			return pinHashParams{}, nil, nil, fmt.Errorf("invalid pin hash parameters")
		}
		switch name {
		case "m":
			parsed, err := strconv.ParseUint(value, 10, 32)
			if err != nil {
				return pinHashParams{}, nil, nil, fmt.Errorf("invalid pin hash memory")
			}
			params.memory = uint32(parsed)
		case "t":
			parsed, err := strconv.ParseUint(value, 10, 32)
			if err != nil {
				return pinHashParams{}, nil, nil, fmt.Errorf("invalid pin hash iterations")
			}
			params.iterations = uint32(parsed)
		case "p":
			parsed, err := strconv.ParseUint(value, 10, 8)
			if err != nil {
				return pinHashParams{}, nil, nil, fmt.Errorf("invalid pin hash parallelism")
			}
			params.parallelism = uint8(parsed)
		default:
			return pinHashParams{}, nil, nil, fmt.Errorf("invalid pin hash parameters")
		}
	}

	if params.memory == 0 || params.iterations == 0 || params.parallelism == 0 {
		return pinHashParams{}, nil, nil, fmt.Errorf("invalid pin hash parameters")
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) == 0 {
		return pinHashParams{}, nil, nil, fmt.Errorf("invalid pin hash salt")
	}

	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(hash) == 0 {
		return pinHashParams{}, nil, nil, fmt.Errorf("invalid pin hash digest")
	}

	return params, salt, hash, nil
}
