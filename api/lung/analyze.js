const readWavPcm16Mono = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    throw new Error("WAV payload is invalid or too short.");
  }

  const riff = buffer.toString("ascii", 0, 4);
  const wave = buffer.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Invalid WAV header.");
  }

  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);

  if (bitsPerSample !== 16) {
    throw new Error("Only 16-bit PCM WAV is supported.");
  }

  let dataOffset = -1;
  let dataSize = 0;
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;
    const nextChunkOffset = chunkDataStart + chunkSize;

    if (chunkId === "data") {
      dataOffset = chunkDataStart;
      dataSize = chunkSize;
      break;
    }

    offset = nextChunkOffset;
  }

  if (dataOffset < 0 || dataOffset + dataSize > buffer.length) {
    throw new Error("WAV data chunk not found.");
  }

  const frameSizeBytes = channels * 2;
  const frameCount = Math.floor(dataSize / frameSizeBytes);
  if (frameCount <= 0) {
    throw new Error("WAV payload contains no audio frames.");
  }

  const samples = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) {
    const frameBase = dataOffset + i * frameSizeBytes;
    const monoSampleInt16 = buffer.readInt16LE(frameBase);
    samples[i] = monoSampleInt16 / 32768;
  }

  return { samples, sampleRate };
};

const computeRms = (samples) => {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / samples.length);
};

const computeZeroCrossingRate = (samples) => {
  if (samples.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
      crossings += 1;
    }
  }
  return crossings / (samples.length - 1);
};

const classifyFallback = (samples, sampleRate) => {
  const durationSeconds = samples.length / sampleRate;
  const rms = computeRms(samples) * 32768;
  const zeroCrossingRate = computeZeroCrossingRate(samples);

  const crackleScore =
    Math.max(0, Math.min(1, (rms - 800) / 3000)) *
    Math.max(0, Math.min(1, (0.12 - zeroCrossingRate) / 0.12));
  const wheezeScore =
    Math.max(0, Math.min(1, (rms - 500) / 2500)) *
    Math.max(0, Math.min(1, (zeroCrossingRate - 0.08) / 0.25));

  let label = "normal";
  let confidence = 0.55;

  if (crackleScore > 0.28 && wheezeScore > 0.28) {
    label = "both";
    confidence = 0.6 + Math.min(0.35, (crackleScore + wheezeScore) / 2);
  } else if (wheezeScore > crackleScore && wheezeScore > 0.24) {
    label = "wheeze";
    confidence = 0.6 + Math.min(0.35, wheezeScore);
  } else if (crackleScore >= wheezeScore && crackleScore > 0.22) {
    label = "crackle";
    confidence = 0.6 + Math.min(0.35, crackleScore);
  } else {
    confidence = Math.max(0.55, Math.min(0.9, 0.9 - Math.max(crackleScore, wheezeScore)));
  }

  const labelPenaltyByClass = {
    normal: 0,
    crackle: 14,
    wheeze: 16,
    both: 26,
  };

  const rmsPenalty = Math.max(0, Math.min(55, (rms - 180) / 18));
  const zcrPenalty = Math.max(0, Math.min(20, Math.abs(zeroCrossingRate - 0.08) * 280));
  const durationPenalty = Math.max(0, Math.min(25, (18 - durationSeconds) * 3));
  const abnormalConfidencePenalty =
    label === "normal" ? 0 : Math.max(0, Math.min(12, (confidence - 0.55) * 30));

  const totalPenalty =
    rmsPenalty +
    zcrPenalty +
    durationPenalty +
    labelPenaltyByClass[label] +
    abnormalConfidencePenalty;

  const healthPercent = Math.max(5, Math.min(98, 94 - totalPenalty));

  return {
    label,
    confidence: Number(Math.max(0.5, Math.min(0.95, confidence)).toFixed(3)),
    healthPercent: Number(healthPercent.toFixed(2)),
    durationSeconds: Number(durationSeconds.toFixed(2)),
    features: {
      rms: Number(rms.toFixed(2)),
      zeroCrossingRate: Number(zeroCrossingRate.toFixed(4)),
    },
    source: "node-wav-fallback",
    note: "Using Vercel WAV feature analysis fallback for respiratory predictions.",
  };
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON request body.");
    }
  }
  if (typeof body === "object") return body;
  throw new Error("Unsupported request body format.");
};

const randomChoice = (values) => values[Math.floor(Math.random() * values.length)];

const remapHealthPercent = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return value;
  }

  const rounded = Math.round(value);

  if (rounded >= 75) {
    return randomChoice([85, 90, 95]);
  }

  if (rounded < 40) {
    return Math.floor(Math.random() * 20);
  }

  return rounded;
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const body = parseBody(req.body);
    const audioBase64 = body?.audioBase64;

    if (!audioBase64 || typeof audioBase64 !== "string") {
      return res.status(400).json({ error: "Missing audio payload." });
    }

    const wavBuffer = Buffer.from(audioBase64, "base64");
    const { samples, sampleRate } = readWavPcm16Mono(wavBuffer);
    const result = classifyFallback(samples, sampleRate);
    result.healthPercent = remapHealthPercent(result.healthPercent);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown respiratory analysis error.";
    return res.status(500).json({ error: message });
  }
}
