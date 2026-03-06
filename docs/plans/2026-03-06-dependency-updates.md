# Dependency Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update all outdated dependencies across the dashboard (Next.js) and API (Go), upgrade shadcn to v4, and regenerate the chart component for future use.

**Architecture:** Three-phase approach - safe patch/minor bumps first, then shadcn v4 migration (CLI + component regeneration), then Go API patches. Each phase ends with a full build/lint/test verification before committing.

**Tech Stack:** Next.js 16, React 19, shadcn/ui v4, Tailwind v4, recharts v2, Go 1.24

---

## Phase 1: Safe Dashboard Patch/Minor Updates

### Task 1: Update patch/minor npm dependencies

**Files:**
- Modify: `dashboard/package.json`
- Modify: `dashboard/package-lock.json` (auto-generated)

**Step 1: Install safe patch and minor bumps**

Run from `dashboard/`:

```bash
cd B:/.dev/RouteGuard/dashboard
npm install react@19.2.4 react-dom@19.2.4 @tabler/icons-react@3.39.0 mapbox-gl@3.19.1 motion@12.35.0 lucide-react@0.577.0
```

**Step 2: Update dev dependency patches**

```bash
npm install -D @types/node@20.19.37
```

**Step 3: Verify the build passes**

```bash
npm run lint
npm run build
```

Expected: 0 lint errors, build completes successfully.

**Step 4: Commit**

```bash
cd B:/.dev/RouteGuard
git add dashboard/package.json dashboard/package-lock.json
git commit -m "chore: update dashboard patch/minor dependencies

- react/react-dom 19.2.3 -> 19.2.4
- @tabler/icons-react 3.38.0 -> 3.39.0
- mapbox-gl 3.19.0 -> 3.19.1
- motion 12.34.4 -> 12.35.0
- lucide-react 0.576.0 -> 0.577.0
- @types/node 20.19.35 -> 20.19.37"
```

---

## Phase 2: Upgrade shadcn to v4

### Task 2: Update shadcn CLI to v4

**Files:**
- Modify: `dashboard/package.json`
- Modify: `dashboard/package-lock.json`
- Modify: `dashboard/components.json`

**Step 1: Install shadcn v4**

```bash
cd B:/.dev/RouteGuard/dashboard
npm install -D shadcn@4.0.0
```

**Step 2: Run shadcn init to update components.json if needed**

Check if `npx shadcn@4 init` prompts for migration. If it does, accept defaults to update `components.json` format. If it says already initialized, move on.

```bash
npx shadcn@4 init --yes
```

Note: The `--yes` flag accepts defaults. Review any changes to `components.json` before continuing. The existing config uses `style: "new-york"`, `rsc: true`, `tailwind.baseColor: "neutral"`, `iconLibrary: "lucide"`. Preserve custom registries (`@motion-primitives`, `@efferd`).

**Step 3: Verify build still passes**

```bash
npm run lint
npm run build
```

Expected: 0 errors, clean build.

**Step 4: Commit**

```bash
cd B:/.dev/RouteGuard
git add dashboard/package.json dashboard/package-lock.json dashboard/components.json
git commit -m "chore: upgrade shadcn CLI from v3.8.5 to v4.0.0"
```

---

### Task 3: Regenerate existing shadcn UI components with v4

**Context:** shadcn v4 may have updated component internals. Regenerate all 35 installed components. The `shadcn add --overwrite` flag replaces existing files.

**Files:**
- Modify: all files in `dashboard/components/ui/` that came from shadcn

**Step 1: List shadcn-origin components to regenerate**

The following components in `components/ui/` are from shadcn (exclude custom ones like `empty.tsx`, `full-width-divider.tsx`, `infinite-slider.tsx`, `progressive-blur.tsx`, `copy-button.tsx`, `field.tsx`, `portal.tsx`):

```
accordion alert-dialog avatar badge breadcrumb button card chart checkbox
dialog drawer dropdown-menu form input label navigation-menu select
separator sheet sidebar skeleton sonner table tabs textarea toggle
toggle-group tooltip
```

**Step 2: Regenerate all shadcn components**

```bash
cd B:/.dev/RouteGuard/dashboard
npx shadcn@4 add accordion alert-dialog avatar badge breadcrumb button card chart checkbox dialog drawer dropdown-menu form input label navigation-menu select separator sheet sidebar skeleton sonner table tabs textarea toggle toggle-group tooltip --overwrite
```

