# Delhi + Amritsar Trip Companion — v9 Stable Sync

## Why v9 exists

The old cloud model looked up a `trip_state` row through a cached `trip_id`.
In testing, Supabase contained a `trip_state` row while another device reported that no row existed.
That means the devices were not consistently resolving the same trip record.

v9 removes that indirection.

## New sync model

`user_trip_state.user_id` is the primary key.

Same Supabase login = same `auth.users.id` = same cloud row.

There is no cached trip ID involved.

v9 also adds:
- Supabase Realtime cross-device updates
- 8-second polling fallback
- sync on window focus / app foreground
- optimistic version number
- device identifier for diagnostics
- stale-write protection
- automatic cloud pull after initialization

## Upgrade steps

### 1. Run the new SQL migration

Supabase → SQL Editor → New query

Paste and run:

`supabase-v9-migration.sql`

You should then see a new table:

`user_trip_state`

Do not delete the old `trips`, `trip_members`, or `trip_state` tables yet. v9 simply stops depending on them.

### 2. Keep your Supabase config

Copy your working Project URL and publishable key into the v9 `supabase-config.js`.

### 3. Upload v9 to GitHub Pages

Replace the current app files with v9.

### 4. IMPORTANT — initialize from the correct device

Open the DESKTOP that currently contains the correct ticket information.

Sign in.

The app should say:

`Set up cloud copy`

Tap:

`Use this device as master`

Do this only once.

This creates the new `user_trip_state` row from the desktop's current local data.

### 5. Mobile

Open the app on mobile and sign in with the same email/password.

Do NOT initialize from mobile.

The app should automatically load the cloud copy created by desktop.

## Test

Desktop:
1. Edit a ticket note or amount.
2. Save / wait ~1 second.
3. Supabase → Table Editor → `user_trip_state`.
4. `version` should increase: 1 → 2 → 3...
5. `updated_at` should change.

Mobile:
- the change should arrive via Realtime, normally within a few seconds
- if Realtime is unavailable, polling checks every 8 seconds
- bringing the app back to the foreground also checks immediately

Then edit something on mobile and verify desktop receives it.

## Supabase diagnostics

The app has:
More → Cloud sync → Sync diagnostics

It shows shortened:
- device id
- user id
- cloud version
- connection/check status

Both devices MUST show the same shortened user id.
Their device ids should be different.
Their cloud version should converge to the same number.

## Old data

The old `trip_state` table can remain for now as a backup.
Once v9 has been tested successfully on both devices, it can be removed in a later cleanup.

