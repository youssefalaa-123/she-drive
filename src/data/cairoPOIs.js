// Curated Cairo POIs — always accurate, searched first before Photon
// Add any place the app users commonly search for

const POIS = [
  // ── Malls ────────────────────────────────────────────────────────────────
  { name: 'Cairo Festival City Mall',    address: 'New Cairo, Cairo',         lat: 30.0131, lng: 31.4004 },
  { name: 'City Stars Mall',             address: 'Nasr City, Cairo',         lat: 30.0686, lng: 31.3419 },
  { name: 'City Center Almaza',          address: 'Heliopolis, Cairo',        lat: 30.1004, lng: 31.3577 },
  { name: 'Mall of Egypt',               address: '6th of October City',      lat: 29.9788, lng: 30.9316 },
  { name: 'Mall of Arabia',              address: '6th of October City',      lat: 30.0006, lng: 30.9512 },
  { name: 'Point 90 Mall',              address: 'New Cairo, Cairo',         lat: 30.0201, lng: 31.4629 },
  { name: 'Carrefour Maadi',            address: 'Maadi, Cairo',             lat: 29.9608, lng: 31.2725 },
  { name: 'Genena Mall',                address: 'Nasr City, Cairo',         lat: 30.0573, lng: 31.3293 },
  { name: 'Arkadia Mall',               address: 'Corniche El Nil, Cairo',   lat: 30.0721, lng: 31.2366 },
  { name: 'Dandy Mega Mall',            address: '6th of October City',      lat: 30.0218, lng: 30.9556 },
  { name: 'Cairo Gate Mall',            address: 'Sheikh Zayed, Cairo',      lat: 30.0447, lng: 30.9776 },
  { name: 'Galleria 40 Mall',           address: 'New Cairo, Cairo',         lat: 30.0143, lng: 31.4580 },
  { name: 'Waterway Mall',              address: 'New Cairo, Cairo',         lat: 30.0312, lng: 31.4671 },

  // ── Clubs & Sports ───────────────────────────────────────────────────────
  { name: 'Madinaty Club',              address: 'Madinaty, New Cairo',      lat: 30.1044, lng: 31.9086 },
  { name: 'Gezira Sporting Club',       address: 'Zamalek, Cairo',           lat: 30.0618, lng: 31.2207 },
  { name: 'Shooting Club',             address: 'Dokki, Giza',              lat: 30.0473, lng: 31.2084 },
  { name: 'Nadi El Shams',             address: 'Heliopolis, Cairo',        lat: 30.0934, lng: 31.3342 },
  { name: 'Al Ahly Club',              address: 'Nasr City, Cairo',         lat: 30.0568, lng: 31.3312 },
  { name: 'Wadi Degla Club',           address: 'Maadi, Cairo',             lat: 29.9378, lng: 31.2955 },
  { name: 'Platinum Club New Cairo',   address: 'New Cairo, Cairo',         lat: 30.0189, lng: 31.4556 },
  { name: 'Smash Club',                address: 'New Cairo, Cairo',         lat: 30.0110, lng: 31.4341 },

  // ── Airports ─────────────────────────────────────────────────────────────
  { name: 'Cairo International Airport', address: 'Heliopolis, Cairo',      lat: 30.1219, lng: 31.4056 },

  // ── Landmarks ────────────────────────────────────────────────────────────
  { name: 'Cairo Tower',               address: 'Zamalek, Cairo',           lat: 30.0474, lng: 31.2218 },
  { name: 'Egyptian Museum',           address: 'Tahrir Square, Cairo',     lat: 30.0479, lng: 31.2336 },
  { name: 'Cairo Citadel',             address: 'Salah Salem, Cairo',       lat: 30.0287, lng: 31.2599 },
  { name: 'Al-Azhar Park',             address: 'Al Darasa, Cairo',         lat: 30.0369, lng: 31.2654 },
  { name: 'Tahrir Square',             address: 'Downtown Cairo',           lat: 30.0444, lng: 31.2357 },
  { name: 'Khan El Khalili',           address: 'Islamic Cairo',            lat: 30.0479, lng: 31.2626 },
  { name: 'Giza Pyramids',             address: 'Giza, Cairo',              lat: 29.9773, lng: 31.1325 },
  { name: 'Sphinx',                    address: 'Giza, Cairo',              lat: 29.9753, lng: 31.1376 },

  // ── Hospitals ────────────────────────────────────────────────────────────
  { name: 'Dar El Fouad Hospital',     address: '6th of October City',      lat: 29.9868, lng: 30.9337 },
  { name: 'Cleopatra Hospital',        address: 'Heliopolis, Cairo',        lat: 30.0921, lng: 31.3298 },
  { name: 'El Demerdash Hospital',     address: 'Abbassia, Cairo',          lat: 30.0672, lng: 31.2858 },
  { name: 'As-Salam International Hospital', address: 'Maadi, Cairo',      lat: 29.9670, lng: 31.2678 },
  { name: 'Saudi German Hospital Cairo', address: 'Heliopolis, Cairo',      lat: 30.1017, lng: 31.3457 },
  { name: 'Ain Shams University Hospital', address: 'Abbassia, Cairo',     lat: 30.0734, lng: 31.2819 },

  // ── Universities ─────────────────────────────────────────────────────────
  { name: 'Cairo University',          address: 'Giza',                     lat: 30.0264, lng: 31.2114 },
  { name: 'Ain Shams University',      address: 'Abbassia, Cairo',          lat: 30.0731, lng: 31.2778 },
  { name: 'AUC New Cairo',             address: 'New Cairo',                lat: 29.9773, lng: 31.4990 },
  { name: 'Heliopolis University',     address: 'New Cairo',                lat: 30.1276, lng: 31.6228 },
  { name: 'German University Cairo',   address: 'New Cairo',                lat: 29.9765, lng: 31.4979 },
  { name: 'Future University Egypt',   address: 'New Cairo',                lat: 30.0042, lng: 31.4365 },

  // ── Hotels ───────────────────────────────────────────────────────────────
  { name: 'Four Seasons Hotel Cairo',  address: 'First Residence, Giza',    lat: 30.0574, lng: 31.2186 },
  { name: 'Kempinski Nile Hotel',      address: 'Garden City, Cairo',       lat: 30.0385, lng: 31.2296 },
  { name: 'Marriott Mena House',       address: 'Giza Pyramids',            lat: 29.9845, lng: 31.1333 },
  { name: 'Conrad Cairo',              address: 'Corniche El Nil, Cairo',   lat: 30.0561, lng: 31.2306 },
  { name: 'Hilton Cairo Heliopolis',   address: 'Heliopolis, Cairo',        lat: 30.1025, lng: 31.3626 },

  // ── McDonald's ───────────────────────────────────────────────────────────
  { name: "McDonald's – Maadi",            address: 'Maadi, Cairo',             lat: 29.9581, lng: 31.2620 },
  { name: "McDonald's – Zamalek",          address: 'Zamalek, Cairo',           lat: 30.0636, lng: 31.2202 },
  { name: "McDonald's – Heliopolis",       address: 'Heliopolis, Cairo',        lat: 30.0925, lng: 31.3228 },
  { name: "McDonald's – Nasr City",        address: 'Nasr City, Cairo',         lat: 30.0649, lng: 31.3280 },
  { name: "McDonald's – Mohandessin",      address: 'Mohandessin, Giza',        lat: 30.0576, lng: 31.2009 },
  { name: "McDonald's – New Cairo",        address: 'New Cairo, Cairo',         lat: 30.0188, lng: 31.4601 },
  { name: "McDonald's – 6th of October",   address: '6th of October City',      lat: 30.0003, lng: 30.9518 },
  { name: "McDonald's – Downtown",         address: 'Downtown Cairo',           lat: 30.0448, lng: 31.2347 },
  { name: "McDonald's – City Stars",       address: 'Nasr City, Cairo',         lat: 30.0683, lng: 31.3415 },
  { name: "McDonald's – Sheikh Zayed",     address: 'Sheikh Zayed, Giza',       lat: 30.0441, lng: 30.9590 },
  { name: "McDonald's – Rehab",            address: 'Rehab City, New Cairo',    lat: 30.0574, lng: 31.4932 },

  // ── KFC ──────────────────────────────────────────────────────────────────
  { name: 'KFC – Maadi',                   address: 'Maadi, Cairo',             lat: 29.9597, lng: 31.2632 },
  { name: 'KFC – Zamalek',                 address: 'Zamalek, Cairo',           lat: 30.0642, lng: 31.2207 },
  { name: 'KFC – Heliopolis',              address: 'Heliopolis, Cairo',        lat: 30.0917, lng: 31.3240 },
  { name: 'KFC – Nasr City',               address: 'Nasr City, Cairo',         lat: 30.0638, lng: 31.3269 },
  { name: 'KFC – Mohandessin',             address: 'Mohandessin, Giza',        lat: 30.0563, lng: 31.2014 },
  { name: 'KFC – New Cairo',               address: 'New Cairo, Cairo',         lat: 30.0182, lng: 31.4596 },
  { name: 'KFC – 6th of October',          address: '6th of October City',      lat: 29.9997, lng: 30.9522 },
  { name: 'KFC – City Stars',              address: 'Nasr City, Cairo',         lat: 30.0681, lng: 31.3416 },
  { name: 'KFC – Sheikh Zayed',            address: 'Sheikh Zayed, Giza',       lat: 30.0444, lng: 30.9586 },
  { name: 'KFC – Downtown',                address: 'Downtown Cairo',           lat: 30.0442, lng: 31.2350 },

  // ── Primos ───────────────────────────────────────────────────────────────
  { name: 'Primos – Maadi',                address: 'Maadi, Cairo',             lat: 29.9605, lng: 31.2642 },
  { name: 'Primos – Zamalek',              address: 'Zamalek, Cairo',           lat: 30.0649, lng: 31.2213 },
  { name: 'Primos – Heliopolis',           address: 'Heliopolis, Cairo',        lat: 30.0912, lng: 31.3246 },
  { name: 'Primos – Nasr City',            address: 'Nasr City, Cairo',         lat: 30.0621, lng: 31.3261 },
  { name: 'Primos – Mohandessin',          address: 'Mohandessin, Giza',        lat: 30.0570, lng: 31.2020 },
  { name: 'Primos – New Cairo',            address: 'New Cairo, Cairo',         lat: 30.0165, lng: 31.4579 },
  { name: 'Primos – Rehab',                address: 'Rehab City, New Cairo',    lat: 30.0580, lng: 31.4927 },

  // ── Pizza Hut ────────────────────────────────────────────────────────────
  { name: 'Pizza Hut – Maadi',             address: 'Maadi, Cairo',             lat: 29.9589, lng: 31.2655 },
  { name: 'Pizza Hut – Heliopolis',        address: 'Heliopolis, Cairo',        lat: 30.0908, lng: 31.3233 },
  { name: 'Pizza Hut – Nasr City',         address: 'Nasr City, Cairo',         lat: 30.0627, lng: 31.3273 },
  { name: 'Pizza Hut – New Cairo',         address: 'New Cairo, Cairo',         lat: 30.0177, lng: 31.4587 },
  { name: 'Pizza Hut – Mohandessin',       address: 'Mohandessin, Giza',        lat: 30.0558, lng: 31.2017 },
  { name: 'Pizza Hut – 6th of October',    address: '6th of October City',      lat: 30.0007, lng: 30.9520 },
  { name: 'Pizza Hut – City Stars',        address: 'Nasr City, Cairo',         lat: 30.0677, lng: 31.3413 },

  // ── Burger King ──────────────────────────────────────────────────────────
  { name: 'Burger King – Maadi',           address: 'Maadi, Cairo',             lat: 29.9594, lng: 31.2647 },
  { name: 'Burger King – Nasr City',       address: 'Nasr City, Cairo',         lat: 30.0641, lng: 31.3277 },
  { name: 'Burger King – New Cairo',       address: 'New Cairo, Cairo',         lat: 30.0192, lng: 31.4608 },
  { name: 'Burger King – Heliopolis',      address: 'Heliopolis, Cairo',        lat: 30.0920, lng: 31.3249 },
  { name: 'Burger King – 6th of October',  address: '6th of October City',      lat: 30.0010, lng: 30.9525 },
  { name: 'Burger King – City Stars',      address: 'Nasr City, Cairo',         lat: 30.0675, lng: 31.3418 },
  { name: 'Burger King – Mohandessin',     address: 'Mohandessin, Giza',        lat: 30.0560, lng: 31.2012 },

  // ── Hardee's ─────────────────────────────────────────────────────────────
  { name: "Hardee's – Nasr City",          address: 'Nasr City, Cairo',         lat: 30.0633, lng: 31.3264 },
  { name: "Hardee's – Mohandessin",        address: 'Mohandessin, Giza',        lat: 30.0565, lng: 31.2022 },
  { name: "Hardee's – New Cairo",          address: 'New Cairo, Cairo',         lat: 30.0196, lng: 31.4612 },
  { name: "Hardee's – Heliopolis",         address: 'Heliopolis, Cairo',        lat: 30.0903, lng: 31.3238 },
  { name: "Hardee's – Maadi",              address: 'Maadi, Cairo',             lat: 29.9585, lng: 31.2637 },

  // ── Subway ───────────────────────────────────────────────────────────────
  { name: 'Subway – New Cairo',            address: 'New Cairo, Cairo',         lat: 30.0183, lng: 31.4593 },
  { name: 'Subway – Maadi',                address: 'Maadi, Cairo',             lat: 29.9592, lng: 31.2651 },
  { name: 'Subway – Nasr City',            address: 'Nasr City, Cairo',         lat: 30.0636, lng: 31.3266 },
  { name: 'Subway – Mohandessin',          address: 'Mohandessin, Giza',        lat: 30.0561, lng: 31.2018 },
  { name: 'Subway – Heliopolis',           address: 'Heliopolis, Cairo',        lat: 30.0918, lng: 31.3244 },

  // ── Domino's Pizza ───────────────────────────────────────────────────────
  { name: "Domino's – Maadi",              address: 'Maadi, Cairo',             lat: 29.9577, lng: 31.2635 },
  { name: "Domino's – Zamalek",            address: 'Zamalek, Cairo',           lat: 30.0644, lng: 31.2217 },
  { name: "Domino's – Nasr City",          address: 'Nasr City, Cairo',         lat: 30.0631, lng: 31.3272 },
  { name: "Domino's – New Cairo",          address: 'New Cairo, Cairo',         lat: 30.0175, lng: 31.4582 },
  { name: "Domino's – Heliopolis",         address: 'Heliopolis, Cairo',        lat: 30.0906, lng: 31.3251 },
  { name: "Domino's – Mohandessin",        address: 'Mohandessin, Giza',        lat: 30.0557, lng: 31.2015 },

  // ── Mo'men ───────────────────────────────────────────────────────────────
  { name: "Mo'men – Maadi",                address: 'Maadi, Cairo',             lat: 29.9602, lng: 31.2658 },
  { name: "Mo'men – Nasr City",            address: 'Nasr City, Cairo',         lat: 30.0632, lng: 31.3267 },
  { name: "Mo'men – Heliopolis",           address: 'Heliopolis, Cairo',        lat: 30.0915, lng: 31.3243 },
  { name: "Mo'men – Zamalek",              address: 'Zamalek, Cairo',           lat: 30.0640, lng: 31.2209 },
  { name: "Mo'men – Mohandessin",          address: 'Mohandessin, Giza',        lat: 30.0557, lng: 31.2022 },
  { name: "Mo'men – New Cairo",            address: 'New Cairo, Cairo',         lat: 30.0171, lng: 31.4577 },
  { name: "Mo'men – Downtown",             address: 'Downtown Cairo',           lat: 30.0451, lng: 31.2348 },

  // ── Gad Restaurant ───────────────────────────────────────────────────────
  { name: 'Gad – Heliopolis',              address: 'Heliopolis, Cairo',        lat: 30.0897, lng: 31.3225 },
  { name: 'Gad – Nasr City',               address: 'Nasr City, Cairo',         lat: 30.0619, lng: 31.3258 },
  { name: 'Gad – Mohandessin',             address: 'Mohandessin, Giza',        lat: 30.0562, lng: 31.2026 },
  { name: 'Gad – Maadi',                   address: 'Maadi, Cairo',             lat: 29.9586, lng: 31.2638 },
  { name: 'Gad – Downtown',                address: 'Downtown Cairo',           lat: 30.0455, lng: 31.2345 },
  { name: 'Gad – Zamalek',                 address: 'Zamalek, Cairo',           lat: 30.0651, lng: 31.2214 },

  // ── Starbucks ────────────────────────────────────────────────────────────
  { name: 'Starbucks – Zamalek',           address: 'Zamalek, Cairo',           lat: 30.0641, lng: 31.2205 },
  { name: 'Starbucks – City Stars',        address: 'Nasr City, Cairo',         lat: 30.0680, lng: 31.3419 },
  { name: 'Starbucks – New Cairo',         address: 'New Cairo, Cairo',         lat: 30.0186, lng: 31.4597 },
  { name: 'Starbucks – Maadi',             address: 'Maadi, Cairo',             lat: 29.9591, lng: 31.2648 },
  { name: 'Starbucks – Mohandessin',       address: 'Mohandessin, Giza',        lat: 30.0573, lng: 31.2006 },
  { name: 'Starbucks – Heliopolis',        address: 'Heliopolis, Cairo',        lat: 30.0924, lng: 31.3245 },
  { name: 'Starbucks – Sheikh Zayed',      address: 'Sheikh Zayed, Giza',       lat: 30.0441, lng: 30.9588 },
  { name: 'Starbucks – Rehab',             address: 'Rehab City, New Cairo',    lat: 30.0575, lng: 31.4938 },

  // ── Cilantro ─────────────────────────────────────────────────────────────
  { name: 'Cilantro – Zamalek',            address: 'Zamalek, Cairo',           lat: 30.0646, lng: 31.2208 },
  { name: 'Cilantro – Maadi',              address: 'Maadi, Cairo',             lat: 29.9587, lng: 31.2641 },
  { name: 'Cilantro – Heliopolis',         address: 'Heliopolis, Cairo',        lat: 30.0908, lng: 31.3240 },
  { name: 'Cilantro – New Cairo',          address: 'New Cairo, Cairo',         lat: 30.0179, lng: 31.4588 },
  { name: 'Cilantro – Mohandessin',        address: 'Mohandessin, Giza',        lat: 30.0564, lng: 31.2011 },
  { name: 'Cilantro – Nasr City',          address: 'Nasr City, Cairo',         lat: 30.0628, lng: 31.3262 },
  { name: 'Cilantro – Downtown',           address: 'Downtown Cairo',           lat: 30.0449, lng: 31.2354 },

  // ── Costa Coffee ─────────────────────────────────────────────────────────
  { name: 'Costa Coffee – Zamalek',        address: 'Zamalek, Cairo',           lat: 30.0648, lng: 31.2211 },
  { name: 'Costa Coffee – New Cairo',      address: 'New Cairo, Cairo',         lat: 30.0185, lng: 31.4594 },
  { name: 'Costa Coffee – Nasr City',      address: 'Nasr City, Cairo',         lat: 30.0635, lng: 31.3270 },
  { name: 'Costa Coffee – Maadi',          address: 'Maadi, Cairo',             lat: 29.9593, lng: 31.2653 },
  { name: 'Costa Coffee – Heliopolis',     address: 'Heliopolis, Cairo',        lat: 30.0921, lng: 31.3247 },

  // ── Paul Bakery & Café ───────────────────────────────────────────────────
  { name: 'Paul – City Stars',             address: 'Nasr City, Cairo',         lat: 30.0684, lng: 31.3421 },
  { name: 'Paul – New Cairo',              address: 'New Cairo, Cairo',         lat: 30.0181, lng: 31.4574 },
  { name: 'Paul – Heliopolis',             address: 'Heliopolis, Cairo',        lat: 30.0920, lng: 31.3248 },
  { name: 'Paul – Maadi',                  address: 'Maadi, Cairo',             lat: 29.9588, lng: 31.2644 },

  // ── Chili's ──────────────────────────────────────────────────────────────
  { name: "Chili's – City Stars",          address: 'Nasr City, Cairo',         lat: 30.0682, lng: 31.3416 },
  { name: "Chili's – New Cairo",           address: 'New Cairo, Cairo',         lat: 30.0179, lng: 31.4599 },
  { name: "Chili's – Maadi",               address: 'Maadi, Cairo',             lat: 29.9584, lng: 31.2668 },

  // ── TGI Friday's ─────────────────────────────────────────────────────────
  { name: "TGI Friday's – City Stars",     address: 'Nasr City, Cairo',         lat: 30.0682, lng: 31.3414 },
  { name: "TGI Friday's – New Cairo",      address: 'New Cairo, Cairo',         lat: 30.0176, lng: 31.4601 },

  // ── Shake Shack ──────────────────────────────────────────────────────────
  { name: 'Shake Shack – New Cairo',       address: 'New Cairo, Cairo',         lat: 30.0183, lng: 31.4600 },
  { name: 'Shake Shack – City Stars',      address: 'Nasr City, Cairo',         lat: 30.0678, lng: 31.3420 },
  { name: 'Shake Shack – Sheikh Zayed',    address: 'Sheikh Zayed, Giza',       lat: 30.0443, lng: 30.9590 },
  { name: 'Shake Shack – Maadi',           address: 'Maadi, Cairo',             lat: 29.9583, lng: 31.2662 },

  // ── Dunkin' Donuts ───────────────────────────────────────────────────────
  { name: "Dunkin' – Heliopolis",          address: 'Heliopolis, Cairo',        lat: 30.0911, lng: 31.3235 },
  { name: "Dunkin' – Nasr City",           address: 'Nasr City, Cairo',         lat: 30.0639, lng: 31.3268 },
  { name: "Dunkin' – New Cairo",           address: 'New Cairo, Cairo',         lat: 30.0189, lng: 31.4604 },
  { name: "Dunkin' – Maadi",               address: 'Maadi, Cairo',             lat: 29.9596, lng: 31.2628 },
  { name: "Dunkin' – Mohandessin",         address: 'Mohandessin, Giza',        lat: 30.0566, lng: 31.2024 },

  // ── Johnny Rockets ───────────────────────────────────────────────────────
  { name: 'Johnny Rockets – City Stars',   address: 'Nasr City, Cairo',         lat: 30.0679, lng: 31.3417 },
  { name: 'Johnny Rockets – New Cairo',    address: 'New Cairo, Cairo',         lat: 30.0174, lng: 31.4606 },

  // ── Applebee's ───────────────────────────────────────────────────────────
  { name: "Applebee's – City Stars",       address: 'Nasr City, Cairo',         lat: 30.0676, lng: 31.3414 },
  { name: "Applebee's – New Cairo",        address: 'New Cairo, Cairo',         lat: 30.0172, lng: 31.4603 },

  // ── Popeyes ──────────────────────────────────────────────────────────────
  { name: 'Popeyes – New Cairo',           address: 'New Cairo, Cairo',         lat: 30.0191, lng: 31.4610 },
  { name: 'Popeyes – City Stars',          address: 'Nasr City, Cairo',         lat: 30.0673, lng: 31.3412 },
  { name: 'Popeyes – Heliopolis',          address: 'Heliopolis, Cairo',        lat: 30.0913, lng: 31.3253 },

  // ── Casper & Gambini's ───────────────────────────────────────────────────
  { name: "Casper & Gambini's – New Cairo",  address: 'New Cairo, Cairo',       lat: 30.0180, lng: 31.4584 },
  { name: "Casper & Gambini's – Heliopolis", address: 'Heliopolis, Cairo',      lat: 30.0916, lng: 31.3242 },
  { name: "Casper & Gambini's – City Stars", address: 'Nasr City, Cairo',       lat: 30.0677, lng: 31.3415 },
  { name: "Casper & Gambini's – Zamalek",    address: 'Zamalek, Cairo',         lat: 30.0654, lng: 31.2220 },

  // ── Zooba ────────────────────────────────────────────────────────────────
  { name: 'Zooba – Downtown',              address: 'Downtown Cairo',           lat: 30.0455, lng: 31.2352 },
  { name: 'Zooba – New Cairo',             address: 'New Cairo, Cairo',         lat: 30.0168, lng: 31.4589 },
  { name: 'Zooba – Zamalek',               address: 'Zamalek, Cairo',           lat: 30.0638, lng: 31.2215 },
  { name: 'Zooba – Maadi',                 address: 'Maadi, Cairo',             lat: 29.9598, lng: 31.2660 },

  // ── Abou El Sid ──────────────────────────────────────────────────────────
  { name: 'Abou El Sid – Zamalek',         address: 'Zamalek, Cairo',           lat: 30.0650, lng: 31.2213 },
  { name: 'Abou El Sid – New Cairo',       address: 'New Cairo, Cairo',         lat: 30.0167, lng: 31.4571 },
  { name: 'Abou El Sid – Heliopolis',      address: 'Heliopolis, Cairo',        lat: 30.0923, lng: 31.3255 },

  // ── Famous Local Spots ───────────────────────────────────────────────────
  { name: 'Koshary Abou Tarek',            address: 'Champollion St, Downtown', lat: 30.0511, lng: 31.2434 },
  { name: 'Koshary El Tahrir',             address: 'Tahrir Square, Cairo',     lat: 30.0445, lng: 31.2360 },
  { name: 'Kebdet El Prince',              address: 'Heliopolis, Cairo',        lat: 30.0905, lng: 31.3230 },
  { name: 'Sequoia',                       address: 'Abu El Feda, Zamalek',     lat: 30.0762, lng: 31.2271 },
  { name: 'Nile Kiosk',                    address: 'Corniche El Nil, Cairo',   lat: 30.0710, lng: 31.2260 },

  // ── Kazouza ──────────────────────────────────────────────────────────────
  { name: 'Kazouza – Maadi',               address: 'Maadi, Cairo',             lat: 29.9598, lng: 31.2638 },
  { name: 'Kazouza – Zamalek',             address: 'Zamalek, Cairo',           lat: 30.0652, lng: 31.2219 },
  { name: 'Kazouza – Heliopolis',          address: 'Heliopolis, Cairo',        lat: 30.0914, lng: 31.3248 },
  { name: 'Kazouza – New Cairo',           address: 'New Cairo, Cairo',         lat: 30.0169, lng: 31.4575 },

  // ── Tally's ──────────────────────────────────────────────────────────────
  { name: "Tally's – Maadi",               address: 'Maadi, Cairo',             lat: 29.9600, lng: 31.2643 },
  { name: "Tally's – Zamalek",             address: 'Zamalek, Cairo',           lat: 30.0643, lng: 31.2218 },
  { name: "Tally's – New Cairo",           address: 'New Cairo, Cairo',         lat: 30.0178, lng: 31.4593 },
  { name: "Tally's – Heliopolis",          address: 'Heliopolis, Cairo',        lat: 30.0909, lng: 31.3237 },

  // ── More Malls ───────────────────────────────────────────────────────────
  { name: 'Rehab Mall',                          address: 'Rehab City, New Cairo',       lat: 30.0585, lng: 31.4920 },
  { name: 'Rehab Mall Phase 2',                  address: 'Rehab City, New Cairo',       lat: 30.0578, lng: 31.4928 },
  { name: 'Town Center Madinaty',                address: 'Madinaty, New Cairo',         lat: 30.1040, lng: 31.9088 },
  { name: 'Open Air Mall – Madinaty',            address: 'Madinaty, New Cairo',         lat: 30.1048, lng: 31.9095 },
  { name: 'El Shrouk Mall',                      address: 'El Shrouk City',              lat: 30.1265, lng: 31.6095 },
  { name: 'Hyde Park Mall',                      address: 'New Cairo, Cairo',            lat: 30.0080, lng: 31.4708 },
  { name: 'Sun City Mall',                       address: '6th of October City',         lat: 29.9789, lng: 30.9451 },
  { name: 'Tivoli Dome Mall',                    address: 'Nasr City, Cairo',            lat: 30.0722, lng: 31.3478 },
  { name: 'IKEA – New Cairo',                    address: 'New Cairo, Cairo',            lat: 30.0090, lng: 31.4702 },
  { name: 'IKEA – 6th of October',               address: '6th of October City',         lat: 29.9782, lng: 30.9315 },
  { name: 'Stars & Bars Mall',                   address: 'New Cairo, Cairo',            lat: 30.0169, lng: 31.4595 },
  { name: 'Concord Plaza',                       address: 'Nasr City, Cairo',            lat: 30.0692, lng: 31.3398 },
  { name: 'Ramses City Mall',                    address: 'Ramses, Cairo',               lat: 30.0601, lng: 31.2498 },
  { name: 'Al Ahram Mall',                       address: 'Haram, Giza',                 lat: 29.9989, lng: 31.1518 },
  { name: 'Al Hana City Mall',                   address: 'Nasr City, Cairo',            lat: 30.0619, lng: 31.3261 },
  { name: 'Mirage City Shopping Center',         address: 'New Cairo, Cairo',            lat: 30.0352, lng: 31.4778 },
  { name: 'Downtown Katameya',                   address: 'Katameya, New Cairo',         lat: 29.9680, lng: 31.4260 },
  { name: 'El Gezira Mall',                      address: 'Agouza, Giza',               lat: 30.0619, lng: 31.2195 },
  { name: 'Wonderland Mall',                     address: 'Nasr City, Cairo',            lat: 30.0720, lng: 31.3350 },

  // ── More Clubs & Sports ──────────────────────────────────────────────────
  { name: 'Maadi Sporting Club',                 address: 'Maadi, Cairo',                lat: 29.9550, lng: 31.2540 },
  { name: 'Nadi El Sekka El Hadid (Heliopolis Club)', address: 'Heliopolis, Cairo',    lat: 30.0876, lng: 31.3214 },
  { name: 'Al Shams Club',                       address: 'Heliopolis, Cairo',           lat: 30.1010, lng: 31.3480 },
  { name: 'Arab Contractors Club',               address: 'Nasr City, Cairo',            lat: 30.0660, lng: 31.3100 },
  { name: 'Salam Club',                          address: 'Maadi, Cairo',                lat: 29.9490, lng: 31.2560 },
  { name: 'Tersana Club',                        address: 'Shubra, Cairo',               lat: 30.0860, lng: 31.2540 },
  { name: 'Rehab Club',                          address: 'Rehab City, New Cairo',       lat: 30.0560, lng: 31.4905 },
  { name: 'Al Ahly Club – Rehab',                address: 'Rehab City, New Cairo',       lat: 30.0545, lng: 31.4915 },
  { name: 'El Shrouk Club',                      address: 'El Shrouk City',              lat: 30.1280, lng: 31.6110 },
  { name: 'Palm Hills Club',                     address: '6th of October City',         lat: 30.0248, lng: 30.9402 },
  { name: 'Golden Club',                         address: '6th of October City',         lat: 29.9998, lng: 30.9488 },
  { name: 'Mirage City Club',                    address: 'New Cairo, Cairo',            lat: 30.0358, lng: 31.4782 },
  { name: 'Katameya Dunes Club',                 address: 'Katameya, New Cairo',         lat: 29.9720, lng: 31.4380 },
  { name: 'Katameya Heights Club',               address: 'Katameya, New Cairo',         lat: 29.9718, lng: 31.4355 },
  { name: 'Ittihad Club',                        address: 'Heliopolis, Cairo',           lat: 30.0900, lng: 31.3250 },
  { name: 'Manial Sporting Club',                address: 'Manial, Cairo',               lat: 30.0236, lng: 31.2237 },
  { name: 'Olympic Club',                        address: 'Nasr City, Cairo',            lat: 30.0588, lng: 31.3155 },
  { name: 'Petroleum Club',                      address: 'Nasr City, Cairo',            lat: 30.0695, lng: 31.3310 },
  { name: 'Engineers Club – Giza',               address: 'Giza',                        lat: 30.0335, lng: 31.2100 },
  { name: 'Doctors Club',                        address: 'Maadi, Cairo',                lat: 29.9640, lng: 31.2612 },
  { name: 'Press Syndicate Club',                address: 'Downtown Cairo',              lat: 30.0520, lng: 31.2420 },
  { name: 'Dokki Club',                          address: 'Dokki, Giza',                 lat: 30.0390, lng: 31.2091 },
  { name: 'Armed Forces Club – Nasr City',       address: 'Nasr City, Cairo',            lat: 30.0530, lng: 31.3050 },

  // ── Schools ──────────────────────────────────────────────────────────────
  { name: 'Cairo American College (CAC)',        address: 'Maadi, Cairo',                lat: 29.9543, lng: 31.2627 },
  { name: 'Modern English School Cairo (MES)',   address: 'New Cairo, Cairo',            lat: 30.0041, lng: 31.4358 },
  { name: 'El Alsson School – Agouza',           address: 'Agouza, Giza',               lat: 30.0568, lng: 31.2182 },
  { name: 'El Alsson School – 6th October',      address: '6th of October City',         lat: 29.9980, lng: 30.9474 },
  { name: 'British International School Cairo',  address: 'New Cairo, Cairo',            lat: 30.0147, lng: 31.4522 },
  { name: 'The English School – Maadi',          address: 'Maadi, Cairo',                lat: 29.9562, lng: 31.2598 },
  { name: 'Lycée Français du Caire',             address: 'Dokki, Giza',                 lat: 30.0420, lng: 31.2128 },
  { name: 'Deutsche Evangelische Oberschule',    address: 'Dokki, Giza',                 lat: 30.0425, lng: 31.2135 },
  { name: 'Narmer American College',             address: 'New Cairo, Cairo',            lat: 30.0088, lng: 31.4691 },
  { name: 'Choueifat School – New Cairo',        address: 'New Cairo, Cairo',            lat: 30.0138, lng: 31.4529 },
  { name: 'Choueifat School – 6th October',      address: '6th of October City',         lat: 30.0011, lng: 30.9480 },
  { name: 'Hayah International Academy',         address: 'New Cairo, Cairo',            lat: 30.0058, lng: 31.4411 },
  { name: 'Cairo English School (CES)',          address: 'Maadi, Cairo',                lat: 29.9531, lng: 31.2613 },
  { name: 'Manaret El Maadi School',             address: 'Maadi, Cairo',                lat: 29.9580, lng: 31.2583 },
  { name: 'Future International School',         address: 'Nasr City, Cairo',            lat: 30.0610, lng: 31.3200 },
  { name: 'Green Heights School',                address: '6th of October City',         lat: 29.9975, lng: 30.9467 },
  { name: 'Oasis International School',          address: '6th of October City',         lat: 30.0015, lng: 30.9493 },
  { name: 'Cairo Modern International School',   address: 'Nasr City, Cairo',            lat: 30.0643, lng: 31.3215 },
  { name: 'New Cairo British School',            address: 'New Cairo, Cairo',            lat: 30.0121, lng: 31.4498 },
  { name: 'Manarat El Sharq School',             address: 'Heliopolis, Cairo',           lat: 30.0960, lng: 31.3270 },
  { name: 'Al-Andalus Language School – Maadi',  address: 'Maadi, Cairo',                lat: 29.9572, lng: 31.2605 },
  { name: 'Al-Andalus School – Nasr City',       address: 'Nasr City, Cairo',            lat: 30.0635, lng: 31.3240 },
  { name: 'Al-Andalus School – Rehab',           address: 'Rehab City, New Cairo',       lat: 30.0595, lng: 31.4945 },
  { name: 'Le Monde Language School',            address: 'Heliopolis, Cairo',           lat: 30.0945, lng: 31.3261 },
  { name: 'New Vision School',                   address: 'New Cairo, Cairo',            lat: 30.0098, lng: 31.4480 },
  { name: 'Brilliant International School',      address: 'Nasr City, Cairo',            lat: 30.0628, lng: 31.3188 },
  { name: 'GEMS Cairo American School',          address: 'New Cairo, Cairo',            lat: 30.0076, lng: 31.4664 },
  { name: 'Modern Academy Schools',              address: 'Maadi, Cairo',                lat: 29.9655, lng: 31.2710 },
  { name: 'Nile Language School',                address: 'Dokki, Giza',                 lat: 30.0380, lng: 31.2077 },
  { name: 'Egypt British International School (EBIS)', address: 'Madinaty, New Cairo', lat: 30.1055, lng: 31.9095 },
  { name: 'Madinaty International School',       address: 'Madinaty, New Cairo',         lat: 30.1062, lng: 31.9102 },
  { name: 'Madinaty Language School',            address: 'Madinaty, New Cairo',         lat: 30.1048, lng: 31.9100 },
  { name: 'Future School – Rehab',               address: 'Rehab City, New Cairo',       lat: 30.0595, lng: 31.4945 },
  { name: 'Rehab Language School',               address: 'Rehab City, New Cairo',       lat: 30.0570, lng: 31.4930 },
  { name: 'Rehab International School',          address: 'Rehab City, New Cairo',       lat: 30.0602, lng: 31.4952 },
  { name: 'El Shrouk Language School',           address: 'El Shrouk City',              lat: 30.1290, lng: 31.6120 },
  { name: 'El Shrouk International School',      address: 'El Shrouk City',              lat: 30.1285, lng: 31.6128 },
  { name: 'Nozha Language School',               address: 'Heliopolis, Cairo',           lat: 30.0918, lng: 31.3279 },
  { name: 'Tagamo3 Language School',             address: 'New Cairo, Cairo',            lat: 30.0152, lng: 31.4542 },

  // ── More Universities ────────────────────────────────────────────────────
  { name: 'Al-Azhar University',                 address: 'Al Darasa, Cairo',            lat: 30.0461, lng: 31.2620 },
  { name: 'British University in Egypt (BUE)',   address: 'El Shrouk City',              lat: 30.1181, lng: 31.6090 },
  { name: 'Misr International University (MIU)', address: 'Heliopolis, Cairo',           lat: 30.1037, lng: 31.3553 },
  { name: 'Nile University',                     address: 'Sheikh Zayed, Giza',          lat: 30.0561, lng: 30.9472 },
  { name: 'Modern Science & Arts Univ (MSA)',    address: '6th of October City',         lat: 29.9812, lng: 30.9358 },
  { name: 'MUST University',                     address: '6th of October City',         lat: 29.9825, lng: 30.9342 },
  { name: 'Arab Academy for Science (AAST) – Maadi', address: 'Maadi, Cairo',           lat: 29.9629, lng: 31.2715 },
  { name: 'Arab Academy for Science (AAST) – New Cairo', address: 'New Cairo, Cairo',  lat: 30.0048, lng: 31.4421 },
  { name: 'Canadian International College (CIC)', address: 'New Cairo, Cairo',          lat: 30.0035, lng: 31.4392 },
  { name: 'Zewail City of Science & Technology', address: '6th of October City',        lat: 29.9843, lng: 30.9287 },
  { name: 'October University (OUMS)',           address: '6th of October City',         lat: 29.9818, lng: 30.9362 },
  { name: 'Badr University',                     address: 'Badr City, East Cairo',       lat: 30.1237, lng: 31.7236 },
  { name: 'Sphinx University',                   address: '6th of October City',         lat: 29.9801, lng: 30.9378 },
  { name: 'Helwan University',                   address: 'Helwan, Cairo',               lat: 29.8491, lng: 31.3340 },
  { name: 'Ahram Canadian University',           address: '6th of October City',         lat: 29.9778, lng: 30.9311 },
  { name: 'Modern Academy – Maadi',              address: 'Maadi, Cairo',                lat: 29.9671, lng: 31.2720 },
  { name: 'Sadat Academy for Management Sciences', address: 'Maadi, Cairo',             lat: 29.9658, lng: 31.2701 },
  { name: 'Misr University for Science & Tech (MUST)', address: '6th of October City', lat: 29.9830, lng: 30.9350 },

  // ── More Hospitals ───────────────────────────────────────────────────────
  { name: 'Anglo American Hospital',             address: 'Zamalek, Cairo',              lat: 30.0600, lng: 31.2209 },
  { name: 'Nile Badrawi Hospital',               address: 'Maadi, Cairo',                lat: 29.9645, lng: 31.2695 },
  { name: 'Kasr El Aini Hospital',               address: 'Garden City, Cairo',          lat: 30.0340, lng: 31.2283 },
  { name: 'Maadi Military Hospital',             address: 'Maadi, Cairo',                lat: 29.9710, lng: 31.2545 },
  { name: 'El Demerdash Hospital',               address: 'Abbassia, Cairo',             lat: 30.0678, lng: 31.2864 },
  { name: 'Heliopolis Hospital',                 address: 'Heliopolis, Cairo',           lat: 30.0950, lng: 31.3280 },
  { name: 'El Mahrousa Hospital',                address: 'New Cairo, Cairo',            lat: 30.0162, lng: 31.4528 },
  { name: 'Madinaty Hospital',                   address: 'Madinaty, New Cairo',         lat: 30.1035, lng: 31.9078 },
  { name: 'Rehab Medical Center',                address: 'Rehab City, New Cairo',       lat: 30.0562, lng: 31.4948 },
  { name: 'El Shrouk Hospital',                  address: 'El Shrouk City',              lat: 30.1255, lng: 31.6085 },
  { name: 'International Medical Center (IMC)',  address: 'New Cairo, Cairo',            lat: 30.0175, lng: 31.4612 },
  { name: 'Dar El Shifa Hospital',               address: 'Heliopolis, Cairo',           lat: 30.0893, lng: 31.3201 },
  { name: 'Al Salam Hospital – Mohandessin',     address: 'Mohandessin, Giza',           lat: 30.0592, lng: 31.1992 },
  { name: 'Cairo Medical Center',                address: 'Nasr City, Cairo',            lat: 30.0648, lng: 31.3222 },
  { name: 'Misr International Hospital',        address: 'Dokki, Giza',                 lat: 30.0401, lng: 31.2102 },

  // ── Madinaty Gates & Internal Locations ──────────────────────────────────
  { name: 'Madinaty Gate 1 (Main Entrance)',     address: 'Madinaty, New Cairo',         lat: 30.0985, lng: 31.8998 },
  { name: 'Madinaty Gate 2',                     address: 'Madinaty, New Cairo',         lat: 30.1060, lng: 31.9010 },
  { name: 'Madinaty Gate 3',                     address: 'Madinaty, New Cairo',         lat: 30.1080, lng: 31.9055 },
  { name: 'Madinaty Gate 4',                     address: 'Madinaty, New Cairo',         lat: 30.1045, lng: 31.9125 },
  { name: 'Madinaty Gate 5',                     address: 'Madinaty, New Cairo',         lat: 30.1005, lng: 31.9070 },
  { name: 'Madinaty Mosque (Al Nour)',           address: 'Madinaty, New Cairo',         lat: 30.1042, lng: 31.9082 },
  { name: "McDonald's – Madinaty",               address: 'Madinaty, New Cairo',         lat: 30.1040, lng: 31.9084 },
  { name: 'KFC – Madinaty',                      address: 'Madinaty, New Cairo',         lat: 30.1042, lng: 31.9080 },
  { name: 'Starbucks – Madinaty',                address: 'Madinaty, New Cairo',         lat: 30.1038, lng: 31.9091 },
  { name: 'Costa Coffee – Madinaty',             address: 'Madinaty, New Cairo',         lat: 30.1044, lng: 31.9093 },
  { name: 'Cilantro – Madinaty',                 address: 'Madinaty, New Cairo',         lat: 30.1046, lng: 31.9089 },
  { name: "Domino's – Madinaty",                 address: 'Madinaty, New Cairo',         lat: 30.1037, lng: 31.9085 },
  { name: "Mo'men – Madinaty",                   address: 'Madinaty, New Cairo',         lat: 30.1041, lng: 31.9087 },
  { name: 'Primos – Madinaty',                   address: 'Madinaty, New Cairo',         lat: 30.1043, lng: 31.9083 },
  { name: 'Pizza Hut – Madinaty',                address: 'Madinaty, New Cairo',         lat: 30.1039, lng: 31.9090 },
  { name: 'Burger King – Madinaty',              address: 'Madinaty, New Cairo',         lat: 30.1036, lng: 31.9086 },
  { name: 'Paul – Madinaty',                     address: 'Madinaty, New Cairo',         lat: 30.1044, lng: 31.9097 },

  // ── Rehab City Gates & Internal Locations ────────────────────────────────
  { name: 'Rehab Gate 1 (Main)',                 address: 'Rehab City, New Cairo',       lat: 30.0577, lng: 31.4936 },
  { name: 'Rehab Gate 2',                        address: 'Rehab City, New Cairo',       lat: 30.0503, lng: 31.4858 },
  { name: 'Rehab Gate 3',                        address: 'Rehab City, New Cairo',       lat: 30.0540, lng: 31.4875 },
  { name: 'Rehab Gate 4',                        address: 'Rehab City, New Cairo',       lat: 30.0650, lng: 31.4970 },
  { name: 'Rehab Gate 5',                        address: 'Rehab City, New Cairo',       lat: 30.0590, lng: 31.4988 },
  { name: 'Rehab Gate 6',                        address: 'Rehab City, New Cairo',       lat: 30.0618, lng: 31.4902 },
  { name: 'Rehab Mosque',                        address: 'Rehab City, New Cairo',       lat: 30.0578, lng: 31.4918 },
  { name: 'KFC – Rehab',                         address: 'Rehab City, New Cairo',       lat: 30.0579, lng: 31.4934 },
  { name: 'Pizza Hut – Rehab',                   address: 'Rehab City, New Cairo',       lat: 30.0581, lng: 31.4922 },
  { name: 'Burger King – Rehab',                 address: 'Rehab City, New Cairo',       lat: 30.0575, lng: 31.4940 },
  { name: 'Cilantro – Rehab',                    address: 'Rehab City, New Cairo',       lat: 30.0583, lng: 31.4935 },
  { name: "Mo'men – Rehab",                      address: 'Rehab City, New Cairo',       lat: 30.0572, lng: 31.4929 },
  { name: "Domino's – Rehab",                    address: 'Rehab City, New Cairo',       lat: 30.0576, lng: 31.4942 },
  { name: 'Gad – Rehab',                         address: 'Rehab City, New Cairo',       lat: 30.0568, lng: 31.4918 },
  { name: 'Costa Coffee – Rehab',                address: 'Rehab City, New Cairo',       lat: 30.0585, lng: 31.4926 },
  { name: 'Primos – Rehab',                      address: 'Rehab City, New Cairo',       lat: 30.0571, lng: 31.4937 },
  { name: 'Subway – Rehab',                      address: 'Rehab City, New Cairo',       lat: 30.0580, lng: 31.4944 },
  { name: "Hardee's – Rehab",                    address: 'Rehab City, New Cairo',       lat: 30.0567, lng: 31.4923 },
  { name: 'Dunkin\' – Rehab',                    address: 'Rehab City, New Cairo',       lat: 30.0587, lng: 31.4931 },

  // ── El Shrouk City Gates & Internal Locations ────────────────────────────
  { name: 'El Shrouk Gate 1 (Main)',             address: 'El Shrouk City',              lat: 30.1273, lng: 31.6104 },
  { name: 'El Shrouk Gate 2',                    address: 'El Shrouk City',              lat: 30.1310, lng: 31.6088 },
  { name: 'El Shrouk Gate 3',                    address: 'El Shrouk City',              lat: 30.1245, lng: 31.6118 },
  { name: 'El Shrouk Gate 4',                    address: 'El Shrouk City',              lat: 30.1295, lng: 31.6132 },
  { name: 'El Shrouk Gate 5',                    address: 'El Shrouk City',              lat: 30.1230, lng: 31.6098 },
  { name: 'El Shrouk Club',                      address: 'El Shrouk City',              lat: 30.1280, lng: 31.6110 },
  { name: 'El Shrouk Mosque',                    address: 'El Shrouk City',              lat: 30.1270, lng: 31.6108 },
  { name: "McDonald's – El Shrouk",              address: 'El Shrouk City',              lat: 30.1270, lng: 31.6102 },
  { name: 'KFC – El Shrouk',                     address: 'El Shrouk City',              lat: 30.1268, lng: 31.6106 },
  { name: "Mo'men – El Shrouk",                  address: 'El Shrouk City',              lat: 30.1275, lng: 31.6098 },
  { name: 'Gad – El Shrouk',                     address: 'El Shrouk City',              lat: 30.1272, lng: 31.6112 },
  { name: 'Starbucks – El Shrouk',               address: 'El Shrouk City',              lat: 30.1265, lng: 31.6100 },
  { name: 'Primos – El Shrouk',                  address: 'El Shrouk City',              lat: 30.1278, lng: 31.6095 },
  { name: 'Costa Coffee – El Shrouk',            address: 'El Shrouk City',              lat: 30.1263, lng: 31.6108 },
  { name: 'Pizza Hut – El Shrouk',               address: 'El Shrouk City',              lat: 30.1276, lng: 31.6116 },
  { name: "Domino's – El Shrouk",                address: 'El Shrouk City',              lat: 30.1261, lng: 31.6095 },
  { name: 'Cilantro – El Shrouk',                address: 'El Shrouk City',              lat: 30.1267, lng: 31.6118 },
  { name: "Dunkin' – El Shrouk",                 address: 'El Shrouk City',              lat: 30.1259, lng: 31.6103 },

  // ── Popular Areas ────────────────────────────────────────────────────────
  { name: 'Maadi',                     address: 'Cairo',                    lat: 29.9601, lng: 31.2547 },
  { name: 'Zamalek',                   address: 'Cairo',                    lat: 30.0644, lng: 31.2196 },
  { name: 'Heliopolis',                address: 'Cairo',                    lat: 30.0930, lng: 31.3237 },
  { name: 'New Cairo',                 address: 'Cairo',                    lat: 30.0131, lng: 31.4598 },
  { name: 'Nasr City',                 address: 'Cairo',                    lat: 30.0626, lng: 31.3256 },
  { name: 'Mohandessin',               address: 'Giza',                     lat: 30.0561, lng: 31.1980 },
  { name: 'Dokki',                     address: 'Giza',                     lat: 30.0385, lng: 31.2095 },
  { name: 'Madinaty',                  address: 'New Cairo',                lat: 30.1044, lng: 31.9086 },
  { name: '6th of October City',       address: 'Giza',                     lat: 29.9369, lng: 30.9135 },
  { name: 'Sheikh Zayed City',         address: 'Giza',                     lat: 30.0447, lng: 30.9594 },
  { name: 'Downtown Cairo',            address: 'Cairo',                    lat: 30.0444, lng: 31.2357 },
  { name: 'Garden City',               address: 'Cairo',                    lat: 30.0396, lng: 31.2289 },
  { name: 'Rehab City',                address: 'New Cairo',                lat: 30.0577, lng: 31.4936 },
  { name: 'Katameya',                  address: 'New Cairo',                lat: 29.9706, lng: 31.4309 },
  { name: 'Tagamoa El Khames',         address: 'New Cairo',                lat: 30.0133, lng: 31.4609 },
  { name: 'Shrouk City',               address: 'East Cairo',               lat: 30.1273, lng: 31.6104 },
  { name: 'Badr City',                 address: 'East Cairo',               lat: 30.1237, lng: 31.7236 },
];

// Search curated POIs (fuzzy, case-insensitive)
export function searchPOIs(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return POIS.filter((p) =>
    p.name.toLowerCase().includes(q) ||
    p.address.toLowerCase().includes(q)
  ).slice(0, 5);
}
