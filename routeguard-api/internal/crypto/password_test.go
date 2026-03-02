package crypto_test

import (
	"strings"
	"testing"

	"github.com/routeguard/api/internal/crypto"
)

func TestBcryptHashAndVerify(t *testing.T) {
	hash, err := crypto.HashPassword("correct-horse-battery-staple")
	if err != nil {
		t.Fatal(err)
	}

	if err := crypto.CheckPassword("correct-horse-battery-staple", hash); err != nil {
		t.Fatalf("correct password should verify: %v", err)
	}
	if crypto.CheckPassword("wrong-password", hash) == nil {
		t.Fatal("wrong password should fail")
	}
}

func TestBcryptHashesAreDifferent(t *testing.T) {
	h1, err := crypto.HashPassword("password")
	if err != nil {
		t.Fatal(err)
	}
	h2, err := crypto.HashPassword("password")
	if err != nil {
		t.Fatal(err)
	}
	if h1 == h2 {
		t.Fatal("bcrypt hashes for same password should differ (different salts)")
	}
}

func TestArgon2HashAndVerify(t *testing.T) {
	hash, err := crypto.HashPIN("1234")
	if err != nil {
		t.Fatal(err)
	}

	if err := crypto.CheckPIN("1234", hash); err != nil {
		t.Fatalf("correct PIN should verify: %v", err)
	}
	if crypto.CheckPIN("9999", hash) == nil {
		t.Fatal("wrong PIN should fail")
	}
}

func TestArgon2HashesAreDifferent(t *testing.T) {
	h1, err := crypto.HashPIN("1234")
	if err != nil {
		t.Fatal(err)
	}
	h2, err := crypto.HashPIN("1234")
	if err != nil {
		t.Fatal(err)
	}
	if h1 == h2 {
		t.Fatal("argon2 hashes for same PIN should differ (different salts)")
	}
}

func TestArgon2HashFormat(t *testing.T) {
	hash, err := crypto.HashPIN("5678")
	if err != nil {
		t.Fatal(err)
	}
	// Must start with the full PHC prefix including parameters
	prefix := "$argon2id$v=19$m=65536,t=3,p=4$"
	if !strings.HasPrefix(hash, prefix) {
		t.Fatalf("hash does not start with %q, got: %q", prefix, hash)
	}
}

func TestCheckPINInvalidFormat(t *testing.T) {
	err := crypto.CheckPIN("1234", "not-a-valid-hash")
	if err == nil {
		t.Fatal("invalid hash format should return error")
	}
}
