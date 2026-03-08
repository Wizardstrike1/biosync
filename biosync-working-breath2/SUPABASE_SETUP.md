# Supabase Setup For BioSync Results

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/results_schema.sql`.
3. In Clerk Dashboard, create a JWT template named `supabase`.
4. Configure that template/audience to match your Supabase project JWT settings so `sub` is the Clerk user ID.
5. In Supabase Auth settings, enable third-party JWT verification for Clerk tokens.
6. Add env vars to your `.env` file:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

7. Restart the Vite dev server after adding env values.

8. In Vercel project settings, add the same four env vars for Production/Preview deployments.

Notes:
- The app keeps local-storage fallback if Supabase is not configured or temporarily unavailable.
- Results are written with `user_id = Clerk user.id`.
