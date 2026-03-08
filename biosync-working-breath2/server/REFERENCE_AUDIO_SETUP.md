# Reference Audio Setup for Abnormal Detection

The API now supports profile-based classification from your own reference WAV files.

## 1) Create folders

Create these folders (use only the ones you have):

- `server/reference/normal/`
- `server/reference/crackle/`
- `server/reference/wheeze/`
- `server/reference/both/`

## 2) Add WAV reference clips

Use 16-bit PCM WAV files.

Recommended minimum:

- `normal`: 15-30 clips
- `crackle`: 10-20 clips
- `wheeze`: 10-20 clips
- `both`: 5-15 clips

Clip quality guidance:

- 2 to 8 seconds per file
- Single breathing event per clip (or tightly cropped cycle)
- Similar recording environment to your app (phone mic distance/background)
- Avoid clipping/distortion

## 3) Build the profile

From repo root, run:

```powershell
python server/lung_inference.py --build-profile server/data/lung_reference_profile.json server/reference/normal server/reference/crackle server/reference/wheeze server/reference/both
```

If you only have some classes, you can omit missing class folders.
You must include `normal` and at least one abnormal class.

## 4) Tell the server where the profile is

Set env var in `.env` (or server env):

```env
LUNG_REFERENCE_PROFILE=server/data/lung_reference_profile.json
```

If this file exists at `server/data/lung_reference_profile.json`, the API will also auto-load it by default.

## 5) Rebuild profile when dataset changes

Whenever you add/remove reference WAV files, run the build command again.

## Notes

- This is still not a medical-grade model.
- For stronger generalization, train a supervised model checkpoint on ICBHI or your labeled data and replace profile inference with model inference.
