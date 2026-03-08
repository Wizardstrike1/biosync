import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@clerk/react";
import { Button } from "@/components/ui/button";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EyeHistoryEntry,
  HearingHistoryEntry,
  MotorHistoryEntry,
  RespiratoryHistoryEntry,
  loadEyeHistory,
  loadHearingHistory,
  loadMotorHistory,
  loadRespiratoryHistory,
} from "@/lib/testHistory";
import { computeHealthScore } from "@/lib/healthScore";

type ChartRow = {
  label: string;
  value: number;
};

type ChartConfig = {
  key: string;
  label: string;
  color: string;
  data: ChartRow[];
  formatValue: (value: number) => string;
  yDomain?: [number, number] | ["auto", "auto"];
};
 
const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const respiratoryHealthPercent = (entry: RespiratoryHistoryEntry) => {
  if (typeof entry.healthPercent === "number") {
    return Math.max(0, Math.min(100, Math.round(entry.healthPercent)));
  }

  return Math.max(0, Math.min(100, Math.round(100 - entry.rms * 85)));
};

const Results = () => {
  const { userId } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [hearingHistory, setHearingHistory] = useState<HearingHistoryEntry[]>([]);
  const [respiratoryHistory, setRespiratoryHistory] = useState<RespiratoryHistoryEntry[]>([]);
  const [motorHistory, setMotorHistory] = useState<MotorHistoryEntry[]>([]);
  const [eyeHistory, setEyeHistory] = useState<EyeHistoryEntry[]>([]);

  const refreshHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const [hearing, respiratory, motor, eye] = await Promise.all([
        loadHearingHistory(userId),
        loadRespiratoryHistory(userId),
        loadMotorHistory(userId),
        loadEyeHistory(userId),
      ]);

      setHearingHistory(hearing);
      setRespiratoryHistory(respiratory);
      setMotorHistory(motor);
      setEyeHistory(eye);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const score = useMemo(
    () => computeHealthScore(hearingHistory, respiratoryHistory, motorHistory),
    [hearingHistory, respiratoryHistory, motorHistory],
  );

  const hearingData = useMemo<ChartRow[]>(
    () =>
      [...hearingHistory]
        .reverse()
        .map((entry) => ({ label: formatShortDate(entry.createdAt), value: entry.tonesHeardPercent })),
    [hearingHistory],
  );

  const respiratoryScoreData = useMemo<ChartRow[]>(
    () =>
      [...respiratoryHistory]
        .reverse()
        .map((entry) => ({ label: formatShortDate(entry.createdAt), value: respiratoryHealthPercent(entry) })),
    [respiratoryHistory],
  );

  const motorData = useMemo<ChartRow[]>(
    () =>
      [...motorHistory]
        .reverse()
        .map((entry) => ({ label: formatShortDate(entry.createdAt), value: entry.stabilityPercent })),
    [motorHistory],
  );

  const eyeAverageTimeData = useMemo<ChartRow[]>(
    () =>
      [...eyeHistory]
        .reverse()
        .map((entry) => ({ label: formatShortDate(entry.createdAt), value: Number((entry.avgReactionMs / 1000).toFixed(3)) })),
    [eyeHistory],
  );

  const charts = useMemo<ChartConfig[]>(
    () => [
      {
        key: "hearing",
        label: "Hearing",
        color: "hsl(var(--success))",
        data: hearingData,
        formatValue: (value) => `${Math.round(value)}%`,
        yDomain: [0, 100],
      },
      {
        key: "respiratory",
        label: "Respiratory",
        color: "hsl(var(--warning))",
        data: respiratoryScoreData,
        formatValue: (value) => `${Math.round(value)}%`,
        yDomain: [0, 100],
      },
      {
        key: "motor",
        label: "Motor",
        color: "hsl(var(--accent))",
        data: motorData,
        formatValue: (value) => `${Math.round(value)}%`,
        yDomain: [0, 100],
      },
      {
        key: "eye-average-time",
        label: "Eye Checker Avg Time",
        color: "hsl(var(--accent))",
        data: eyeAverageTimeData,
        formatValue: (value) => `${value.toFixed(3)}s`,
        yDomain: ["auto", "auto"],
      },
    ],
    [eyeAverageTimeData, hearingData, motorData, respiratoryScoreData],
  );

  return (
    <div className="px-5 pt-14 pb-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-display font-bold text-foreground mb-2">Results</h1>
        <p className="text-sm text-muted-foreground mb-6">Live trends from your completed tests</p>
      </motion.div>

      <div className="card-elevated rounded-2xl p-5 border border-border mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Overall Health Score</p>
        <p className="text-5xl font-display font-bold text-gradient mt-2">{score.overall}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <p className="rounded-md bg-secondary/50 p-2 text-center">Hearing: {score.hearing ?? "-"}</p>
          <p className="rounded-md bg-secondary/50 p-2 text-center">Resp: {score.respiratory ?? "-"}</p>
          <p className="rounded-md bg-secondary/50 p-2 text-center">Motor: {score.motor ?? "-"}</p>
        </div>
      </div>

      <div className="mb-4 flex justify-end">
        <Button size="sm" variant="outline" onClick={() => void refreshHistory()} disabled={isLoading}>
          {isLoading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="space-y-6">
        {charts.map((chart, i) => (
          <motion.div
            key={chart.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="card-elevated rounded-2xl p-4 border border-border"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm text-foreground">{chart.label}</h3>
              <span className="text-xs font-medium" style={{ color: chart.color }}>
                {chart.data.length ? chart.formatValue(chart.data[chart.data.length - 1].value) : "No data"}
              </span>
            </div>
            {chart.data.length ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart.data}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis domain={chart.yDomain ?? [0, 100]} hide />
                    <Tooltip
                      formatter={(value) => chart.formatValue(Number(value))}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.75rem",
                        fontSize: "12px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={chart.color}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, fill: chart.color }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No saved sessions yet for this test.</p>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Results;
