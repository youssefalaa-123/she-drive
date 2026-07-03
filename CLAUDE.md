# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

Node.js is installed at `C:\Program Files\nodejs` but is **not** on the system PATH. Prefix every `node`/`npm`/`npx` command:

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx expo start
```

## Commands

```powershell
# Start dev server — opens at http://localhost:8081
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx expo start

# Web only
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx expo start --web

# Install a new package (always use expo install, not npm install, for RN compatibility)
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx expo install <package-name>

# Full dependency reset
Remove-Item -Recurse -Force node_modules, package-lock.json; $env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm install
```

There is no test suite. Test changes manually in the browser at `http://localhost:8081`. After every task, open Chrome there.

**SDK version:** Project uses Expo SDK 54 (downgraded from 56 to match Expo Go on the test device). Do not upgrade `expo` in `package.json`.

## Architecture

### Entry point & providers

`index.js` → `App.js` wraps the whole app in:
`SettingsProvider` → `AppShell` → `GestureHandlerRootView` (with `direction: 'rtl'|'ltr'`) → `SafeAreaProvider` → `ErrorBoundary` → `AuthProvider` → `RootNavigator`

`AppShell` is a thin wrapper that reads `useSettings()` to apply the root `direction` CSS prop (enabling web RTL) and pass `isDarkMode` to `StatusBar`.

### Authentication & routing (`src/context/AuthContext.js`, `src/navigation/`)

`AuthContext` holds `user` (Firebase Auth), `userProfile` (live Firestore document via `onSnapshot`), and `loading`. `RootNavigator` routes based on this:

- No user → `AuthStack` (Login → Register → PassengerOnboarding / DriverOnboarding)
- Driver with `approved: false` → `PendingApproval` screen
- Driver approved → `DriverNavigator` (Drive / Earnings / Profile / Settings tabs + ActiveTrip stack screen)
- Passenger → `PassengerNavigator` (Book / History / Profile / Settings tabs + ActiveRide + TripSummary stack screens)

Driver accounts require manual approval — an admin must set `approved: true` in Firestore.

### Settings & Theming (`src/context/SettingsContext.js`)

All screens and components must use `useTheme()` from `SettingsContext` — never import `colors` or `shadow` directly from `src/theme.js`.

```js
import { useTheme, useSettings } from '../../context/SettingsContext';

export default function MyScreen() {
  const { colors, shadow, t, isRTL, language, isDarkMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors, shadow), [colors, shadow]);
  // ...
}

function makeStyles(colors, shadow) {
  return StyleSheet.create({ ... });
}
```

- `useTheme()` returns `{ colors, shadow, t, isRTL, language, isDarkMode }` — colors swap between light/dark palettes automatically.
- `useSettings()` returns `{ language, isDarkMode, notifications, setLanguage, setDarkMode, setNotifications, loaded }` — use this in the SettingsScreen and App.js only.
- AsyncStorage keys: `'language'` (`'en'`|`'ar'`), `'darkMode'` (`'true'`|`'false'`), `'notifications'` (`'true'`|`'false'`).
- Sub-components that are plain functions (not React components) within a screen file receive `colors` and `styles` as props — they cannot call hooks.
- RTL for web works via `direction: isRTL ? 'rtl' : 'ltr'` on the root `GestureHandlerRootView`. For native, `I18nManager.forceRTL()` is called on language change (requires app restart).

### Translations (`src/translations/index.js`)

```js
import { t as translate } from '../translations';
// or via useTheme:
const { t } = useTheme();
t('settingsKey') // returns EN or AR string
```

All UI strings have EN and AR entries. Keys are camelCase (e.g. `signOut`, `darkMode`, `confirmRide`). Add new keys to both `en` and `ar` objects.

### Firebase (`src/firebase/config.js`)

Project: `she-drive-89e9e`. Exports `auth` and `db` only. Firebase Storage is not imported via SDK — photo URLs are uploaded through the `PhotoPicker` component and stored as plain strings in Firestore.

**Critical Firestore rule:** Never combine multiple `where()` clauses with `orderBy()` in the same query — this requires a composite index that doesn't exist. Always remove `orderBy` from Firestore queries and sort client-side instead:

