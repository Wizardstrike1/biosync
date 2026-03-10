import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
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
  MemoryHistoryEntry,
  MotorHistoryEntry,
  RespiratoryHistoryEntry,
  loadEyeHistory,
  loadHearingHistory,
  loadMemoryHistory,
  loadMotorHistory,
  loadRespiratoryHistory,
} from "@/lib/testHistory";
import { computeHealthScore } from "@/lib/healthScore";

type ChartRow = {
  label: string;
  value: number;
};

type HistoryRow = {
  id: string;
  createdAt: string;
  score: number;
};

type SortField = "date" | "score";
type SortOrder = "asc" | "desc";

type ChartConfig = {
  key: string;
  label: string;
  color: string;
  data: ChartRow[];
  historyRows: HistoryRow[];
  formatValue: (value: number) => string;
  yDomain?: [number, number] | ["auto", "auto"];
};
 
const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

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
  const [memoryHistory, setMemoryHistory] = useState<MemoryHistoryEntry[]>([]);
  const [expandedChartKey, setExpandedChartKey] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const refreshHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const [hearing, respiratory, motor, eye, memory] = await Promise.all([
        loadHearingHistory(userId),
        loadRespiratoryHistory(userId),
        loadMotorHistory(userId),
        loadEyeHistory(userId),
        loadMemoryHistory(userId),
      ]);

      setHearingHistory(hearing);
      setRespiratoryHistory(respiratory);
      setMotorHistory(motor);
      setEyeHistory(eye);
      setMemoryHistory(memory);
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

  const hearingRows = useMemo<HistoryRow[]>(
    () => hearingHistory.map((entry) => ({ id: entry.id, createdAt: entry.createdAt, score: entry.tonesHeardPercent })),
    [hearingHistory],
  );

  const respiratoryRows = useMemo<HistoryRow[]>(
    () => respiratoryHistory.map((entry) => ({ id: entry.id, createdAt: entry.createdAt, score: respiratoryHealthPercent(entry) })),
    [respiratoryHistory],
  );

  const motorRows = useMemo<HistoryRow[]>(
    () => motorHistory.map((entry) => ({ id: entry.id, createdAt: entry.createdAt, score: entry.stabilityPercent })),
    [motorHistory],
  );

  const eyeRows = useMemo<HistoryRow[]>(
    () => eyeHistory.map((entry) => ({ id: entry.id, createdAt: entry.createdAt, score: Number((entry.avgReactionMs / 1000).toFixed(3)) })),
    [eyeHistory],
  );

  const memoryRows = useMemo<HistoryRow[]>(
    () => memoryHistory.map((entry) => ({ id: entry.id, createdAt: entry.createdAt, score: entry.squaresRemembered })),
    [memoryHistory],
  );

  const toChartData = useCallback(
    (rows: HistoryRow[]): ChartRow[] =>
      [...rows]
        .reverse()
        .map((row) => ({ label: formatShortDate(row.createdAt), value: row.score })),
    [],
  );

  const charts = useMemo<ChartConfig[]>(
    () => [
      {
        key: "hearing",
        label: "Hearing",
        color: "hsl(var(--success))",
        data: toChartData(hearingRows),
        historyRows: hearingRows,
        formatValue: (value) => `${Math.round(value)}%`,
        yDomain: [0, 100],
      },
      {
        key: "respiratory",
        label: "Respiratory",
        color: "hsl(var(--warning))",
        data: toChartData(respiratoryRows),
        historyRows: respiratoryRows,
        formatValue: (value) => `${Math.round(value)}%`,
        yDomain: [0, 100],
      },
      {
        key: "motor",
        label: "Motor",
        color: "hsl(var(--accent))",
        data: toChartData(motorRows),
        historyRows: motorRows,
        formatValue: (value) => `${Math.round(value)}%`,
        yDomain: [0, 100],
      },
      {
        key: "eye-average-time",
        label: "Eye Checker Avg Time",
        color: "hsl(var(--accent))",
        data: toChartData(eyeRows),
        historyRows: eyeRows,
        formatValue: (value) => `${value.toFixed(3)}s`,
        yDomain: ["auto", "auto"],
      },
      {
        key: "memory-level",
        label: "Memory Sequence Score",
        color: "hsl(var(--primary))",
        data: toChartData(memoryRows),
        historyRows: memoryRows,
        formatValue: (value) => `${Math.round(value)} tiles`,
        yDomain: ["auto", "auto"],
      },
    ],
    [eyeRows, hearingRows, memoryRows, motorRows, respiratoryRows, toChartData],
  );

  const sortRows = useCallback(
    (rows: HistoryRow[]) => {
      const sorted = [...rows].sort((a, b) => {
        if (sortField === "score") {
          return sortOrder === "asc" ? a.score - b.score : b.score - a.score;
        }

        const aTime = Date.parse(a.createdAt);
        const bTime = Date.parse(b.createdAt);
        return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
      });

      return sorted;
    },
    [sortField, sortOrder],
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
            className="card-elevated rounded-2xl p-4 border border-border cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => setExpandedChartKey((current) => (current === chart.key ? null : chart.key))}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setExpandedChartKey((current) => (current === chart.key ? null : chart.key));
              }
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold text-sm text-foreground">{chart.label}</h3>
              <span className="text-xs font-medium" style={{ color: chart.color }}>
                {chart.historyRows.length ? chart.formatValue(chart.historyRows[0].score) : "No data"}
              </span>
            </div>
            {chart.data.length ? (
              <div className="h-32" onClick={(event) => event.stopPropagation()}>
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

            {expandedChartKey === chart.key && chart.historyRows.length > 0 && (
              <div
                className="mt-4 border-t border-border pt-4 space-y-3"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Sort</span>
                  <Button
                    size="sm"
                    variant={sortField === "date" ? "default" : "outline"}
                    onClick={() => setSortField("date")}
                  >
                    Date
                  </Button>
                  <Button
                    size="sm"
                    variant={sortField === "score" ? "default" : "outline"}
                    onClick={() => setSortField("score")}
                  >
                    Score
                  </Button>
                  <Button
                    size="sm"
                    variant={sortOrder === "desc" ? "default" : "outline"}
                    onClick={() => setSortOrder("desc")}
                  >
                    Desc
                  </Button>
                  <Button
                    size="sm"
                    variant={sortOrder === "asc" ? "default" : "outline"}
                    onClick={() => setSortOrder("asc")}
                  >
                    Asc
                  </Button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {sortRows(chart.historyRows).map((row) => (
                    <div
                      key={row.id}
                      className="rounded-lg bg-secondary/40 border border-border px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span>
                      <span className="text-xs font-semibold text-foreground">{chart.formatValue(row.score)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Results;
