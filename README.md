# Delhi + Amritsar Trip Companion — v11 Persistent Login

## Functional fix
Once a user signs in successfully on a device/browser, the app now explicitly keeps the Supabase session in `localStorage` and silently restores it on future launches.

Expected behaviour:
- first visit on a device: sign in once
- next visits on the same browser/PWA: no login prompt
- Supabase refresh token renews the session automatically
- login form appears again only after explicit Sign out, browser/site data deletion, or session invalidation

## Important iPhone note
Safari and an installed Home Screen PWA can behave as separate app/browser storage contexts in some situations. For the cleanest experience, use the installed app consistently after signing in there once.

Avoid Private Browsing for this app because private storage may be discarded by the browser.

# Delhi + Amritsar Trip Companion — v10 Atomic Sync

This version resets only the cloud-sync layer. The itinerary, tickets, expenses, maps, Hindi helper, reminders and local storage remain the same.

## Why v10
Older versions used client-side read → version-filtered update logic. v10 moves the version increment into Supabase itself.

Every local edit calls one database function:

`save_trip_sync_state(data, device_id)`

The database atomically:
- writes the latest JSON
- increments `version`
- records which device wrote it
- updates `updated_at`

## Setup

### 1. Keep a backup
On the DESKTOP that currently has the correct trip data:
More → Trip details → Export backup

### 2. Run the new SQL
Supabase → SQL Editor → New query

Run:

`supabase-v10-atomic-sync.sql`

A new table will appear:

`trip_sync_state`

Ignore the older `trip_state` and `user_trip_state` tables when testing v10.

### 3. Upload v10 files
Upload/replace all files in GitHub Pages.

This package already contains the current public Supabase Project URL + publishable key.

### 4. Initialize from desktop
Open desktop app and sign in.

It should say there is no v10 cloud copy.

Tap:

`Use this device as master`

Then check:

Supabase → Table Editor → `trip_sync_state`

You should see:
`version = 1`

### 5. Test desktop write
Edit a ticket note.

Within about 1 second:
`version = 2`

Edit another field:
`version = 3`

If version increments, the write path is proven.

### 6. Open mobile
Sign in with the same email/password.

Mobile should load the same `trip_sync_state` row.

Desktop and mobile should show the same shortened user ID in Sync diagnostics and different device IDs.

Changes are delivered using:
- Supabase Realtime first
- 4-second polling fallback
- foreground/focus refresh

## Important
For v10 testing, look only at:

`trip_sync_state`

Do not use `trip_state` or `user_trip_state` to judge whether v10 is syncing.
