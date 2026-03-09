# BioSync

BioSync is a Vite + React app for hearing, respiratory, eye, and motor tests.

## Auth and Data Storage

The app now uses Supabase Auth (email/password) and stores test results in Supabase (`biosync_results`).

See setup steps in `SUPABASE_SETUP.md`.

## Run

1. Add environment variables in `.env` (see `.env.example`).
2. Install dependencies:

```bash
npm install
```

3. Start frontend:

```bash
npm run dev
```

4. Optional local API server (respiratory analysis):

```bash
npm run dev:api
```
