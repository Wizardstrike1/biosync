import { isSupabaseConfigured, supabase } from "./supabase";

export type HearingHistoryEntry = {
  id: string;
  createdAt: string;
  mode: "speaker" | "headphone";
  tonesHeardPercent: number;
  tonesHeard: number;
  totalTones: number;
  hearingAgeRange: string;
  highestHeardHz: number;
  falsePressesNoTone: number;
  earMatchAccuracy: number | null;
};

export type RespiratoryHistoryEntry = {
  id: string;
  createdAt: string;
  rms: number;
  confidencePercent: number;
  durationSeconds: number;
  label: "normal" | "crackle" | "wheeze" | "both";
};

export type MotorHistoryEntry = {
  id: string;
  createdAt: string;
  tremorPercent: number;
  stabilityPercent: number;
  accuracyPercent: number;
  targetHits: number;
};

export type EyeHistoryEntry = {
  id: string;
  createdAt: string;
  avgReactionMs: number;
  avgDistancePx: number;
  trialCount: number;
};

const STORAGE_KEYS = {
  hearing: "biosync-history-hearing",
  respiratory: "biosync-history-respiratory",
  motor: "biosync-history-motor",
  eye: "biosync-history-eye",
} as const;

const MAX_HISTORY = 30;
const RESULTS_TABLE = "biosync_results";
const RESULTS_API_BASE = "/api/results";

const isBrowser = () => typeof window !== "undefined";

const normalizeUserScope = (userId?: string | null) => {
  const cleaned = userId?.trim();
  return cleaned && cleaned.length ? cleaned : "guest";
};

const withUserKey = (baseKey: string, userId?: string | null) =>
  `${baseKey}:${normalizeUserScope(userId)}`;

const withGuestKey = (baseKey: string) => `${baseKey}:guest`;

type ResultType = "hearing" | "respiratory" | "motor" | "eye";

const getResultTypeKey = (type: ResultType) => {
  if (type === "hearing") return STORAGE_KEYS.hearing;
  if (type === "respiratory") return STORAGE_KEYS.respiratory;
  if (type === "eye") return STORAGE_KEYS.eye;
  return STORAGE_KEYS.motor;
};

type ResultRecord = {
  id: string;
  user_id: string;
  test_type: ResultType;
  created_at: string;
  payload: Record<string, unknown>;
};

const readHistory = <T>(key: string): T[] => {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed as T[];
  } catch {
    return [];
  }
};

const writeHistory = <T>(key: string, entries: T[]) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(entries.slice(0, MAX_HISTORY)));
};

const pushHistoryEntry = <T extends { id: string; createdAt: string }>(key: string, entry: T) => {
  const current = readHistory<T>(key);
  writeHistory(key, [entry, ...current]);
};

const buildEntryId = () => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${randomPart}`;
};

const mergeHistoryEntries = <T extends { id: string; createdAt: string }>(
  primary: T[],
  secondary: T[],
) => {
  const byId = new Map<string, T>();

  [...primary, ...secondary].forEach((entry) => {
    byId.set(entry.id, entry);
  });

  return [...byId.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_HISTORY);
};

const toResultRecord = <T extends { id: string; createdAt: string }>(
  type: ResultType,
  entry: T,
  userId: string,
): ResultRecord => {
  const { id, createdAt, ...payload } = entry;

  return {
    id,
    user_id: userId,
    test_type: type,
    created_at: createdAt,
    payload,
  };
};

const fromResultRecord = <T extends { id: string; createdAt: string }>(row: ResultRecord) => ({
  ...(row.payload as Omit<T, "id" | "createdAt">),
  id: row.id,
  createdAt: row.created_at,
}) as T;

const pushApiHistoryEntry = async <T extends { id: string; createdAt: string }>(
  type: ResultType,
  entry: T,
  userId?: string | null,
) => {
  if (!userId) return false;

  try {
    const response = await fetch(`${RESULTS_API_BASE}/${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: normalizeUserScope(userId), entry }),
    });

    return response.ok;
  } catch {
    return false;
  }
};

const loadApiHistory = async <T extends { id: string; createdAt: string }>(
  type: ResultType,
  userId?: string | null,
) => {
  if (!userId) return null;

  try {
    const response = await fetch(
      `${RESULTS_API_BASE}/${type}?userId=${encodeURIComponent(normalizeUserScope(userId))}`,
    );

    if (!response.ok) return null;

    const body = (await response.json()) as { entries?: T[] };
    return Array.isArray(body.entries) ? body.entries : [];
  } catch {
    return null;
  }
};

const pushSupabaseHistoryEntry = async <T extends { id: string; createdAt: string }>(
  type: ResultType,
  entry: T,
  userId?: string | null,
) => {
  if (!isSupabaseConfigured || !supabase || !userId) return;

  const scopedUser = normalizeUserScope(userId);

  try {
    const { error } = await supabase
      .from(RESULTS_TABLE)
      .upsert(toResultRecord(type, entry, scopedUser), { onConflict: "id" });

    if (error) {
      throw error;
    }
  } catch {
    // Keep local history if remote write fails.
  }
};

