# Admin Device Setup Guide - Design

**Date:** 2026-03-03

## Goal

Replace the stale `/admin/devices` page (two download buttons for pre-built images) with a full device setup guide for staff. Also remove the now-dead `GET /admin/images` API endpoint and its supporting code.

## What Gets Replaced / Removed

| Thing | Action |
|---|---|
| `dashboard/app/admin/devices/page.tsx` | Rewrite |
| `dashboard/lib/api.ts` - `admin.images.get()` | Remove |
| `routeguard-api/internal/api/admin_images_handler.go` | Delete |
| `routeguard-api/internal/server/server.go` - `r.Get("/images", h.GetBaseImages)` | Remove |
| `RustFSImagesPublicURL` config field (if only used here) | Remove |

## Page Design

**Route:** `/admin/devices`
**Audience:** Staff (super admins)
**Component:** Server component, no API calls needed

### Layout

Two tabs: `x86-64` and `Raspberry Pi (ARM64)`. Each tab has 4 numbered cards:

1. **Download OS** - Download button linking to the OS ISO/image
2. **Install OS** - Step-by-step with amber callout boxes for non-obvious choices
3. **Run setup script** - The `curl -fsSL https://api.route-guard.com/setup | sudo bash` command with a copy button
4. **Claim the device** - Link to `/admin/` (staff claim flow) with description

### Non-obvious OS install callouts

**x86-64 (Debian 12 netinstall):**
- Partition: choose "Guided - use entire disk" then "All files in one partition"
- Software selection screen: deselect everything, leave only "SSH server" and "standard system utilities"
- Set a root password (needed to SSH in and run the setup script)

**Raspberry Pi (RPi OS Lite 64-bit via Pi Imager):**
- Click the gear/settings icon before writing - enable SSH, set a hostname and password
- Choose "Raspberry Pi OS Lite (64-bit)" - not the full desktop version

## API Cleanup

`admin_images_handler.go` references `h.cfg.RustFSImagesPublicURL`. Check if that config field is used anywhere else before removing it. If it is only used in this handler, remove it from config too.

## What Does NOT Change

- `/dashboard/devices/provision` - stays as-is (org admin audience)
- `GET /setup` endpoint - unchanged
- `device/setup/setup.sh` - unchanged
