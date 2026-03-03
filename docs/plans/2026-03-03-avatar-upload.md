# Avatar Upload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the avatar URL text input on the admin profile page with a click-to-upload file picker that stores images in a self-hosted RustFS instance and serves them publicly via a new `storage.route-guard.com` Traefik route.

**Architecture:** A RustFS container is added to the Docker Compose stack and exposed through Traefik. The Go API validates uploads (JPEG/PNG/WebP/GIF, 5 MB max), streams them to RustFS via the AWS S3 SDK, and writes the resulting public URL to `users.avatar_url`. The frontend Avatar component becomes a click-to-upload trigger with an immediate upload on file selection and local preview via `URL.createObjectURL()`.

**Tech Stack:** Go 1.24 (aws-sdk-go-v2 S3 client), RustFS (rustfs/rustfs Docker image), Next.js 16, shadcn/ui Avatar, Lucide React (Camera icon), Sonner toasts

**Design doc:** `docs/plans/2026-03-03-avatar-upload-design.md`

---

## Deployment Prerequisites (manual, one-time)

Before any code runs in production:

1. Add a DNS A record: `storage.route-guard.com` -> `10.1.40.125`
2. Issue a TLS cert for `storage.route-guard.com` using acme.sh and place it in `deploy/traefik/certs/` (or extend to a wildcard `*.route-guard.com` cert)
3. After first `docker compose up`, open the RustFS console at `http://10.1.40.125:9001`, create the `avatars` bucket, and set its access policy to **public read**

---

## Task 1: Add RustFS to docker-compose.yml and Traefik

**Files:**
- Modify: `deploy/docker-compose.yml`
- Modify: `deploy/traefik/dynamic.yml`

**Step 1: Add RustFS service and volume to docker-compose.yml**

Add the `rustfs` service after the `redis` service block, and add two volumes:

```yaml
  rustfs:
    image: rustfs/rustfs:latest
    restart: unless-stopped
    environment:
      RUSTFS_ACCESS_KEY: ${RUSTFS_ACCESS_KEY}
      RUSTFS_SECRET_KEY: ${RUSTFS_SECRET_KEY}
    volumes:
      - rustfs-data:/data
      - rustfs-logs:/logs
    networks: [rg-net]
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:9000/minio/health/live || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
```

Add to the `routeguard-api` service's `depends_on` block:
```yaml
      rustfs:
        condition: service_healthy
```

Add to the `environment` block of `routeguard-api`:
```yaml
      RUSTFS_ENDPOINT: http://rustfs:9000
      RUSTFS_ACCESS_KEY: ${RUSTFS_ACCESS_KEY}
      RUSTFS_SECRET_KEY: ${RUSTFS_SECRET_KEY}
      RUSTFS_BUCKET: avatars
      RUSTFS_PUBLIC_URL: https://storage.route-guard.com
```

Add to the `volumes:` section at the bottom:
```yaml
  rustfs-data:
  rustfs-logs:
```

**Step 2: Add storage router and service to deploy/traefik/dynamic.yml**

Add inside `http.routers:`:
```yaml
    storage:
      rule: "Host(`storage.route-guard.com`)"
      entryPoints:
        - websecure
      tls: {}
      service: storage-svc
      middlewares:
        - secure-headers
```

Add inside `http.services:`:
```yaml
    storage-svc:
      loadBalancer:
        servers:
          - url: "http://rustfs:9000"
```

**Step 3: Verify syntax**

```bash
cd deploy && docker compose config 2>&1 | head -20
```
Expected: no errors.

**Step 4: Commit**

```bash
git add deploy/docker-compose.yml deploy/traefik/dynamic.yml
git commit -m "feat: add RustFS to docker-compose and Traefik storage route"
```

---

## Task 2: Add storage config fields

**Files:**
- Modify: `routeguard-api/internal/config/config.go`

**Step 1: Add five new fields to the Config struct (after `APIBaseURL`)**

```go
	RustFSEndpoint  string
	RustFSAccessKey string
	RustFSSecretKey string
	RustFSBucket    string
	RustFSPublicURL string
```

**Step 2: Populate them in Load() (after the `APIBaseURL` line)**

```go
		RustFSEndpoint:  envOr("RUSTFS_ENDPOINT", "http://localhost:9000"),
		RustFSAccessKey: envOr("RUSTFS_ACCESS_KEY", "rustfsadmin"),
		RustFSSecretKey: envOr("RUSTFS_SECRET_KEY", "rustfsadmin"),
		RustFSBucket:    envOr("RUSTFS_BUCKET", "avatars"),
		RustFSPublicURL: envOr("RUSTFS_PUBLIC_URL", "http://localhost:9000/avatars"),
```

