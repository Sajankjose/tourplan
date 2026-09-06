# Delhi + Amritsar Trip Companion — v5 Reliable Multi-Device Sync

## What v5 fixes
v4 autosaved changes **to** Supabase, but an already-initialized second device did not automatically pull newer cloud data.

v5 adds:
- automatic cloud check on startup
- automatic cloud check when the app returns to foreground
- automatic cloud check when browser window gets focus
- cloud check every 12 seconds while the app is open
- cloud version + updated timestamp comparison
- stale-device protection before upload
- clear persistent `Synced · <time>` status
- manual `Refresh from cloud`
- manual `Upload this device` override
- same local storage key, so existing v3/v4 device data is preserved

## Update
Replace the current GitHub Pages files with all files from this v5 package.
Do **not** change `supabase-config.js` if you already entered the correct Project URL and publishable key — copy your configured values into the v5 file before upload.

The service worker cache name is new, so the new app should refresh after deployment. On iPhone, close the installed PWA/Safari tab and open it again after GitHub Pages finishes deploying.

## Test
1. On desktop, sign in and open More → Cloud sync.
2. Tap `Upload this device` once if the desktop has the data you want to keep.
3. Confirm the app shows `Synced · <time>`.
4. Change one ticket field, e.g. add `TEST123` in Notes.
5. Wait 2–3 seconds for `Synced`.
6. On mobile, sign in with the **same email**.
7. Re-open the app or tap `Refresh from cloud`.
8. The new ticket field should appear.
9. Change it on mobile; desktop should receive it on focus or within about 12 seconds.

## Supabase verification
In Supabase → Table Editor:
- `trips` should have 1 row for `delhi-amritsar-oct-2026`
- `trip_state` should have 1 row
- the `version` number should increase after each cloud save
- `updated_at` should change after each save

If `trip_state` remains empty, the problem is Supabase SQL/RLS, not the browser sync code.

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
