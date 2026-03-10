import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");

const PORT = Number(process.env.AUTH_PORT ?? 4000);
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const SECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const oldServerDir = path.resolve(workspaceRoot, "biosync-working-breath2/server");
const pythonScriptPath = path.join(oldServerDir, "lung_inference.py");

const startOfLocalDay = (value) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const getUniqueDayTimestamps = (createdAtValues) => {
  const completedDays = new Set();

  createdAtValues.forEach((createdAt) => {
    const date = new Date(createdAt);
    if (!Number.isNaN(date.getTime())) {
      completedDays.add(startOfLocalDay(date).getTime());
    }
  });

  return [...completedDays].sort((a, b) => b - a);
};

const computeCurrentDailyStreak = (createdAtValues) => {
  const sortedDays = getUniqueDayTimestamps(createdAtValues);
  if (sortedDays.length === 0) return 0;

  const today = startOfLocalDay(new Date()).getTime();
  const latest = sortedDays[0];
  const daysFromLatestToToday = Math.floor((today - latest) / SECONDS_PER_DAY);
  if (daysFromLatestToToday > 1) return 0;

  let streak = 1;
  for (let i = 1; i < sortedDays.length; i += 1) {
    const gap = Math.floor((sortedDays[i - 1] - sortedDays[i]) / SECONDS_PER_DAY);
    if (gap !== 1) break;
    streak += 1;
  }

  return streak;
};

const computeHighestDailyStreak = (createdAtValues) => {
  const sortedDesc = getUniqueDayTimestamps(createdAtValues);
  if (sortedDesc.length === 0) return 0;

  const sortedAsc = [...sortedDesc].reverse();
  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedAsc.length; i += 1) {
    const gap = Math.floor((sortedAsc[i] - sortedAsc[i - 1]) / SECONDS_PER_DAY);
    if (gap === 1) {
      currentStreak += 1;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }

  return maxStreak;
};

const fetchSupabaseLeaderboardRows = async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL are required for global leaderboard.");
  }

  const url = `${supabaseUrl}/rest/v1/biosync_results?select=user_id,created_at&order=created_at.desc&limit=10000`;
  const response = await fetch(url, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase request failed with status ${response.status}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
};

const deriveDisplayNameFromAuthUser = (user) => {
  const metadata = user?.user_metadata ?? user?.raw_user_meta_data ?? {};

  if (typeof metadata.full_name === "string" && metadata.full_name.trim().length > 0) {
    return metadata.full_name.trim();
  }

  if (typeof metadata.name === "string" && metadata.name.trim().length > 0) {
    return metadata.name.trim();
  }

  if (typeof user?.email === "string" && user.email.includes("@")) {
    const prefix = user.email.split("@")[0]?.trim();
    if (prefix) return prefix;
  }

  return null;
};

const fetchSupabaseUserDisplayNames = async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL are required for global leaderboard.");
  }

  const perPage = 1000;
  const maxPages = 10;
  const users = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const authUrl = `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`;
    const response = await fetch(authUrl, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Supabase auth users request failed with status ${response.status}`);
    }

    const body = await response.json();
    const pageUsers = Array.isArray(body?.users) ? body.users : [];
    users.push(...pageUsers);

    if (pageUsers.length < perPage) {
      break;
    }
  }

  const displayNameByUserId = new Map();
  users.forEach((user) => {
    if (typeof user?.id !== "string" || user.id.length === 0) return;
    const displayName = deriveDisplayNameFromAuthUser(user);
    if (displayName) {
      displayNameByUserId.set(user.id, displayName);
    }
  });

  return displayNameByUserId;
};

const readWavPcm16Mono = (buffer) => {
  if (buffer.length < 44) {
    throw new Error("WAV file is too short.");
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
    throw new Error("No audio frames found in WAV data.");
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
    note: "Using local WAV feature analysis because the Python lung model is unavailable.",
  };
};

const sendJson = (res, statusCode, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
};

const readJsonBody = async (req) =>
  new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Payload too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON payload."));
      }
    });

    req.on("error", () => reject(new Error("Failed to read request body.")));
  });

const resolvePythonExecutable = async () => {
  if (process.env.PYTHON_EXECUTABLE) {
    return process.env.PYTHON_EXECUTABLE;
  }

  const candidates = process.platform === "win32"
    ? [
        path.join(oldServerDir, ".venv/Scripts/python.exe"),
        path.join(workspaceRoot, ".venv/Scripts/python.exe"),
      ]
    : [
        path.join(oldServerDir, ".venv/bin/python"),
        path.join(workspaceRoot, ".venv/bin/python"),
      ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next path.
    }
  }

  return "python";
};

const runPythonAnalyzer = async (wavPath) => {
  const pythonExecutable = await resolvePythonExecutable();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [pythonScriptPath, wavPath], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: oldServerDir,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python process exited with code ${code}.`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch {
        reject(new Error("Analyzer returned invalid JSON."));
      }
    });
  });
};

const analyzeWithFallback = async (audioBase64, wavPath) => {
  try {
    await fs.access(pythonScriptPath);
    return await runPythonAnalyzer(wavPath);
  } catch {
    const wavBuffer = Buffer.from(audioBase64, "base64");
    const { samples, sampleRate } = readWavPcm16Mono(wavBuffer);
    return classifyFallback(samples, sampleRate);
  }
};

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, { ok: true, analyzer: "lung-cnn-pth" });
    return;
  }

  if (req.method === "GET" && req.url === "/api/leaderboard/streaks") {
    try {
      const [rows, displayNameByUserId] = await Promise.all([
        fetchSupabaseLeaderboardRows(),
        fetchSupabaseUserDisplayNames(),
      ]);
      const byUser = new Map();

      rows.forEach((row) => {
        if (!row?.user_id || !row?.created_at) return;
        const existing = byUser.get(row.user_id) ?? [];
        existing.push(row.created_at);
        byUser.set(row.user_id, existing);
      });

      const entries = [...byUser.entries()].map(([userId, createdAtValues]) => ({
        userId,
        displayName: displayNameByUserId.get(userId) ?? null,
        currentStreak: computeCurrentDailyStreak(createdAtValues),
        highestStreak: computeHighestDailyStreak(createdAtValues),
      }));

      sendJson(res, 200, { entries });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load leaderboard.";
      sendJson(res, 500, { error: message });
      return;
    }
  }

  if (req.method === "POST" && req.url === "/api/lung/analyze") {
    let tempFilePath = "";

    try {
      const body = await readJsonBody(req);
      const audioBase64 = body?.audioBase64;

      if (!audioBase64 || typeof audioBase64 !== "string") {
        sendJson(res, 400, { error: "Missing audio payload." });
        return;
      }

      const tempDir = path.resolve(oldServerDir, "temp");
      await fs.mkdir(tempDir, { recursive: true });

      tempFilePath = path.join(tempDir, `${randomUUID()}.wav`);
      await fs.writeFile(tempFilePath, Buffer.from(audioBase64, "base64"));

      const result = await analyzeWithFallback(audioBase64, tempFilePath);
      sendJson(res, 200, result);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown analysis error.";
      sendJson(res, 500, {
        error: message,
        note: "Lung analyzer is unavailable. Ensure Python dependencies and model files are present.",
      });
      return;
    } finally {
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch {
          // Ignore cleanup failures.
        }
      }
    }
  }

  sendJson(res, 404, { error: "Not found." });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[biosync-api] Listening on http://localhost:${PORT}`);
});