**Step 3: Build to confirm**

```bash
cd routeguard-api && go build ./...
```
Expected: exit 0.

**Step 4: Commit**

```bash
git add routeguard-api/internal/config/config.go
git commit -m "feat: add RustFS config fields"
```

---

## Task 3: Add AWS S3 SDK dependency

**Files:**
- Modify: `routeguard-api/go.mod`, `routeguard-api/go.sum`

**Step 1: Add the three required packages**

```bash
cd routeguard-api
go get github.com/aws/aws-sdk-go-v2/aws@latest \
       github.com/aws/aws-sdk-go-v2/credentials@latest \
       github.com/aws/aws-sdk-go-v2/service/s3@latest
```

**Step 2: Tidy**

```bash
go mod tidy
```

**Step 3: Build**

```bash
go build ./...
```
Expected: exit 0.

**Step 4: Commit**

```bash
git add go.mod go.sum
git commit -m "feat: add aws-sdk-go-v2 S3 dependency for RustFS"
```

---

## Task 4: Create the storage package

**Files:**
- Create: `routeguard-api/internal/storage/s3.go`

**Step 1: Create the file**

```go
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
		BaseEndpoint:       aws.String(endpoint),
		Credentials:        creds,
		Region:             "us-east-1", // RustFS ignores region; SDK requires a non-empty value
		UsePathStyle:       true,        // required for self-hosted S3-compatible storage
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
```

**Step 2: Build**

```bash
cd routeguard-api && go build ./...
```
Expected: exit 0.

**Step 3: Commit**

```bash
git add routeguard-api/internal/storage/
git commit -m "feat: add storage package wrapping S3-compatible RustFS client"
```

---

## Task 5: Inject storage client into Handler

**Files:**
- Modify: `routeguard-api/internal/api/handler.go`
- Modify: `routeguard-api/cmd/api/main.go`

**Step 1: Add storage field to Handler struct in handler.go**

Add the import and field:

```go
import (
    // existing imports ...
    "github.com/routeguard/api/internal/storage"
)
```

Add `storage *storage.Client` field to the `Handler` struct (after `samlKeyPair`):
```go
	storage *storage.Client
```

Update `NewHandler` signature and body:
```go
func NewHandler(pool *pgxpool.Pool, c *cache.Cache, cfg *config.Config, store *storage.Client) *Handler {
	kp, err := generateSAMLKeyPair()
	if err != nil {
		panic("saml: failed to generate SP key pair: " + err.Error())
	}
	return &Handler{pool: pool, cache: c, cfg: cfg, samlKeyPair: kp, storage: store}
}
```

**Step 2: Initialize storage in main.go and pass to NewHandler**

Read `routeguard-api/cmd/api/main.go` first to understand the startup sequence, then find where `api.NewHandler` is called (it's called from `server.New` via `s.buildRouter()` - so actually it's called in server.go). Let me clarify:

In `internal/server/server.go`, `api.NewHandler(s.pool, s.cache, s.cfg)` is called. Update the `Server` struct and `New` function to accept and pass a `*storage.Client`:

In `internal/server/server.go`:
```go
type Server struct {
	router  chi.Router
	cfg     *config.Config
	pool    *pgxpool.Pool
	cache   *cache.Cache
	storage *storage.Client
}

func New(cfg *config.Config, pool *pgxpool.Pool, c *cache.Cache, store *storage.Client) (*Server, error) {
	s := &Server{cfg: cfg, pool: pool, cache: c, storage: store}
	s.router = s.buildRouter()
	return s, nil
}
```

And in `buildRouter()`, change `api.NewHandler(s.pool, s.cache, s.cfg)` to:
```go
h := api.NewHandler(s.pool, s.cache, s.cfg, s.storage)
```

In `cmd/api/main.go`, find where `server.New` is called. Before that call, initialize storage:
```go
store, err := storage.New(
    context.Background(),
    cfg.RustFSEndpoint,
    cfg.RustFSAccessKey,
    cfg.RustFSSecretKey,
    cfg.RustFSBucket,
    cfg.RustFSPublicURL,
)
if err != nil {
    log.Fatal().Err(err).Msg("failed to initialize storage client")
}
```
Then pass `store` to `server.New(cfg, pool, cache, store)`.

Add the import: `"github.com/routeguard/api/internal/storage"`

**Step 3: Build**

```bash
cd routeguard-api && go build ./...
```
Expected: exit 0.

**Step 4: Commit**

