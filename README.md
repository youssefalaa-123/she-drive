# She Drive 🚗💗

**Women Driving Women** — a ride-hailing app exclusively for women, built with Expo (React Native) and Firebase.

---

## Overview

She Drive connects female passengers with female drivers in Cairo, Egypt. It is designed with safety, transparency, and ease of use as core values.

- Passengers book rides, track their driver in real time, and pay via cash, card, or wallet.
- Drivers go online, accept ride requests, and earn through a commission-based model.
- All accounts are for women only; driver accounts require manual admin approval.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 54 (React Native) |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Storage | Firebase Storage (via PhotoPicker) |
| Maps | Leaflet + OpenStreetMap (Carto tiles) |
| Routing | OSRM public demo server |
| Geocoding | Photon by Komoot |
| Language | JavaScript (no TypeScript) |

No paid map APIs are used — the app is 100% free-tier compatible.

---

## Features

### Passenger
- Book rides with live map, pickup/destination search, and curated Cairo POIs
- Real-time driver tracking during the ride
- Five payment methods: cash, card, wallet, wallet+cash, wallet+card
- First-ride 15% discount
- Wallet top-up via saved cards
- Trip history and rating system
- Arabic / English language toggle with full RTL support
- Dark mode

### Driver
- Go online/offline toggle with live ride requests
- Accept or reject incoming rides
- Step-by-step trip flow: Accepted → Arrived → In Progress → Completed
- Earnings dashboard with commission breakdown (15% per trip)
- Wallet balance tracking; cannot go online below −300 EGP debt limit

### Both
- Push-ready notification settings
- Profile management
- Settings screen with language, dark mode, privacy policy, and terms of service

---

## Getting Started

### Prerequisites
- Node.js (installed at `C:\Program Files\nodejs` on Windows — not on PATH by default)
- Expo Go on a physical device (for native testing)

### Run the app

```powershell
# Web (primary dev target)
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx expo start --web
```

Open [http://localhost:8081](http://localhost:8081) in Chrome.

### Install a package

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npx expo install <package-name>
```

Always use `expo install` (not `npm install`) for React Native compatibility.

---

## Project Structure

```
src/
  components/       # Shared UI components (CardInputModal, WalletTopUpModal, BadgeModal, AnimatedPressable, …)
  context/          # AuthContext, SettingsContext (theme + translations)
  firebase/         # Firebase config (auth + db exports)
  navigation/       # RootNavigator, AuthStack, PassengerNavigator, DriverNavigator
  screens/
    auth/           # Login, Register, PassengerOnboarding, DriverOnboarding, PendingApproval
    passenger/      # HomeScreen, ActiveRideScreen, TripSummaryScreen, HistoryWalletScreen, ProfileScreen
    driver/         # HomeScreen, ActiveTripScreen, EarningsScreen, ProfileScreen
    SettingsScreen.js
  translations/     # EN + AR string maps (index.js)
  utils/            # pricing.js, routing.js
  data/             # cairoPOIs.js (370+ curated Cairo locations)
assets/             # logo.jpg, icon.png, splash-icon.png
```

---

## Architecture Notes

- **Theme & translations:** All screens use `useTheme()` from `SettingsContext` — never import from `src/theme.js` directly.
- **RTL:** CSS `direction: rtl` on the root view handles web RTL; `I18nManager.forceRTL()` handles native.
- **Firestore queries:** Never combine multiple `where()` with `orderBy()` — sort client-side instead.
- **Payments:** Commission is 15%. Driver wallet is debited on cash trips and credited on card/wallet trips. A 10 EGP cancellation fee is charged to the passenger and credited to the driver when a ride is cancelled after acceptance.
- **Driver approval:** Admin must manually set `approved: true` in Firestore for driver accounts.

---

## Support

Contact: shedrive.eg.app@gmail.com
