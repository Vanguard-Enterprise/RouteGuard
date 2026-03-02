package crypto_test

import (
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
	h1, _ := crypto.HashPassword("password")
	h2, _ := crypto.HashPassword("password")
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
	h1, _ := crypto.HashPIN("1234")
	h2, _ := crypto.HashPIN("1234")
	if h1 == h2 {
		t.Fatal("argon2 hashes for same PIN should differ (different salts)")
	}
}

func TestArgon2HashFormat(t *testing.T) {
	hash, err := crypto.HashPIN("5678")
	if err != nil {
		t.Fatal(err)
	}
	// Must start with $argon2id$
	if len(hash) < 10 || hash[:9] != "$argon2id" {
		t.Fatalf("hash does not start with $argon2id: %q", hash)
	}
}

func TestCheckPINInvalidFormat(t *testing.T) {
	err := crypto.CheckPIN("1234", "not-a-valid-hash")
	if err == nil {
		t.Fatal("invalid hash format should return error")
	}
}
