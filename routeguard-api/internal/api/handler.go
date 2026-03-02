package api

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/routeguard/api/internal/cache"
	"github.com/routeguard/api/internal/config"
	"github.com/routeguard/api/internal/crypto"
)

// Handler holds all shared dependencies for HTTP handlers.
type Handler struct {
	pool       *pgxpool.Pool
	cache      *cache.Cache
	cfg        *config.Config
	samlKeyPair tls.Certificate
}

// NewHandler creates a new Handler with all dependencies.
// It generates an ephemeral RSA 2048-bit key pair for SAML SP signing.
func NewHandler(pool *pgxpool.Pool, c *cache.Cache, cfg *config.Config) *Handler {
	kp, err := generateSAMLKeyPair()
	if err != nil {
		// A failure here is a programming/environment error; panic at startup.
		panic("saml: failed to generate SP key pair: " + err.Error())
	}
	return &Handler{pool: pool, cache: c, cfg: cfg, samlKeyPair: kp}
}

// generateSAMLKeyPair creates an ephemeral RSA 2048-bit private key and a
// self-signed certificate suitable for use as the SAML SP signing credential.
func generateSAMLKeyPair() (tls.Certificate, error) {
	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return tls.Certificate{}, err
	}

	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"RouteGuard SP"},
		},
		NotBefore:             time.Now().Add(-time.Minute),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &privKey.PublicKey, privKey)
	if err != nil {
		return tls.Certificate{}, err
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privKey),
	})

	kp, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return tls.Certificate{}, err
	}

	// Parse the leaf certificate so we can hand it to crewjam/saml directly.
	kp.Leaf, err = x509.ParseCertificate(kp.Certificate[0])
	if err != nil {
		return tls.Certificate{}, err
	}
	return kp, nil
}

// decryptOptional decrypts a ciphertext pointer if non-nil and non-empty.
// Returns nil if the input is nil (nothing stored).
func (h *Handler) decryptOptional(enc *string) (*string, error) {
	if enc == nil || *enc == "" {
		return enc, nil
	}
	plain, err := crypto.Decrypt(h.cfg.DataEncryptionKey, *enc)
	if err != nil {
		return nil, err
	}
	return &plain, nil
}