```js
const q = query(collection(db, 'rides'), where('passengerId', '==', uid), where('status', '==', 'completed'));
return onSnapshot(q, (snap) => {
  const sorted = snap.docs.map(d => ({id: d.id, ...d.data()}))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
});
```

### Firestore data model

**`users/{uid}`** — both roles share this collection, distinguished by `role: 'passenger' | 'driver'`

| Field | Passenger | Driver |
|---|---|---|
| `wallet` | balance (EGP) | balance — commissions deducted here |
| `totalTrips` | trip count (badge trigger) | trip count |
| `savedCards` | `[{id, lastFour, expiry, cardType, name}]` | same |
| `isOnline` | — | boolean |
| `approved` | — | boolean (admin sets) |
| `rating` / `ratingCount` | — | running average |

**`rides/{id}`** — key fields: `passengerId`, `driverId`, `status` (`pending` → `accepted` → `in_progress` → `completed`), `paymentMethod`, `estimatedFare`, `finalFare`, `baseFare`, `cardFee`, `walletAmountPaid`, `remainingAmount`, `isFirstRide`, `createdAt`.

### Payment system (`src/utils/pricing.js`, passenger `HomeScreen.js`, `TripSummaryScreen.js`)

**Fare calculation:**
- ≤ 6 km → flat 60 EGP
- > 6 km → distance × time-based rate (9 EGP/km 10AM–1PM, 10 EGP/km 1PM–11PM, 11 EGP/km 11PM–10AM)
- First ride (totalTrips === 0): 15% discount via `applyFirstRideDiscount()`
- Card payments: +3% fee added to passenger fare

**Five payment methods and their settlement logic (executed in `TripSummaryScreen.handleSubmit`):**
- `cash` — driver wallet debited 15% commission (`increment(-adminAmount)`)
- `card` — driver wallet credited 85% (`increment(driverAmount)`); passenger charged externally (simulated)
- `wallet` — passenger wallet debited full fare; driver credited 85%
- `wallet+cash` — passenger wallet debited wallet portion; driver gets `walletPaid × 0.85 - cashPortion × 0.15`
- `wallet+card` — passenger wallet debited; driver credited 85% of total

**Driver wallet protection:** Driver cannot go online if wallet ≤ −300 EGP (`DEBT_LIMIT`). Warning banner shown when balance < 0 or < 50.

**Cancellation fee:** 10 EGP (`CANCEL_FEE`) is deducted from the passenger wallet and credited to the driver wallet when a passenger cancels after the driver has accepted. Only credited if `ride.driverId` exists.

### Map & location (`src/config/maps.js`, `src/utils/routing.js`, `src/data/cairoPOIs.js`)

100% free, no API keys required:
- **Tiles:** Carto Voyager (OpenStreetMap data, English labels)
- **Routing:** OSRM public demo server (`router.project-osrm.org`)
- **Geocoding/search:** Photon by Komoot, restricted to Cairo/Giza bounding box
- **Curated POIs:** `cairoPOIs.js` — 370+ hand-curated entries (malls, hospitals, universities, schools, clubs, restaurant chains with branches, compound gates for Madinaty/Rehab/El Shrouk). Searched first before Photon.

### Web platform files

Two components have web-specific implementations using `.web.js` suffix (Metro resolves these automatically on web):
- `LeafletMap.js` (native stub) / `LeafletMap.web.js` (full Leaflet implementation)
- `LocationSearch.js` (native) / `LocationSearch.web.js` (web autocomplete)

### Shared components

- `CardInputModal` — card entry form with live preview; saves `{id, lastFour, expiry, cardType, name}` to `userProfile.savedCards` via `arrayUnion`. CVV is never stored.
- `WalletTopUpModal` — amount presets + card selection; credits wallet via `increment()`. Charge is simulated (no real payment gateway).
- `PhotoPicker` — Firebase Storage upload, returns download URL.
- `ErrorBoundary` — catches render errors app-wide.
- `RatingStars`, `BadgeModal` — passenger trip rating and badge celebration.
- `AnimatedPressable` — drop-in replacement for `TouchableOpacity` on primary CTAs; adds a spring scale (1 → 0.96 → 1) via `Animated.spring` + `Pressable`. Use instead of `TouchableOpacity` for main action buttons.
