const SECONDS_PER_DAY = 24 * 60 * 60 * 1000;

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const rows = await fetchSupabaseLeaderboardRows();
    const byUser = new Map();

    rows.forEach((row) => {
      if (!row?.user_id || !row?.created_at) return;
      const existing = byUser.get(row.user_id) ?? [];
      existing.push(row.created_at);
      byUser.set(row.user_id, existing);
    });

    const entries = [...byUser.entries()].map(([userId, createdAtValues]) => ({
      userId,
      currentStreak: computeCurrentDailyStreak(createdAtValues),
      highestStreak: computeHighestDailyStreak(createdAtValues),
    }));

    return res.status(200).json({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load leaderboard.";
    return res.status(500).json({ error: message });
  }
}
