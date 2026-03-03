package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// Client wraps the S3-compatible RustFS client.
type Client struct {
	s3        *s3.Client
	bucket    string
	publicURL string // base URL for public object access, e.g. https://storage.route-guard.com
}

// New creates a storage Client and ensures the target bucket exists with public read access.
func New(ctx context.Context, endpoint, accessKey, secretKey, bucket, publicURL string) (*Client, error) {
	creds := credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")
	s3Client := s3.New(s3.Options{
		BaseEndpoint: aws.String(endpoint),
		Credentials:  creds,
		Region:       "us-east-1", // RustFS ignores region; SDK requires a non-empty value
		UsePathStyle: true,        // required for self-hosted S3-compatible storage
	})

	c := &Client{s3: s3Client, bucket: bucket, publicURL: publicURL}
	if err := c.ensureBucket(ctx); err != nil {
		return nil, fmt.Errorf("storage: ensure bucket %q: %w", bucket, err)
	}
	return c, nil
}

// Upload streams body to RustFS under key and returns the public URL.
func (c *Client) Upload(ctx context.Context, key, contentType string, size int64, body io.Reader) (string, error) {
	_, err := c.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(c.bucket),
		Key:           aws.String(key),
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(size),
		Body:          body,
	})
	if err != nil {
		return "", fmt.Errorf("upload %s: %w", key, err)
	}
	return fmt.Sprintf("%s/%s", c.publicURL, key), nil
}

// ensureBucket creates the bucket if it does not exist and sets a public read policy.
func (c *Client) ensureBucket(ctx context.Context) error {
	_, err := c.s3.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(c.bucket)})
	if err == nil {
		return nil // bucket already exists
	}

	var notFound *types.NoSuchBucket
	var notFoundHTTP *types.NotFound
	if !errors.As(err, &notFound) && !errors.As(err, &notFoundHTTP) {
		// HeadBucket returns a generic HTTP 404 for missing buckets in some S3 implementations
		// Check if it's a 404-class error by inspecting the error string as a fallback
		// If it's a different error (permissions, network), propagate it
		if fmt.Sprintf("%T", err) != "*smithy.GenericAPIError" {
			return fmt.Errorf("head bucket: %w", err)
		}
	}

	if _, err := c.s3.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(c.bucket),
	}); err != nil {
		return fmt.Errorf("create bucket: %w", err)
	}

	// Set public read policy so stored avatar URLs are accessible from browsers.
	policy := map[string]any{
		"Version": "2012-10-17",
		"Statement": []map[string]any{
			{
				"Effect":    "Allow",
				"Principal": map[string]any{"AWS": "*"},
				"Action":    []string{"s3:GetObject"},
				"Resource":  []string{fmt.Sprintf("arn:aws:s3:::%s/*", c.bucket)},
			},
		},
	}
	policyJSON, err := json.Marshal(policy)
	if err != nil {
		return fmt.Errorf("marshal bucket policy: %w", err)
	}
	policyStr := string(policyJSON)
	if _, err := c.s3.PutBucketPolicy(ctx, &s3.PutBucketPolicyInput{
		Bucket: aws.String(c.bucket),
		Policy: aws.String(policyStr),
	}); err != nil {
		// Non-fatal: bucket policy may not be supported in RustFS alpha.
		// If avatars are not publicly accessible, set the bucket to public
		// manually via the RustFS console at http://<host>:9001.
		_ = err
	}

	return nil
}
