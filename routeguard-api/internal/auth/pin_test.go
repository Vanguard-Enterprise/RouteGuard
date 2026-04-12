package auth

import "testing"

func TestHashPINAndVerifyPIN(t *testing.T) {
	hash, err := HashPIN("1234")
	if err != nil {
		t.Fatalf("HashPIN failed: %v", err)
	}

	ok, err := VerifyPIN("1234", hash)
	if err != nil {
		t.Fatalf("VerifyPIN failed: %v", err)
	}
	if !ok {
		t.Fatal("expected PIN to verify")
	}
}

func TestVerifyPINRejectsWrongPIN(t *testing.T) {
	hash, err := HashPIN("1234")
	if err != nil {
		t.Fatalf("HashPIN failed: %v", err)
	}

	ok, err := VerifyPIN("9999", hash)
	if err != nil {
		t.Fatalf("VerifyPIN failed: %v", err)
	}
	if ok {
		t.Fatal("expected wrong PIN to fail verification")
	}
}

func TestVerifyPINRejectsInvalidFormat(t *testing.T) {
	if _, err := VerifyPIN("1234", "not-a-valid-hash"); err == nil {
		t.Fatal("expected invalid hash format to fail")
	}
}

func TestValidatePIN(t *testing.T) {
	for _, tc := range []struct {
		name    string
		pin     string
		wantErr bool
	}{
		{name: "valid", pin: "1234"},
		{name: "too short", pin: "123", wantErr: true},
		{name: "too long", pin: "12345", wantErr: true},
		{name: "non digit", pin: "12a4", wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidatePIN(tc.pin)
			if tc.wantErr && err == nil {
				t.Fatal("expected error")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}