```bash
git add routeguard-api/internal/api/handler.go \
        routeguard-api/internal/server/server.go \
        routeguard-api/cmd/api/main.go
git commit -m "feat: inject storage client into Handler and Server"
```

---

## Task 6: Create the avatar upload handler

**Files:**
- Create: `routeguard-api/internal/api/avatar_handler.go`

**Step 1: Create the file**

```go
package api

import (
	"crypto/rand"
	"fmt"
	"io"
	"net/http"

	"github.com/routeguard/api/internal/auth"
	"github.com/routeguard/api/internal/repository"
)

const maxAvatarBytes = 5 << 20 // 5 MB

var allowedAvatarMIME = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

// UploadAvatar handles POST /admin/profile/avatar.
// Accepts a multipart form with an "avatar" file field.
// Validates MIME type and size, uploads to RustFS, updates users.avatar_url.
func (h *Handler) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	session := auth.SessionFromContext(r.Context())
	if session == nil {
		Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Cap the total request body to prevent large payloads from buffering into memory.
	r.Body = http.MaxBytesReader(w, r.Body, maxAvatarBytes+4096)
	if err := r.ParseMultipartForm(maxAvatarBytes); err != nil {
		Error(w, http.StatusBadRequest, "file too large or invalid multipart form")
		return
	}

	file, header, err := r.FormFile("avatar")
	if err != nil {
		Error(w, http.StatusBadRequest, "avatar file is required")
		return
	}
	defer file.Close()

	if header.Size > maxAvatarBytes {
		Error(w, http.StatusBadRequest, "file must be 5 MB or smaller")
		return
	}

	// Detect MIME type from content (do not trust the browser-supplied Content-Type).
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	mimeType := http.DetectContentType(buf[:n])

	ext, ok := allowedAvatarMIME[mimeType]
	if !ok {
		Error(w, http.StatusBadRequest, "file must be JPEG, PNG, WebP, or GIF")
		return
	}

	// Seek back to the start so we can stream the full file to RustFS.
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	key := fmt.Sprintf("%s/%s%s", session.UserID, randomID(), ext)

	publicURL, err := h.storage.Upload(r.Context(), key, mimeType, header.Size, file)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	userRepo := repository.NewUserRepo(h.pool)
	user, err := userRepo.UpdateProfile(r.Context(), session.UserID, session.Name, &publicURL)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	// Refresh session name (AvatarURL is not stored in session payload - intentional).
	token := auth.TokenFromRequest(r)
	if token != "" {
		updated := *session
		updated.Name = user.Name
		if err := auth.UpdateSession(r.Context(), h.cache, token, updated); err != nil {
			// Non-fatal: DB update succeeded; session will refresh on next login.
		}
	}

	permissions, err := userRepo.GetUserPermissions(r.Context(), user.ID)
	if err != nil {
		Error(w, http.StatusInternalServerError, "internal server error")
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"id":           user.ID,
		"org_id":       user.OrgID,
		"email":        user.Email,
		"name":         user.Name,
		"avatar_url":   user.AvatarURL,
		"last_login_at": user.LastLoginAt,
		"created_at":   user.CreatedAt,
		"permissions":  permissions,
	})
}

// randomID generates a hex-encoded 16-byte random ID for use as a filename component.
func randomID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%x", b)
}
```

**Step 2: Build**

```bash
cd routeguard-api && go build ./...
```
Expected: exit 0.

**Step 3: Commit**

```bash
git add routeguard-api/internal/api/avatar_handler.go
git commit -m "feat: add UploadAvatar handler (POST /admin/profile/avatar)"
```

---

## Task 7: Wire the avatar upload route

**Files:**
- Modify: `routeguard-api/internal/server/server.go`

**Step 1: Add the route inside the /admin route group**

Find the profile routes block (added in the admin profile feature):
```go
		// Profile (own account)
		r.Get("/profile", h.GetAdminProfile)
		r.Patch("/profile", h.UpdateAdminProfile)
		r.Post("/profile/password", h.ChangeAdminPassword)
```

Add one line:
```go
		r.Post("/profile/avatar", h.UploadAvatar)
```

**Step 2: Build and test**

```bash
cd routeguard-api && go build ./... && go test -v ./...
```
Expected: all tests pass.

**Step 3: Commit**

```bash
git add routeguard-api/internal/server/server.go
git commit -m "feat: wire POST /admin/profile/avatar route"
```

---

## Task 8: Add uploadAvatar to api.ts

**Files:**
- Modify: `dashboard/lib/api.ts`

**Step 1: Add uploadAvatar to api.admin.profile**

