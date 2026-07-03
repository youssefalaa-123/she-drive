# Graph Report - .  (2026-07-03)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 200 nodes · 391 edges · 11 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]

## God Nodes (most connected - your core abstractions)
1. `colors` - 27 edges
2. `useAuth()` - 17 edges
3. `shadow` - 16 edges
4. `db` - 15 edges
5. `expo` - 12 edges
6. `auth` - 8 edges
7. `CardInputModal()` - 6 edges
8. `HomeScreen()` - 6 edges
9. `adaptiveIcon` - 5 edges
10. `scripts` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Navigator()` --calls--> `useAuth()`  [EXTRACTED]
  src/navigation/RootNavigator.js → src/context/AuthContext.js
- `DriverHomeScreen()` --calls--> `useAuth()`  [EXTRACTED]
  src/screens/driver/HomeScreen.js → src/context/AuthContext.js
- `DriverProfileScreen()` --calls--> `useAuth()`  [EXTRACTED]
  src/screens/driver/ProfileScreen.js → src/context/AuthContext.js
- `HomeScreen()` --calls--> `useAuth()`  [EXTRACTED]
  src/screens/passenger/HomeScreen.js → src/context/AuthContext.js
- `TripSummaryScreen()` --calls--> `useAuth()`  [EXTRACTED]
  src/screens/passenger/TripSummaryScreen.js → src/context/AuthContext.js

## Import Cycles
- None detected.

## Communities (11 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (21): LeafletMap, PhotoPicker(), styles, Stack, DriverOnboarding(), styles, LoginScreen(), styles (+13 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (27): dependencies, expo, expo-asset, expo-av, expo-image-picker, expo-location, expo-status-bar, firebase (+19 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (13): App(), ErrorBoundary, styles, AuthContext, AuthProvider(), auth, firebaseConfig, AuthStack() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.15
Nodes (14): PRESETS, styles, WalletTopUpModal(), useAuth(), db, PassengerNavigator(), Stack, Tab (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (19): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, expo, android, icon (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (12): CardInputModal(), cardPreviewNumber(), detectCardType(), s, LocationSearch(), styles, HomeScreen(), PAYMENT_OPTIONS (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.16
Nodes (10): BadgeModal(), PARTICLES, styles, RatingStars(), styles, DriverProfileScreen(), styles, paymentLabel() (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.16
Nodes (7): LeafletMap, EGYPT_BBOX, MAP_DEFAULTS, getAutocompleteSuggestions(), getDrivingRoute(), getPlaceDetails(), loadGoogleMaps()

### Community 8 - "Community 8"
Cohesion: 0.21
Nodes (8): DriverNavigator(), Stack, Tab, ActiveTripScreen(), haversineKm(), styles, DriverHomeScreen(), splitFare()

### Community 9 - "Community 9"
Cohesion: 0.31
Nodes (5): styles, POIS, searchPOIs(), getAutocompleteSuggestions(), getDrivingRoute()

## Knowledge Gaps
- **78 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+73 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `colors` connect `Community 0` to `Community 2`, `Community 3`, `Community 5`, `Community 6`, `Community 8`, `Community 9`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Community 3` to `Community 0`, `Community 2`, `Community 5`, `Community 6`, `Community 8`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `shadow` connect `Community 0` to `Community 8`, `Community 3`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _78 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11092436974789915 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.11857707509881422 - nodes in this community are weakly interconnected._