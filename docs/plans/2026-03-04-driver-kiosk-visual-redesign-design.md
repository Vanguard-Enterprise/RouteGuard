# Driver Kiosk Visual Redesign - Design

## Context

The driver kiosk (`dashboard/app/driver/`) currently uses hardcoded hex colors and no
shadcn/ui components. The goal is a complete visual redesign that matches the admin panel's
approach: shadcn components, CSS variables, lucide-react icons, and the brand logo image
instead of text.

## Target Device

Mounted touchscreen in the vehicle. Touch targets must be large (minimum 64px), contrast
must be high, and the UI must be readable at a glance.

## Approach

Wrap the driver layout in `className="dark"` so all shadcn components automatically use
the dark CSS variable set. Replace every hardcoded hex with the appropriate CSS variable.
Use `<LogoIcon>` and `<Logo>` from `components/logo.tsx` instead of "RouteGuard" text.

No new shadcn packages needed - `Card`, `Button`, `Badge`, `Separator`, `Skeleton`,
`Dialog`, `Avatar` are already installed.

## Screen-by-Screen Spec

### 1. Lock Screen (`components/driver/lock-screen.tsx`)

- `bg-background` full-height centered column
- `<Logo>` (~180px wide) replacing the text heading
- Time-based greeting: `text-muted-foreground`
- `<Card>` wrapping the PIN pad; "Enter your PIN" label in `text-xs uppercase tracking-widest`
- RFID hint: `<Separator />` + `CreditCard` lucide icon + "or tap your RFID badge" in `text-muted-foreground`

### 2. PIN Pad (`components/driver/pin-pad.tsx`)

- Dot display: custom circles, amber (`#F5A825`) when filled, red on error - keep existing logic
- Number buttons: shadcn `Button` variant="outline" with explicit 72x72px override
- Backspace: `Button` variant="ghost"
- Confirm: `Button` with explicit `bg-green-600 hover:bg-green-500 text-white`
- Shake + auto-clear animations: unchanged

### 3. Pre-Trip (`app/driver/pre-trip/page.tsx` + `components/driver/route-summary.tsx`)

- Header bar: `<LogoIcon>` (32px) + `Button` variant="ghost" size="sm" for logout
- "Ready for your run?" heading: `text-foreground`
- Two `<Card>` components replacing the raw divs:
  - Driver card: `User` icon + driver name + date
  - Assignment card: `MapPin` icon + route name + `Badge` chips for vehicle/stops/type
- Loading state: `<Skeleton>` lines inside assignment card
- "Start Run": `Button` full-width size="lg" with explicit `bg-[#2A7D4F] hover:bg-[#235f3c]`

### 4. Active Run (`components/driver/active-run.tsx`)

Header:
- `<LogoIcon>` (32px) + trip ID as `Badge` variant="outline"

Stop progress:
- Custom div progress bar (percentage-filled teal strip) - no extra dependency
- Stop counter as `Badge` + large stop name

Scan list (`components/driver/student-scan-list.tsx`):
- Replace `<table>` with vertical list of `<Card>` rows
- Each row: lucide icon + student name + `Badge` status + relative timestamp
  - Board: `UserCheck` (text-green-400), badge "Boarded" (green)
  - Exit: `UserMinus` (text-amber-400), badge "Exited" (amber)
  - Unauthorized: `AlertCircle` (text-destructive), badge "Unknown" (red)
- Empty state: `Users` icon + "Awaiting scans for this stop"

Action buttons:
- Next Stop: `Button` full-width size="lg"
- End Run: `Button` variant="outline" `border-destructive text-destructive` full-width
- Confirm end: shadcn `Dialog` replacing the manual fixed overlay

### 5. Scan Feedback (`components/driver/scan-feedback.tsx`)

Keep full-screen overlay concept. Replace text symbols with lucide icons (100px):
- Board: `CheckCircle2` on `bg-green-600`
- Exit: `LogOut` on `bg-amber-600`
- Unauthorized: `ShieldX` on `bg-destructive`

Student name: `text-3xl font-semibold text-white`
"Tap to dismiss": `text-white/60 text-sm`
Keep fade-in animation and 2s auto-dismiss.

### 6. Complete Screen (`app/driver/run/[tripId]/complete/page.tsx`)

- `CheckCircle2` lucide icon (96px, `text-green-400`) replacing the text checkmark div
- Heading: `text-foreground text-4xl font-bold`
- Subheading: `text-muted-foreground`
- `<Card>` for summary with `<Separator />` between rows
- Done: `Button` full-width size="lg"

## Layout Wrapper

`app/driver/layout.tsx` adds `className="dark"` to its wrapper divs so all children
inherit dark mode CSS variables automatically. No per-component dark class needed.

## Logo Usage

| Component | Logo |
|-----------|------|
| Lock screen (centered) | `<Logo>` (text-logo.png, ~180px wide) |
| Pre-trip header | `<LogoIcon>` (logo.png, 32px) |
| Active run header | `<LogoIcon>` (logo.png, 32px) |

## Files Changed

| File | Change |
|------|--------|
| `app/driver/layout.tsx` | Add `className="dark"` to wrapper divs |
| `components/driver/lock-screen.tsx` | Full rewrite |
| `components/driver/pin-pad.tsx` | Button variants + dot polish |
| `components/driver/route-summary.tsx` | Card + Skeleton + Badge |
| `app/driver/pre-trip/page.tsx` | Header + button updates |
| `components/driver/active-run.tsx` | Full rewrite (progress, dialog) |
| `components/driver/student-scan-list.tsx` | Table to card list |
| `components/driver/scan-feedback.tsx` | Lucide icons |
| `app/driver/run/[tripId]/complete/page.tsx` | Full rewrite |
