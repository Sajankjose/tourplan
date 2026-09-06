# Delhi + Amritsar Trip Companion — v4 Cloud Sync

This version adds multi-device Supabase cloud sync while retaining the existing mobile PWA, itinerary, tickets, ticket expenses, maps, Hindi helper, reminders, notes, and local/offline storage.

## Setup
1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase-schema.sql`.
3. In Supabase Authentication, enable Email sign-in.
4. Under Authentication → URL Configuration, set your GitHub Pages URL as the Site URL and add it to Redirect URLs.
5. Open `supabase-config.js` and paste your Supabase Project URL and anon/public key.
6. Upload all v4 files to the same GitHub Pages repository.

Example GitHub Pages URL:
`https://YOUR-USERNAME.github.io/delhi-amritsar-trip/`

## Important security
The anon/public key is safe in a browser app only because Row Level Security is enabled by `supabase-schema.sql`.

Never put the `service_role` key in GitHub or in this frontend.

Do not store Aadhaar/PAN numbers, passwords, OTPs, card numbers, CVV, or banking credentials.

## Existing v3 data
v4 keeps the same local storage key (`delhi_amritsar_trip_v1`), so data already entered on the same browser should remain.

Export a backup before updating the site anyway.

## First sync
Open More → Cloud sync → enter your email → open the sign-in link from Supabase.

If no cloud copy exists, the app uploads your current local trip.

If both cloud and device contain data, you can choose:
- Use cloud copy
- Upload this device

After that, changes autosync after local saves.

## Second phone / laptop
Open the same GitHub Pages URL and sign in with the same email. Use the cloud copy to get the same trip data.

## Current v4 scope
For reliable migration from v3, the complete app state is stored in Supabase as JSONB (`trip_state`). `trips` and `trip_members` are already included for the next step: family sharing with owner/editor/viewer access.
