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
import { computeCurrentDailyStreak } from "@/lib/streak";
import { getUserAvatarUrl } from "@/lib/userProfile";

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

  const testCount = hearingHistory.length + respiratoryHistory.length + motorHistory.length + eyeHistory.length + memoryHistory.length;
  const avatarUrl = getUserAvatarUrl(user);

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
    </div>
  );
};

export default Dashboard;
