# Delhi + Amritsar Trip Companion — v3

Mobile-first GitHub Pages PWA for the 10–14 October 2026 family trip.

## New in v3
- Explicit **Save Ticket Details** button on each booked ticket.
- Clear status such as **Saved on this device** with date/time.
- Autosave remains active while you type.
- **Save All Trip Data** button under More → Trip details.
- Global last-saved confirmation.
- Same browser storage key as v1/v2, so existing data is preserved on the same site/browser.

## New in v2
- **Today screen**: automatically previews the relevant trip day and next important step.
- **Map Help**: day-wise stops, full routes, and "Directions" buttons that open Google Maps.
- **Hindi Travel Helper**: offline phrasebook for taxi, hotel, railway, food, shopping, and help.
- **Show Large** mode: display the Hindi sentence clearly to another person.
- **Speak Hindi**: uses the phone/browser speech engine when a Hindi voice is available.
- **Trip details**: save final Delhi/Amritsar hotel addresses and driver numbers.
- **Reminders with optional date/time**.
- Existing ticket, expense, package cost, notes, backup and offline support retained.

## Existing saved data
The app intentionally keeps the same browser storage key as v1 (`delhi_amritsar_trip_v1`).
If you update the same GitHub Pages site and use the same browser, your previously entered ticket/expense data should continue to load.

Still, **export a backup before replacing the old app**.

## Publish / update on GitHub Pages
If this is a new repo:
1. Create a GitHub repository, for example `delhi-amritsar-trip`.
2. Upload all files from this folder to the repository root.
3. Go to **Settings → Pages**.
4. Select **Deploy from a branch** → `main` → `/root`.
5. Save.

If you already published v1:
1. Open the existing repository.
2. Replace `index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg`, and `README.md` with these v2 files.
3. Keep `.nojekyll`.
4. Commit the changes.
5. GitHub Pages will redeploy automatically.
6. If your phone still shows the older app, close/reopen it or refresh once; v2 uses a new service-worker cache.

## Install on phone
- Android/Chrome: open the GitHub Pages URL → menu → **Install app / Add to Home screen**.
- iPhone/Safari: open URL → Share → **Add to Home Screen**.

## Storage & privacy
- Ticket details, PNRs, expenses, notes, hotel addresses, and reminders are stored in the browser's `localStorage`.
- They are **not synced to a server**.
- They will not automatically appear on another phone/browser.
- Do not store Aadhaar/PAN numbers, payment card details, CVV, passwords, or OTPs.
- Export a backup before the trip and keep that JSON file private.

## Maps
Map buttons open Google Maps using standard Google Maps URLs. No paid Maps API key is required.
For best directions, enter your exact final hotel addresses under **More → Trip details**.

## Offline
The app shell, itinerary, Hindi helper, expenses, reminders and notes work offline after the first load.
Google Maps itself requires the Maps app / network data unless you separately download offline maps in Google Maps.
