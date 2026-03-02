package crypto_test

import (
	"testing"

	"github.com/routeguard/api/internal/crypto"
)

func TestEncryptDecrypt(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}

	plaintext := "sensitive data: +1 (555) 867-5309"

	ciphertext, err := crypto.Encrypt(key, plaintext)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}

	if ciphertext == plaintext {
		t.Fatal("ciphertext should not equal plaintext")
	}

	decrypted, err := crypto.Decrypt(key, ciphertext)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}

	if decrypted != plaintext {
		t.Fatalf("got %q, want %q", decrypted, plaintext)
	}
}

func TestEncryptEmptyString(t *testing.T) {
	key := make([]byte, 32)

	result, err := crypto.Encrypt(key, "")
	if err != nil {
		t.Fatal(err)
	}
	if result != "" {
		t.Fatal("empty input should return empty output")
	}
}

func TestDecryptEmptyString(t *testing.T) {
	key := make([]byte, 32)

	result, err := crypto.Decrypt(key, "")
	if err != nil {
		t.Fatal(err)
	}
	if result != "" {
		t.Fatal("empty ciphertext should return empty plaintext")
	}
}

func TestEncryptProducesUniqueOutputs(t *testing.T) {
	key := make([]byte, 32)
	plaintext := "hello"

	ct1, err := crypto.Encrypt(key, plaintext)
	if err != nil {
		t.Fatal(err)
	}
	ct2, err := crypto.Encrypt(key, plaintext)
	if err != nil {
		t.Fatal(err)
	}

	if ct1 == ct2 {
		t.Fatal("two encryptions of the same plaintext should produce different ciphertexts (random nonce)")
	}
}

func TestDecryptWithWrongKey(t *testing.T) {
	key1 := make([]byte, 32)
	key2 := make([]byte, 32)
	for i := range key2 {
		key2[i] = 0xFF
	}

	ciphertext, err := crypto.Encrypt(key1, "secret")
	if err != nil {
		t.Fatal(err)
	}

	_, err = crypto.Decrypt(key2, ciphertext)
	if err == nil {
		t.Fatal("decrypting with wrong key should return error")
	}
}

func TestDecryptTamperedCiphertext(t *testing.T) {
	key := make([]byte, 32)

	ct, err := crypto.Encrypt(key, "authentic message")
	if err != nil {
		t.Fatal(err)
	}

	// Tamper with the last byte of the base64 string
	tampered := []byte(ct)
	tampered[len(tampered)-2] ^= 0xFF
	_, err = crypto.Decrypt(key, string(tampered))
	if err == nil {
		t.Fatal("decrypting tampered ciphertext should return error")
	}
}
