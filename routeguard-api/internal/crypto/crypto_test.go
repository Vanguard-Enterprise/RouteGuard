package crypto_test

import (
	"testing"

	"github.com/routeguard/api/internal/crypto"
)

func TestEncryptDecrypt(t *testing.T) {
	key := make([]byte, 32)
	key[0] = 0x01

	plaintext := "hello@example.com"

	ciphertext, err := crypto.Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	if ciphertext == plaintext {
		t.Fatal("ciphertext should differ from plaintext")
	}

	decrypted, err := crypto.Decrypt(key, ciphertext)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if decrypted != plaintext {
		t.Fatalf("expected %q, got %q", plaintext, decrypted)
	}
}

func TestEncryptProducesDifferentCiphertexts(t *testing.T) {
	key := make([]byte, 32)
	plaintext := "same input"

	c1, _ := crypto.Encrypt(key, plaintext)
	c2, _ := crypto.Encrypt(key, plaintext)

	if c1 == c2 {
		t.Fatal("two encryptions of the same plaintext should produce different ciphertexts (random nonce)")
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key1 := make([]byte, 32)
	key1[0] = 0x01
	key2 := make([]byte, 32)
	key2[0] = 0x02

	ciphertext, _ := crypto.Encrypt(key1, "secret")
	_, err := crypto.Decrypt(key2, ciphertext)
	if err == nil {
		t.Fatal("expected error decrypting with wrong key")
	}
}

func TestHMAC(t *testing.T) {
	key := make([]byte, 32)
	email := "user@example.com"

	h1 := crypto.HMAC(key, email)
	h2 := crypto.HMAC(key, email)

	if h1 != h2 {
		t.Fatal("HMAC should be deterministic")
	}

	if h1 == "" {
		t.Fatal("HMAC should not be empty")
	}

	h3 := crypto.HMAC(key, "other@example.com")
	if h1 == h3 {
		t.Fatal("different inputs should produce different HMACs")
	}
}

func TestHMACDifferentKeys(t *testing.T) {
	key1 := make([]byte, 32)
	key1[0] = 0x01
	key2 := make([]byte, 32)
	key2[0] = 0x02

	h1 := crypto.HMAC(key1, "user@example.com")
	h2 := crypto.HMAC(key2, "user@example.com")

	if h1 == h2 {
		t.Fatal("different keys should produce different HMACs")
	}
}
