package main

import (
	"context"
	"encoding/hex"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/routeguard/api/internal/crypto"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) < 4 {
		fmt.Fprintln(os.Stderr, "usage: seeduser <email> <name> <password>")
		os.Exit(1)
	}

	email := os.Args[1]
	name := os.Args[2]
	password := os.Args[3]

	databaseURL := os.Getenv("DATABASE_URL")
	dataKeyHex := os.Getenv("DATA_ENCRYPTION_KEY")
	hmacKeyHex := os.Getenv("HMAC_KEY")

	if databaseURL == "" || dataKeyHex == "" || hmacKeyHex == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL, DATA_ENCRYPTION_KEY, and HMAC_KEY must be set")
		os.Exit(1)
	}

	dataKey, _ := hex.DecodeString(dataKeyHex)
	hmacKey, _ := hex.DecodeString(hmacKeyHex)

	emailEnc, err := crypto.Encrypt(dataKey, email)
	if err != nil {
		fmt.Fprintf(os.Stderr, "encrypt email: %v\n", err)
		os.Exit(1)
	}
	emailHash := crypto.HMAC(hmacKey, email)

	nameEnc, err := crypto.Encrypt(dataKey, name)
	if err != nil {
		fmt.Fprintf(os.Stderr, "encrypt name: %v\n", err)
		os.Exit(1)
	}

	passHash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		fmt.Fprintf(os.Stderr, "hash password: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	platformOrgID := "00000000-0000-0000-0000-000000000001"
	ownerRoleID := "00000000-0000-0000-0000-000000000002"

	tx, err := conn.Begin(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "begin tx: %v\n", err)
		os.Exit(1)
	}

	// Create user
	var userID string
	err = tx.QueryRow(ctx,
		`INSERT INTO users (email_enc, email_hash, name_enc, password_hash)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (email_hash) DO UPDATE SET email_enc = EXCLUDED.email_enc
		 RETURNING id`,
		emailEnc, emailHash, nameEnc, string(passHash),
	).Scan(&userID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "insert user: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("User created: %s\n", userID)

	// Create membership
	var membershipID string
	err = tx.QueryRow(ctx,
		`INSERT INTO org_memberships (user_id, org_id)
		 VALUES ($1, $2)
		 ON CONFLICT (user_id, org_id) DO UPDATE SET user_id = EXCLUDED.user_id
		 RETURNING id`,
		userID, platformOrgID,
	).Scan(&membershipID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "insert membership: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Membership created: %s\n", membershipID)

	// Assign Owner role
	_, err = tx.Exec(ctx,
		`INSERT INTO org_member_roles (membership_id, role_id)
		 VALUES ($1, $2)
		 ON CONFLICT (membership_id, role_id) DO NOTHING`,
		membershipID, ownerRoleID,
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "assign role: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Owner role assigned")

	if err := tx.Commit(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "commit: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Done! User can now log in.")
}