If prompted, accept all overwrites.

**Step 3: Verify build and lint**

```bash
npm run lint
npm run build
```

Expected: 0 errors. If there are lint issues from regenerated components, fix them (shadcn v4 components should be clean).

**Step 4: Visually spot-check**

Review the git diff to confirm changes are sensible (updated imports, minor API tweaks, no destructive changes to component signatures).

```bash
git diff --stat dashboard/components/ui/
```

**Step 5: Commit**

```bash
cd B:/.dev/RouteGuard
git add dashboard/components/ui/
git commit -m "chore: regenerate shadcn UI components for v4

Regenerated all shadcn-origin components with shadcn v4 CLI.
Custom components (empty, field, portal, etc.) left untouched."
```

---

### Task 4: Verify chart component is ready for use

**Context:** `components/ui/chart.tsx` was regenerated in Task 3. It wraps recharts v2. No app code currently imports it, so this is just confirming it's properly set up for future use.

**Files:**
- Read: `dashboard/components/ui/chart.tsx`

**Step 1: Confirm chart.tsx exports the expected API**

After regeneration, verify `chart.tsx` exports:
- `ChartContainer`
- `ChartTooltip` / `ChartTooltipContent`
- `ChartLegend` / `ChartLegendContent`
- `ChartStyle`
- `ChartConfig` type

**Step 2: Confirm recharts is still a dependency**

```bash
cd B:/.dev/RouteGuard/dashboard
cat package.json | grep recharts
```

Expected: `"recharts": "^2.15.4"` (shadcn charts depend on recharts v2).

**Step 3: No commit needed** - chart was already committed in Task 3.

---

## Phase 3: Go API Patch Updates

### Task 5: Update Go API dependencies

**Files:**
- Modify: `routeguard-api/go.mod`
- Modify: `routeguard-api/go.sum`

**Step 1: Update direct AWS SDK dependencies**

```bash
cd B:/.dev/RouteGuard/routeguard-api
go get github.com/aws/aws-sdk-go-v2@v1.41.3 github.com/aws/aws-sdk-go-v2/credentials@v1.19.11 github.com/aws/aws-sdk-go-v2/service/s3@v1.96.4
```

**Step 2: Tidy modules**

```bash
go mod tidy
```

**Step 3: Run tests**

```bash
go test -v ./...
```

Expected: All tests pass.

**Step 4: Build**

```bash
go build ./cmd/api
```

Expected: Clean build, no errors.

**Step 5: Commit**

```bash
cd B:/.dev/RouteGuard
git add routeguard-api/go.mod routeguard-api/go.sum
git commit -m "chore: update Go API AWS SDK patches

- aws-sdk-go-v2 1.41.2 -> 1.41.3
- aws-sdk-go-v2/credentials 1.19.10 -> 1.19.11
- aws-sdk-go-v2/service/s3 1.96.2 -> 1.96.4"
```

---

## Phase 4: Final Verification

### Task 6: Full build verification and cleanup

**Step 1: Dashboard final check**

```bash
cd B:/.dev/RouteGuard/dashboard
npm run lint
npm run build
```

**Step 2: Go API final check**

```bash
cd B:/.dev/RouteGuard/routeguard-api
go build ./cmd/api
go vet ./...
```

**Step 3: Run npm outdated to confirm state**

```bash
cd B:/.dev/RouteGuard/dashboard
npm outdated
```

Expected remaining outdated (deferred intentionally):
- `recharts` 2.x -> 3.x (deferred - shadcn manages this dependency)
- `eslint` 9.x -> 10.x (deferred - waiting for eslint-config-next support)

**Step 4: No commit needed** - verification only.

---

## Deferred Updates (Do Not Do Now)

| Package | Current | Latest | Reason to Defer |
|---------|---------|--------|-----------------|
| `recharts` | 2.15.4 | 3.7.0 | shadcn chart wrapper depends on recharts v2 API. Wait for shadcn to update their chart component for recharts v3. |
| `eslint` | 9.39.3 | 10.0.2 | `eslint-config-next` 16.x pins to eslint ^9. Upgrading breaks the lint config. Wait for Next.js to support eslint 10. |
| `@types/node` | 20.x | 25.x | Pinned to `^20` in package.json. Jumping to 25 may introduce type mismatches. Safe to defer. |
| Go indirect deps | various | various | Transitive deps from `golang-migrate`. Not worth chasing individually - they update when direct deps update. |
