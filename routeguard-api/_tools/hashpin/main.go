package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "usage: hashpin <pin> <password>")
		os.Exit(1)
	}
	pin := os.Args[1]
	password := os.Args[2]

	salt := make([]byte, 16)
	rand.Read(salt)
	hash := argon2.IDKey([]byte(pin), salt, 3, 64*1024, 4, 32)
	pinHash := fmt.Sprintf("$argon2id$v=19$m=65536,t=3,p=4$%s$%s",
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	)

	pwHash, _ := bcrypt.GenerateFromPassword([]byte(password), 12)

	fmt.Println("PIN_HASH=" + pinHash)
	fmt.Println("PW_HASH=" + string(pwHash))
}
