import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.AUTH_PORT ?? 4000);
const JWT_SECRET = process.env.AUTH_JWT_SECRET ?? "replace-this-secret-in-production";
const TOKEN_NAME = "biosync_token";
const USERS_FILE_PATH = path.resolve(__dirname, "./data/users.json");
const RESULTS_FILE_PATH = path.resolve(__dirname, "./data/results.json");
const VALID_RESULT_TYPES = new Set(["hearing", "respiratory", "motor"]);

app.use(
  cors({
    origin: process.env.AUTH_ALLOWED_ORIGIN ?? "http://localhost:8080",
    credentials: true,
  }),
);
app.use(express.json({ limit: "15mb" }));
app.use(cookieParser());

const readUsers = async () => {
  try {
    const raw = await fs.readFile(USERS_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeUsers = async (users) => {
  await fs.writeFile(USERS_FILE_PATH, JSON.stringify(users, null, 2), "utf8");
};

const createEmptyResultsStore = () => ({
  hearing: {},
  respiratory: {},
  motor: {},
});

const readResultsStore = async () => {
  try {
    const raw = await fs.readFile(RESULTS_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return createEmptyResultsStore();
    }

    return {
      hearing: parsed.hearing && typeof parsed.hearing === "object" ? parsed.hearing : {},
      respiratory: parsed.respiratory && typeof parsed.respiratory === "object" ? parsed.respiratory : {},
      motor: parsed.motor && typeof parsed.motor === "object" ? parsed.motor : {},
    };
  } catch {
    return createEmptyResultsStore();
  }
};

const writeResultsStore = async (store) => {
  await fs.writeFile(RESULTS_FILE_PATH, JSON.stringify(store, null, 2), "utf8");
};

const normalizeResultUserId = (userId) => {
  const trimmed = String(userId ?? "").trim();
  return trimmed.length ? trimmed : "guest";
};

const mergeAndLimitEntries = (entries) => {
  const byId = new Map();

  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    if (typeof entry.id !== "string" || typeof entry.createdAt !== "string") return;
    byId.set(entry.id, entry);
  });

  return [...byId.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 30);
};

const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
});

const createSessionToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: "7d",
  });

const setSessionCookie = (res, token) => {
  res.cookie(TOKEN_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
};

const clearSessionCookie = (res) => {
  res.clearCookie(TOKEN_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
  });
};

const authMiddleware = (req, res, next) => {
  const token = req.cookies[TOKEN_NAME];
  if (!token) {
    return res.status(401).json({ message: "Not authenticated." });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Session expired. Please log in again." });
  }
};

const writeBase64AudioToTemp = async (audioBase64) => {
  const tempDir = path.resolve(__dirname, "./temp");
  await fs.mkdir(tempDir, { recursive: true });

  const tempPath = path.join(tempDir, `${randomUUID()}.wav`);
  const buffer = Buffer.from(audioBase64, "base64");
  await fs.writeFile(tempPath, buffer);
  return tempPath;
};

const resolvePythonExecutable = async () => {
  if (process.env.PYTHON_EXECUTABLE) {
    return process.env.PYTHON_EXECUTABLE;
  }

  const venvCandidates = process.platform === "win32"
    ? [path.resolve(__dirname, ".venv/Scripts/python.exe")]
    : [path.resolve(__dirname, ".venv/bin/python"), path.resolve(__dirname, ".venv/bin/python3")];

  for (const candidate of venvCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return "python";
};

const runPythonLungAnalyzer = async (wavPath) => {
  const scriptPath = path.resolve(__dirname, "./lung_inference.py");
  const pythonExecutable = await resolvePythonExecutable();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [scriptPath, wavPath], {
      stdio: ["ignore", "pipe", "pipe"],
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
      reject(new Error(`Failed to start python analyzer: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python analyzer exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch {
        reject(new Error("Analyzer returned invalid JSON output."));
      }
    });
  });
};

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post("/api/lung/analyze", async (req, res) => {
  const { audioBase64 } = req.body ?? {};

  if (!audioBase64 || typeof audioBase64 !== "string") {
    return res.status(400).json({ message: "Missing audio payload." });
  }

  let tempFilePath = "";
  try {
    tempFilePath = await writeBase64AudioToTemp(audioBase64);
    const result = await runPythonLungAnalyzer(tempFilePath);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to analyze respiratory audio.",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore temp cleanup failures.
      }
    }
  }
});

app.get("/api/results/:type", async (req, res) => {
  const { type } = req.params;
  if (!VALID_RESULT_TYPES.has(type)) {
    return res.status(400).json({ message: "Invalid result type." });
  }

  const scopedUserId = normalizeResultUserId(req.query.userId);
  const store = await readResultsStore();
  const userEntries = store[type]?.[scopedUserId];
  const entries = Array.isArray(userEntries) ? userEntries : [];

  return res.status(200).json({ entries });
});

app.post("/api/results/:type", async (req, res) => {
  const { type } = req.params;
  if (!VALID_RESULT_TYPES.has(type)) {
    return res.status(400).json({ message: "Invalid result type." });
  }

  const scopedUserId = normalizeResultUserId(req.body?.userId);
  const entry = req.body?.entry;

  if (!entry || typeof entry !== "object") {
    return res.status(400).json({ message: "Missing result entry." });
  }

  if (typeof entry.id !== "string" || typeof entry.createdAt !== "string") {
    return res.status(400).json({ message: "Entry must include id and createdAt." });
  }

  const store = await readResultsStore();
  const existing = Array.isArray(store[type]?.[scopedUserId]) ? store[type][scopedUserId] : [];
  const merged = mergeAndLimitEntries([entry, ...existing]);

  store[type][scopedUserId] = merged;
  await writeResultsStore(store);

  return res.status(200).json({ ok: true, total: merged.length });
});

app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body ?? {};
  const trimmedName = String(name ?? "").trim();
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  const rawPassword = String(password ?? "");

  if (!trimmedName || !normalizedEmail || !rawPassword) {
    return res.status(400).json({ message: "Name, email, and password are required." });
  }

  if (rawPassword.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }

  const users = await readUsers();
  if (users.some((user) => user.email === normalizedEmail)) {
    return res.status(409).json({ message: "This email is already registered." });
  }

  const passwordHash = await bcrypt.hash(rawPassword, 12);
  const newUser = {
    id: randomUUID(),
    name: trimmedName,
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  await writeUsers(users);

  const token = createSessionToken(newUser);
  setSessionCookie(res, token);

  return res.status(201).json({ user: toPublicUser(newUser) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  const rawPassword = String(password ?? "");

  if (!normalizedEmail || !rawPassword) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const users = await readUsers();
  const foundUser = users.find((user) => user.email === normalizedEmail);

  if (!foundUser) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const passwordMatches = await bcrypt.compare(rawPassword, foundUser.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const token = createSessionToken(foundUser);
  setSessionCookie(res, token);

  return res.status(200).json({ user: toPublicUser(foundUser) });
});

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const users = await readUsers();
  const foundUser = users.find((user) => user.id === req.auth.sub);

  if (!foundUser) {
    clearSessionCookie(res);
    return res.status(401).json({ message: "User no longer exists." });
  }

  return res.status(200).json({ user: toPublicUser(foundUser) });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`BioSync auth server listening on http://localhost:${PORT}`);
});
