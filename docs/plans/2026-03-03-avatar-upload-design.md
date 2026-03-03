# Avatar Upload Design

**Goal:** Replace the avatar URL text input on the admin profile page with a click-to-upload file picker that stores images in a self-hosted RustFS instance.

**Date:** 2026-03-03

---

## Decisions

| Question | Decision |
|----------|----------|
| Storage | RustFS (self-hosted, S3-compatible) |
| Upload flow | Proxy through Go API (Option A) |
| UI | Click avatar to upload, immediate on selection, URL field removed |
| File constraints | JPEG, PNG, WebP, GIF - max 5 MB |

---

## Infrastructure

RustFS runs as a new container in `docker-compose.yml`, reachable internally at `http://rustfs:9000`. Traefik exposes it publicly at `https://storage.route-guard.com`. The `avatars` bucket is created with public read access on first boot. Uploaded files use the key `avatars/{userID}/{uuid}.{ext}`. The full public URL is stored in `users.avatar_url`.

## Go API

- New dependency: `github.com/aws/aws-sdk-go-v2` S3 client (S3-compatible, AWS Sig v4)
- New env vars: `RUSTFS_ENDPOINT`, `RUSTFS_ACCESS_KEY`, `RUSTFS_SECRET_KEY`, `RUSTFS_BUCKET`
- S3 client initialized at startup and injected into `Handler`
- New endpoint: `POST /admin/profile/avatar` under `/admin` (inherits `Authenticate` + `RequireStaff`)
  - Reads multipart file, validates MIME type and size, streams to RustFS, calls `UpdateProfile`, refreshes session
  - Returns updated `User` response (same shape as `PATCH /admin/profile`)

## Frontend

- `AdminProfileForm`: URL text input removed; `Avatar` becomes a clickable upload trigger wrapping a hidden `<input type="file">`
- Camera icon overlays the avatar on hover
- On file selection: preview via `URL.createObjectURL()`, POST via `api.admin.profile.uploadAvatar(file)`, spinner during upload, toast on success/error, restore previous avatar on error
- New `api.ts` method: `api.admin.profile.uploadAvatar(file: File)`
- `admin-nav-user.tsx`: no changes needed
