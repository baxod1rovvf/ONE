# Turning on sync (one time, about 5 minutes)

ONE can share a Supabase project with another site. It only adds three tables
and four functions whose names start with `one_`, and it doesn't touch
anything else in the project.

## 1. Create the tables

1. Open your project at [supabase.com](https://supabase.com/dashboard).
2. In the left menu, open **SQL Editor** → **New query**.
3. Paste the whole of [`supabase/one_sync.sql`](supabase/one_sync.sql) and press **Run**.
   You should see "Success. No rows returned". Running it again is safe.

## 2. Give ONE the project address and key

1. Open **Project Settings** → **API** (in newer dashboards: **Data API** and **API Keys**).
2. Copy the **Project URL** (looks like `https://abcd1234.supabase.co`).
3. Copy the **publishable** key (starts with `sb_publishable_`; older projects show an **anon / public** key starting with `eyJ`).
   Never use the `service_role` / secret key.
4. In `index.html`, find `SYNC_CONFIG` and fill both in:

   ```js
   const SYNC_CONFIG = {
     url: "https://abcd1234.supabase.co",
     anonKey: "eyJ..."
   };
   ```

5. Commit and push. GitHub Pages updates in a minute or two.

The anon key is meant to be public: it's the same kind of key your other site
already ships to every visitor. For ONE it can only call the four `one_*`
functions. The tables themselves are locked.

## 3. Connect your devices

1. On the device that has your data: **Settings → Connect a device**. A 6-digit code appears.
2. On the other device: **Settings → I have a code**, type the code, then **Connect**.

From then on, changes sync automatically in both directions. Each code works
once and expires after 10 minutes. After 30 wrong guesses, pairing pauses
for 15 minutes.

## How your data is protected

- Everything is encrypted on your device (AES-256-GCM) before upload. Supabase
  only stores unreadable text. The key never leaves your devices, apart from
  being passed inside the pairing code exchange, which is itself encrypted
  with the code.
- The PIN lock is per device and is not synced. If you forget it, "Forgot PIN?"
  erases ONE on that device only. Connect it again with a code to get your data back.

## Free plan note

Supabase pauses free projects after a week with no activity. Because your
other site uses the same project, it will usually stay awake. If it ever does
pause, ONE keeps working offline and syncs again once you restore the project.