Find the `profile` block inside `api.admin`:
```ts
    profile: {
      get: () => request<User>('/admin/profile'),
      update: (data: { name: string; avatar_url?: string | null }) =>
        request<User>('/admin/profile', { method: 'PATCH', body: JSON.stringify(data) }),
      changePassword: (data: { current_password: string; new_password: string }) =>
        request<void>('/admin/profile/password', { method: 'POST', body: JSON.stringify(data) }),
    },
```

Add `uploadAvatar` after `changePassword`:
```ts
      uploadAvatar: (file: File) => {
        const form = new FormData()
        form.append('avatar', file)
        return request<User>('/admin/profile/avatar', {
          method: 'POST',
          headers: {},
          body: form,
        })
      },
```

Note: `headers: {}` is required - it prevents the `request` helper from setting `Content-Type: application/json`, which would break the multipart boundary. The browser sets the correct `multipart/form-data` header automatically when `body` is a `FormData`.

**Step 2: Lint**

```bash
cd dashboard && npm run lint
```
Expected: 0 errors.

**Step 3: Commit**

```bash
git add dashboard/lib/api.ts
git commit -m "feat: add api.admin.profile.uploadAvatar to api.ts"
```

---

## Task 9: Rewrite AdminProfileForm with click-to-upload avatar

**Files:**
- Modify: `dashboard/components/admin/admin-profile-form.tsx`

**Step 1: Replace the entire file**

The URL text input is removed. The Avatar becomes a clickable upload trigger. Upload happens immediately on file selection.

```tsx
'use client'

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Camera } from 'lucide-react'
import { api, APIError, type User } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
})

type FormValues = z.infer<typeof schema>

interface AdminProfileFormProps {
  user: User
}

export function AdminProfileForm({ user }: AdminProfileFormProps) {
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [avatarSrc, setAvatarSrc] = useState<string | null>(user.avatar_url)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user.email[0].toUpperCase()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: user.name },
  })

  async function onSubmit(data: FormValues) {
    setSaving(true)
    try {
      await api.admin.profile.update({ name: data.name, avatar_url: avatarSrc })
      toast.success('Profile updated.')
    } catch (err) {
      toast.error(err instanceof APIError ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Show a local preview immediately while upload is in progress.
    const localURL = URL.createObjectURL(file)
    setAvatarSrc(localURL)
    setUploading(true)

    try {
      const updated = await api.admin.profile.uploadAvatar(file)
      setAvatarSrc(updated.avatar_url)
      toast.success('Avatar updated.')
    } catch (err) {
      // Revert preview on failure.
      setAvatarSrc(user.avatar_url)
      toast.error(err instanceof APIError ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
      URL.revokeObjectURL(localURL)
      // Reset file input so the same file can be re-selected after an error.
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your display name and avatar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="group relative h-16 w-16 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Upload profile picture"
            >
              <Avatar className="h-16 w-16 rounded-lg">
                <AvatarImage src={avatarSrc ?? undefined} alt={user.name || user.email} />
                <AvatarFallback className="rounded-lg text-lg">
                  {uploading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  ) : (
                    initials
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="text-sm text-muted-foreground">
              <p className="font-medium">{user.email}</p>
              <p>Staff account</p>
              <p className="mt-1 text-xs">JPEG, PNG, WebP or GIF - max 5 MB</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" {...register('name')} placeholder="Your name" />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <Button type="submit" disabled={saving || uploading}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Lint and build**

```bash
cd dashboard && npm run lint && npm run build
```
Expected: 0 errors, build succeeds.

**Step 3: Commit**

```bash
git add dashboard/components/admin/admin-profile-form.tsx
git commit -m "feat: replace avatar URL input with click-to-upload in AdminProfileForm"
```

---

## Verification

```bash
# Go
cd routeguard-api
go build ./cmd/api
go test -v ./...

# Dashboard
cd dashboard
npm run lint    # 0 errors
npm run build   # no TypeScript errors
```

**Manual tests (staging or local with RustFS running):**
1. Click the avatar on the profile page - file picker opens.
2. Select a JPEG/PNG/WebP/GIF under 5 MB - local preview appears immediately, spinner shows during upload, success toast on completion, avatar updates to the stored URL.
3. Select a file over 5 MB - API returns 400, error toast shown, previous avatar restored.
4. Select a non-image file (e.g. `.txt`) - API returns 400 "file must be JPEG, PNG, WebP, or GIF", error toast shown.
5. Change name and click Save - name updates, avatar is unaffected.
6. Reload the page - avatar persists (loaded from `user.avatar_url` returned by `GET /admin/profile`).
7. Avatar appears in the sidebar user dropdown (uses `AvatarImage` which was added in the admin profile feature).
