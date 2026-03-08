import { createClient } from "@supabase/supabase-js";

const VALID_TYPES = new Set(["hearing", "respiratory", "motor"]);
const RESULTS_TABLE = "biosync_results";
const MAX_HISTORY = 30;

const normalizeUserId = (userId) => {
  const trimmed = String(userId ?? "").trim();
  return trimmed.length ? trimmed : "guest";
};

const buildSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
};

const toEntry = (row) => ({
  ...(row.payload || {}),
  id: row.id,
  createdAt: row.created_at,
});

const toRow = (type, entry, userId) => {
  const { id, createdAt, ...payload } = entry;

  return {
    id,
    user_id: userId,
    test_type: type,
    created_at: createdAt,
    payload,
  };
};

export default async function handler(req, res) {
  const type = req.query?.type;

  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ message: "Invalid result type." });
  }

  const supabase = buildSupabaseClient();
  if (!supabase) {
    return res.status(500).json({ message: "Supabase server env is missing." });
  }

  if (req.method === "GET") {
    const userId = normalizeUserId(req.query?.userId);

    const { data, error } = await supabase
      .from(RESULTS_TABLE)
      .select("id,user_id,test_type,created_at,payload")
      .eq("user_id", userId)
      .eq("test_type", type)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY);

    if (error) {
      return res.status(500).json({ message: "Failed loading results.", error: error.message });
    }

    const rows = Array.isArray(data) ? data : [];
    return res.status(200).json({ entries: rows.map(toEntry) });
  }

  if (req.method === "POST") {
    const userId = normalizeUserId(req.body?.userId);
    const entry = req.body?.entry;

    if (!entry || typeof entry !== "object") {
      return res.status(400).json({ message: "Missing result entry." });
    }

    if (typeof entry.id !== "string" || typeof entry.createdAt !== "string") {
      return res.status(400).json({ message: "Entry must include id and createdAt." });
    }

    const { error } = await supabase
      .from(RESULTS_TABLE)
      .upsert(toRow(type, entry, userId), { onConflict: "id" });

    if (error) {
      return res.status(500).json({ message: "Failed writing result.", error: error.message });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ message: "Method not allowed." });
}
