import json
import os
import sys
from pathlib import Path

import librosa
import numpy as np
import torch
import torch.nn as nn


SAMPLE_RATE = 16000
N_MELS = 128
TARGET_LEN = 200
DISEASE_CLASSES = ["Healthy", "Asthma", "COPD", "Bronchitis", "Pneumonia", "URTI"]
MODEL_PATH = Path(__file__).resolve().parent / "lung_model.pth"


class LungCNN(nn.Module):
    def __init__(self, input_shape, num_classes):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, 16, 3),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(16, 32, 3),
            nn.ReLU(),
            nn.MaxPool2d(2),
        )
        self._to_linear = self._get_conv_output(input_shape)
        self.fc = nn.Sequential(
            nn.Linear(self._to_linear, 128),
            nn.ReLU(),
            nn.Linear(128, num_classes),
        )

    def _get_conv_output(self, shape):
        x = torch.zeros(1, *shape)
        x = self.conv(x)
        return x.numel()

    def forward(self, x):
        x = self.conv(x)
        x = x.view(x.size(0), -1)
        x = self.fc(x)
        return x


_MODEL = None


def load_audio(file_path: Path):
    samples, sample_rate = librosa.load(str(file_path), sr=SAMPLE_RATE, mono=True)
    duration = float(len(samples) / sample_rate) if sample_rate else 0.0
    return samples, sample_rate, duration


def compute_rms(samples):
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(samples))))


def compute_zero_crossing_rate(samples):
    if samples.size < 2:
        return 0.0
    return float(librosa.feature.zero_crossing_rate(samples, frame_length=2048, hop_length=512).mean())


def extract_features(file_path: Path, target_len=TARGET_LEN):
    y, sr = librosa.load(str(file_path), sr=SAMPLE_RATE, mono=True)
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=N_MELS)
    mel_db = librosa.power_to_db(mel, ref=np.max)

    if mel_db.shape[1] < target_len:
        pad = target_len - mel_db.shape[1]
        mel_db = np.pad(mel_db, ((0, 0), (0, pad)))
    else:
        mel_db = mel_db[:, :target_len]

    return mel_db.astype(np.float32)


def get_model():
    global _MODEL

    if _MODEL is not None:
        return _MODEL

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model weights not found at {MODEL_PATH}")

    model = LungCNN((1, N_MELS, TARGET_LEN), len(DISEASE_CLASSES))
    state_dict = torch.load(MODEL_PATH, map_location="cpu")
    model.load_state_dict(state_dict)
    model.eval()
    _MODEL = model
    return _MODEL


def build_result(file_path: Path):
    samples, sample_rate, duration = load_audio(file_path)
    if duration < 1.5:
        raise ValueError("Recording too short. Please record at least 1.5 seconds.")

    model = get_model()
    features = extract_features(file_path)
    tensor = torch.tensor(features)[None, None, :, :].float()

    with torch.no_grad():
        logits = model(tensor)
        probs = torch.sigmoid(logits)[0].cpu().numpy()

    predicted_index = int(np.argmax(probs))
    predicted_label = DISEASE_CLASSES[predicted_index]
    top_probability = float(probs[predicted_index])

    p_healthy = float(probs[0])
    p_disease_max = float(np.max(probs[1:])) if len(probs) > 1 else 0.0
    denominator = p_healthy + p_disease_max
    lung_health_percent = 100.0 if denominator <= 1e-8 else 100.0 * p_healthy / denominator

    rms = compute_rms(samples) * 32768.0
    zero_crossing_rate = compute_zero_crossing_rate(samples)

    probabilities = {
        label: round(float(probability), 4)
        for label, probability in zip(DISEASE_CLASSES, probs)
    }

    return {
        "label": predicted_label,
        "confidence": round(top_probability, 3),
        "healthPercent": round(float(lung_health_percent), 2),
        "durationSeconds": round(duration, 2),
        "features": {
            "rms": round(float(rms), 2),
            "zeroCrossingRate": round(float(zero_crossing_rate), 4),
        },
        "probabilities": probabilities,
        "source": "lung-cnn-pth",
        "note": "Prediction generated from the trained lung CNN checkpoint.",
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing audio path argument."}))
        sys.exit(1)

    audio_path = Path(sys.argv[1])
    if not audio_path.exists():
        print(json.dumps({"error": "Audio file not found."}))
        sys.exit(1)

    try:
        result = build_result(audio_path)
        print(json.dumps(result))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