const loadSupabaseHistory = async <T extends { id: string; createdAt: string }>(
  type: ResultType,
  userId?: string | null,
) => {
  const resultTypeKey = getResultTypeKey(type);
  const localKey = withUserKey(resultTypeKey, userId);
  const guestKey = withGuestKey(resultTypeKey);
  const localEntries = readHistory<T>(localKey);

  const shouldMergeGuestEntries = Boolean(userId && localKey !== guestKey);
  const guestEntries = shouldMergeGuestEntries ? readHistory<T>(guestKey) : [];
  const normalizedLocalEntries = mergeHistoryEntries(localEntries, guestEntries);

  if (shouldMergeGuestEntries && guestEntries.length > 0) {
    writeHistory(localKey, normalizedLocalEntries);
  }

  if (!userId) {
    return normalizedLocalEntries;
  }

  const apiEntries = await loadApiHistory<T>(type, userId);
  if (apiEntries) {
    const remoteIds = new Set(apiEntries.map((entry) => entry.id));
    const missingLocalEntries = normalizedLocalEntries.filter((entry) => !remoteIds.has(entry.id));

    missingLocalEntries.forEach((entry) => {
      void pushApiHistoryEntry(type, entry, userId);
    });

    const merged = mergeHistoryEntries(apiEntries, normalizedLocalEntries);
    writeHistory(localKey, merged);
    return merged;
  }

  if (!isSupabaseConfigured || !supabase) {
    return normalizedLocalEntries;
  }

  const scopedUser = normalizeUserScope(userId);

  try {
    const { data, error } = await supabase
      .from(RESULTS_TABLE)
      .select("id,user_id,test_type,created_at,payload")
      .eq("user_id", scopedUser)
      .eq("test_type", type)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY);

    if (error) {
      throw error;
    }

    const remoteRows = Array.isArray(data) ? (data as ResultRecord[]) : [];
    const remoteEntries = remoteRows.map((row) => fromResultRecord<T>(row));
    const remoteIds = new Set(remoteEntries.map((entry) => entry.id));
    const missingLocalEntries = normalizedLocalEntries.filter((entry) => !remoteIds.has(entry.id));

    missingLocalEntries.forEach((entry) => {
      void pushSupabaseHistoryEntry(type, entry, userId);
    });

    const merged = mergeHistoryEntries(remoteEntries, normalizedLocalEntries);

    writeHistory(localKey, merged);
    return merged;
  } catch {
    return normalizedLocalEntries;
  }
};

export const saveHearingHistory = (entry: Omit<HearingHistoryEntry, "id" | "createdAt">, userId?: string | null) => {
  const nextEntry = {
    ...entry,
    id: buildEntryId(),
    createdAt: new Date().toISOString(),
  };

  pushHistoryEntry(withUserKey(STORAGE_KEYS.hearing, userId), nextEntry);
  void (async () => {
    const pushedViaApi = await pushApiHistoryEntry("hearing", nextEntry, userId);
    if (!pushedViaApi) {
      await pushSupabaseHistoryEntry("hearing", nextEntry, userId);
    }
  })();
};

export const saveRespiratoryHistory = (entry: Omit<RespiratoryHistoryEntry, "id" | "createdAt">, userId?: string | null) => {
  const nextEntry = {
    ...entry,
    id: buildEntryId(),
    createdAt: new Date().toISOString(),
  };

  pushHistoryEntry(withUserKey(STORAGE_KEYS.respiratory, userId), nextEntry);
  void (async () => {
    const pushedViaApi = await pushApiHistoryEntry("respiratory", nextEntry, userId);
    if (!pushedViaApi) {
      await pushSupabaseHistoryEntry("respiratory", nextEntry, userId);
    }
  })();
};

export const saveMotorHistory = (entry: Omit<MotorHistoryEntry, "id" | "createdAt">, userId?: string | null) => {
  const nextEntry = {
    ...entry,
    id: buildEntryId(),
    createdAt: new Date().toISOString(),
  };

  pushHistoryEntry(withUserKey(STORAGE_KEYS.motor, userId), nextEntry);
  void (async () => {
    const pushedViaApi = await pushApiHistoryEntry("motor", nextEntry, userId);
    if (!pushedViaApi) {
      await pushSupabaseHistoryEntry("motor", nextEntry, userId);
    }
  })();
};

export const saveEyeHistory = (entry: Omit<EyeHistoryEntry, "id" | "createdAt">, userId?: string | null) => {
  const nextEntry = {
    ...entry,
    id: buildEntryId(),
    createdAt: new Date().toISOString(),
  };

  pushHistoryEntry(withUserKey(STORAGE_KEYS.eye, userId), nextEntry);
  void (async () => {
    const pushedViaApi = await pushApiHistoryEntry("eye", nextEntry, userId);
    if (!pushedViaApi) {
      await pushSupabaseHistoryEntry("eye", nextEntry, userId);
    }
  })();
};

export const getHearingHistory = (userId?: string | null) =>
  readHistory<HearingHistoryEntry>(withUserKey(STORAGE_KEYS.hearing, userId));

export const getRespiratoryHistory = (userId?: string | null) =>
  readHistory<RespiratoryHistoryEntry>(withUserKey(STORAGE_KEYS.respiratory, userId));

export const getMotorHistory = (userId?: string | null) =>
  readHistory<MotorHistoryEntry>(withUserKey(STORAGE_KEYS.motor, userId));

export const getEyeHistory = (userId?: string | null) =>
  readHistory<EyeHistoryEntry>(withUserKey(STORAGE_KEYS.eye, userId));

export const loadHearingHistory = (userId?: string | null) =>
  loadSupabaseHistory<HearingHistoryEntry>("hearing", userId);

export const loadRespiratoryHistory = (userId?: string | null) =>
  loadSupabaseHistory<RespiratoryHistoryEntry>("respiratory", userId);

export const loadMotorHistory = (userId?: string | null) =>
  loadSupabaseHistory<MotorHistoryEntry>("motor", userId);

export const loadEyeHistory = (userId?: string | null) =>
  loadSupabaseHistory<EyeHistoryEntry>("eye", userId);
