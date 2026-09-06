# Delhi + Amritsar Trip Companion — v8 Password Auth

## What changed

v8 uses **Supabase email + password authentication** with `signInWithPassword`.

There is:
- no magic-link login
- no Supabase auth email required for normal sign-in
- no Google OAuth setup
- persistent Supabase session on the device
- the same reliable multi-device sync from v5/v6
- the same local/offline storage, tickets, expenses, maps, Hindi helper, reminders and notes

## Recommended setup for this private trip app

To completely avoid Supabase email rate limits, create the user manually in Supabase.

### 1. Create the user

Open:

**Supabase → Authentication → Users → Add user**

Create a user with:
- your email
- a strong password
- mark / create the user as confirmed if Supabase offers that option

Do not rely on a confirmation email for this private app.

### 2. Sign in from the trip app

Open:

**More → Cloud sync**

Enter the same:
- email
- password

Tap **Sign in**.

The Supabase JS client persists the login session in the browser, so you do not need to log in every time unless the session is cleared or you sign out.

### 3. First device

If this device already has the correct trip data:

**More → Cloud sync → Upload this device**

Wait until it shows a cloud sync confirmation.

### 4. Second device

Open the same GitHub Pages app and sign in with the same email/password.

Then use:

**Refresh from cloud**

Your tickets, expenses, notes, reminders and other saved trip data should appear.

## Existing Supabase setup

Keep:
- `supabase-schema.sql` already run
- your existing Supabase Project URL
- your existing publishable key
- your GitHub Pages Site URL / Redirect URL

No Google provider configuration is required for v8.

## Important before upload

The included `supabase-config.js` may contain placeholders depending on the package you started from.

Make sure v8 has your real:
- Supabase Project URL
- `sb_publishable_...` key

Never put a `service_role` or secret key in GitHub.

## Security

Good to store:
- PNR
- ticket price
- flight/train details
- expenses
- trip notes
- hotel/driver details

Do not store:
- Aadhaar or PAN numbers
- OTPs
- card number / CVV
- banking passwords
- account passwords

## Multi-device sync test

1. Sign in on desktop.
2. Enter or change a ticket note.
3. Wait for cloud sync.
4. Open the app on mobile and sign in with the same credentials.
5. Tap **Refresh from cloud** if needed.
6. The desktop change should appear.
7. Change something on mobile.
8. Desktop should receive it when it regains focus or during the periodic cloud check.

# Delhi + Amritsar Trip Companion — v7 Google Login

## Why this version
Supabase's built-in email sender is rate-limited, so repeated magic-link requests can fail with `email rate limit exceeded`.

v7 makes **Google sign-in the primary option**. Email-link login remains as a fallback.

## One-time Google setup

### In Google Cloud / Google Auth Platform
Create an OAuth Client:
- Application type: Web application
- Authorized JavaScript origin: `https://YOUR-USERNAME.github.io`
- Authorized redirect URI: use the callback URL shown in Supabase under the Google provider. It normally looks like:
  `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`

Copy the Google Client ID and Client Secret.

### In Supabase
Go to:
Authentication → Sign In / Providers → Google

Enable Google, paste:
- Client ID
- Client Secret

Save.

Keep your GitHub Pages URL under:
Authentication → URL Configuration

## Deploy
Copy your already-correct Supabase Project URL and publishable key into the v7 `supabase-config.js`, then replace the current GitHub Pages files with v7.

## Login
More → Cloud sync → **Continue with Google**

Use the same Google account on desktop and mobile.

Email login remains under **Other sign-in option**, with a cooldown and a clearer rate-limit message.

# Delhi + Amritsar Trip Companion — v6 Clean UI

## UI cleanup in v6
- Removed per-ticket “Saved on this device · date/time” messages.
- Ticket save control is now a compact **Save** button.
- After tapping, the button briefly changes to **Saved** without creating extra layout/wrapping.
- Autosave and Supabase cloud sync remain unchanged.
- Global cloud sync status remains available under **More → Cloud sync**.

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
