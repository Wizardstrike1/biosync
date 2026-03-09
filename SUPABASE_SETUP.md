# Supabase Auth + Results Setup

This app now uses Supabase Auth (email/password) and stores test history in Supabase table `biosync_results`.

## 1) Create/Configure Supabase project

1. Create a project in Supabase.
2. In the Supabase dashboard, go to `Authentication -> Providers -> Email`.
3. Enable email/password sign-in.
4. Decide email confirmation behavior:
   - For fastest local dev: disable email confirmation temporarily.
   - For production: keep confirmation enabled and configure email templates + SMTP.

## 2) Create table + RLS

1. Open `SQL Editor` in Supabase.
2. Run the SQL in `supabase/results_schema.sql`.
3. Verify table exists: `public.biosync_results`.
4. Verify RLS is enabled and policies were created.

## 3) Configure environment variables

Create/update `.env` in the project root with:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_EYE_TRACKER_WS_URL=ws://localhost:8765
AUTH_PORT=4000
PYTHON_EXECUTABLE=python
```

Then restart the frontend dev server.

## 4) Install updated dependencies

After removing Clerk, reinstall packages:

```
npm install
```

## 5) Migration notes

- Existing localStorage results remain in browser and are merged into remote history once a user signs in.
- Existing Clerk accounts are not automatically migrated to Supabase users.
- If you need account migration, export emails from Clerk and import/create users in Supabase Auth.

## 6) Verification checklist

1. Sign up a new account from `/auth?mode=signup`.
2. Complete 1-2 tests.
3. Open Supabase Table Editor and verify rows are inserted with your `auth.users.id`.
4. Log in on a second device/browser with the same account.
5. Confirm `Results` and `Results History` graphs show the same data.
