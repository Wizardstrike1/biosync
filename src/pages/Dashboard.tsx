import { motion } from "framer-motion";
import { Ear, Wind, Eye, Hand, Activity, Flame, Brain } from "lucide-react";
import TestCard from "@/components/TestCard";
import { useEffect, useMemo, useState } from "react";
import { useAuth, useUser } from "@/lib/auth";
import {
  EyeHistoryEntry,
  HearingHistoryEntry,
  MotorHistoryEntry,
  MemoryHistoryEntry,
  RespiratoryHistoryEntry,
  loadEyeHistory,
  loadHearingHistory,
  loadMemoryHistory,
  loadMotorHistory,
  loadRespiratoryHistory,
} from "@/lib/testHistory";
import { computeHealthScore } from "@/lib/healthScore";
import { computeCurrentDailyStreak, computeHighestDailyStreak } from "@/lib/streak";
import { getUserAvatarUrl, getUserDisplayName } from "@/lib/userProfile";
import { Button } from "@/components/ui/button";

type LeaderboardEntry = {
  userId: string;
  displayName?: string | null;
  currentStreak: number;
  highestStreak: number;
};

type LeaderboardSort = "current" | "highest";
type LeaderboardMode = "global" | "self";

const compactUserId = (value: string) => {
  if (value.length <= 10) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const tests = [
  {
    title: "Hearing Age",
    description: "Frequency response & hearing age estimation",
    icon: <Ear className="h-5 w-5 text-hearing" />,
    route: "/test/hearing",
  },
  {
    title: "Respiratory Health",
    description: "Exhale analysis & lung capacity",
    icon: <Wind className="h-5 w-5 text-respiratory" />,
    route: "/test/respiratory",
  },
  {
    title: "Eye Tracking & Blink",
    description: "Saccade accuracy & blink patterns",
    icon: <Eye className="h-5 w-5 text-eye-tracking" />,
    route: "/test/pupil",
  },
  {
    title: "Motor Control",
    description: "Reaction time & fine motor skills",
    icon: <Hand className="h-5 w-5 text-motor" />,
    route: "/test/motor",
  },
  {
    title: "Memory Sequence",
    description: "Repeat growing patterns to test short-term memory",
    icon: <Brain className="h-5 w-5 text-foreground" />,
    route: "/test/memory",
  },
];

const Dashboard = () => {
  const { userId } = useAuth();
  const { user } = useUser();
  const [hearingHistory, setHearingHistory] = useState<HearingHistoryEntry[]>([]);
  const [respiratoryHistory, setRespiratoryHistory] = useState<RespiratoryHistoryEntry[]>([]);
  const [motorHistory, setMotorHistory] = useState<MotorHistoryEntry[]>([]);
  const [eyeHistory, setEyeHistory] = useState<EyeHistoryEntry[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<MemoryHistoryEntry[]>([]);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [leaderboardSort, setLeaderboardSort] = useState<LeaderboardSort>("current");
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>("self");

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const [hearing, respiratory, motor, eye, memory] = await Promise.all([
        loadHearingHistory(userId),
        loadRespiratoryHistory(userId),
        loadMotorHistory(userId),
        loadEyeHistory(userId),
        loadMemoryHistory(userId),
      ]);

      if (!active) return;
      setHearingHistory(hearing);
      setRespiratoryHistory(respiratory);
      setMotorHistory(motor);
      setEyeHistory(eye);
      setMemoryHistory(memory);
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [userId]);

  const score = useMemo(
    () => computeHealthScore(hearingHistory, respiratoryHistory, motorHistory),
    [hearingHistory, respiratoryHistory, motorHistory],
  );

  const streak = useMemo(() => {
    const allCreatedAt = [
      ...hearingHistory.map((entry) => entry.createdAt),
      ...respiratoryHistory.map((entry) => entry.createdAt),
      ...motorHistory.map((entry) => entry.createdAt),
      ...eyeHistory.map((entry) => entry.createdAt),
      ...memoryHistory.map((entry) => entry.createdAt),
    ];

    return computeCurrentDailyStreak(allCreatedAt);
  }, [eyeHistory, hearingHistory, memoryHistory, motorHistory, respiratoryHistory]);

  const currentUserCreatedAtValues = useMemo(
    () => [
      ...hearingHistory.map((entry) => entry.createdAt),
      ...respiratoryHistory.map((entry) => entry.createdAt),
      ...motorHistory.map((entry) => entry.createdAt),
      ...eyeHistory.map((entry) => entry.createdAt),
      ...memoryHistory.map((entry) => entry.createdAt),
    ],
    [eyeHistory, hearingHistory, memoryHistory, motorHistory, respiratoryHistory],
  );

  const testCount = hearingHistory.length + respiratoryHistory.length + motorHistory.length + eyeHistory.length + memoryHistory.length;
  const avatarUrl = getUserAvatarUrl(user);
  const currentUserDisplayName = getUserDisplayName(user);

  const fetchLeaderboard = async () => {
    setIsLeaderboardLoading(true);
    setLeaderboardError(null);

    try {
      const response = await fetch("/api/leaderboard/streaks");
      if (!response.ok) {
        throw new Error("Leaderboard request failed.");
      }

      const body = await response.json() as { entries?: LeaderboardEntry[] };
      const entries = Array.isArray(body.entries) ? body.entries : [];

      // Always include the current user using already-loaded local/synced history.
      if (userId && currentUserCreatedAtValues.length > 0) {
        const selfEntry: LeaderboardEntry = {
          userId,
          displayName: currentUserDisplayName,
          currentStreak: computeCurrentDailyStreak(currentUserCreatedAtValues).streak,
          highestStreak: computeHighestDailyStreak(currentUserCreatedAtValues),
        };

        const existingIndex = entries.findIndex((entry) => entry.userId === userId);
        if (existingIndex >= 0) {
          entries[existingIndex] = selfEntry;
        } else {
          entries.push(selfEntry);
        }
      }

      setLeaderboardEntries(entries);
      setLeaderboardMode("global");
    } catch {
      if (userId && currentUserCreatedAtValues.length > 0) {
        setLeaderboardEntries([
          {
            userId,
            displayName: currentUserDisplayName,
            currentStreak: computeCurrentDailyStreak(currentUserCreatedAtValues).streak,
            highestStreak: computeHighestDailyStreak(currentUserCreatedAtValues),
          },
        ]);
      } else {
        setLeaderboardEntries([]);
      }
      setLeaderboardMode("self");
      setLeaderboardError("Could not load global leaderboard. Make sure server has SUPABASE_SERVICE_ROLE_KEY configured.");
    } finally {
      setIsLeaderboardLoading(false);
    }
  };

  const openLeaderboard = () => {
    setIsLeaderboardOpen(true);
    void fetchLeaderboard();
  };

  const sortedLeaderboardEntries = useMemo(() => {
    return [...leaderboardEntries].sort((a, b) => {
      if (leaderboardSort === "current") {
        if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
        return b.highestStreak - a.highestStreak;
      }

      if (b.highestStreak !== a.highestStreak) return b.highestStreak - a.highestStreak;
      return b.currentStreak - a.currentStreak;
    });
  }, [leaderboardEntries, leaderboardSort]);

  return (
    <div className="px-5 pt-14 pb-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="text-2xl font-display font-bold text-foreground">BioSync</h1>
        </div>
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt="User avatar" className="h-full w-full object-cover" />
          ) : (
            <Activity className="h-5 w-5 text-primary animate-pulse-glow" />
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="card-elevated rounded-2xl p-4 border border-border mb-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Daily Streak</p>
            <p className="text-2xl font-display font-bold text-foreground mt-1">{streak.streak} day{streak.streak === 1 ? "" : "s"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {streak.completedToday
                ? "Completed today. Keep the momentum."
                : "Complete one test today to keep your streak alive."}
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={openLeaderboard}>
              View Global Leaderboard
            </Button>
          </div>
          <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
            <Flame className={`h-5 w-5 ${streak.streak > 0 ? "text-warning" : "text-muted-foreground"}`} />
          </div>
        </div>
      </motion.div>

      {/* Health Score */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="card-elevated rounded-3xl p-6 border border-border mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Overall Health Score</p>
            <p className="text-5xl font-display font-bold text-gradient mt-1">{score.overall}</p>
            <p className="text-xs text-muted-foreground mt-1">{testCount} total tests recorded</p>
          </div>
          <div className="relative h-20 w-20">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.5" fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="3"
                strokeDasharray="97.4"
                strokeDashoffset={97.4 * (1 - score.overall / 100)}
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </motion.div>

      {/* Tests */}
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Health Tests
      </h2>
      <div className="space-y-3">
        {tests.map((test) => (
          <TestCard
            key={test.title}
            title={test.title}
            description={test.description}
            icon={test.icon}
            route={test.route}
            status="ready"
          />
        ))}
      </div>

      {isLeaderboardOpen && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm px-4 py-10" onClick={() => setIsLeaderboardOpen(false)}>
          <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-display font-semibold">Global Streak Leaderboard</h3>
              <Button size="sm" variant="ghost" onClick={() => setIsLeaderboardOpen(false)}>Close</Button>
            </div>

            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant={leaderboardSort === "current" ? "default" : "outline"}
                onClick={() => setLeaderboardSort("current")}
              >
                Current Streak
              </Button>
              <Button
                size="sm"
                variant={leaderboardSort === "highest" ? "default" : "outline"}
                onClick={() => setLeaderboardSort("highest")}
              >
                All-Time Best
              </Button>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              Mode: {leaderboardMode === "global" ? "Global mode (all accounts)" : "Self-only fallback"}
            </p>

            <div className="mt-4 max-h-80 overflow-y-auto space-y-2">
              {isLeaderboardLoading && <p className="text-xs text-muted-foreground">Loading leaderboard...</p>}
              {!isLeaderboardLoading && leaderboardError && (
                <p className="text-xs text-muted-foreground">{leaderboardError}</p>
              )}
              {!isLeaderboardLoading && !leaderboardError && sortedLeaderboardEntries.length === 0 && (
                <p className="text-xs text-muted-foreground">No streak data found yet.</p>
              )}

              {!isLeaderboardLoading && !leaderboardError && sortedLeaderboardEntries.slice(0, 50).map((entry, index) => (
                <div key={entry.userId} className="rounded-lg border border-border bg-secondary/30 px-3 py-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      #{index + 1}{" "}
                      {entry.userId === userId
                        ? "You"
                        : (entry.displayName && entry.displayName.trim().length > 0
                            ? entry.displayName
                            : compactUserId(entry.userId))}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Current: {entry.currentStreak}d · Best: {entry.highestStreak}d</p>
                  </div>
                  <p className="text-sm font-display font-bold text-primary">
                    {leaderboardSort === "current" ? entry.currentStreak : entry.highestStreak}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
