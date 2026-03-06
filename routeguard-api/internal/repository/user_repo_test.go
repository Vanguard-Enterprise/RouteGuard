package repository_test

import (
	"context"
	"testing"

	"github.com/routeguard/api/internal/crypto"
	"github.com/routeguard/api/internal/repository"
)

func TestUserRepo_CreateAndGetByEmailHash(t *testing.T) {
	pool := testPool(t)
	repo := repository.NewUserRepo(pool)
	ctx := context.Background()

	encKey := make([]byte, 32)
	encKey[0] = 0x01
	hmacKey := make([]byte, 32)
	hmacKey[0] = 0x02

	email := "test@example.com"
	emailEnc, _ := crypto.Encrypt(encKey, email)
	emailHash := crypto.HMAC(hmacKey, email)
	nameEnc, _ := crypto.Encrypt(encKey, "Test User")
	passwordHash := "$2a$10$fakehash"

	user, err := repo.Create(ctx, emailEnc, emailHash, nameEnc, &passwordHash)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if user.ID == "" {
		t.Fatal("expected user ID")
	}

	found, err := repo.GetByEmailHash(ctx, emailHash)
	if err != nil {
		t.Fatalf("GetByEmailHash failed: %v", err)
	}

	if found.ID != user.ID {
		t.Fatalf("expected ID %s, got %s", user.ID, found.ID)
	}
	if found.EmailEnc != emailEnc {
		t.Fatal("email_enc mismatch")
	}
}
