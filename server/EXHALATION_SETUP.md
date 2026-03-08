# Exhalation Backend Resources

The modern respiratory page (`src/pages/RespiratoryTest.tsx`) posts audio to `/api/lung/analyze`.

## Required resources (restored from old app)

The local API uses these files from `biosync-working-breath2/server/`:
- `lung_inference.py`
- `lung_model.pth`

## Run locally

1. Start frontend:
- `npm run dev`

2. Start respiratory API:
- `npm run dev:api`

## Python model mode (full old behavior)

To run the trained CNN inference, you need Python + dependencies available to the API process.

Suggested dependencies (from script imports):
- `numpy`
- `librosa`
- `torch`

Example install after Python is installed:
- `python -m pip install numpy librosa torch`

If Python executable path is custom, set in `.env`:
- `PYTHON_EXECUTABLE=C:\path\to\python.exe`

## Fallback mode

If Python/model runtime is unavailable, the API returns a WAV-feature fallback analysis (`source: node-wav-fallback`) so the exhalation flow still completes instead of failing the upload request.
