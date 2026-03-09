import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import MobileLayout from "@/components/MobileLayout";
import {
  loadHearingHistory,
  loadMotorHistory,
  loadRespiratoryHistory,
  HearingHistoryEntry,
  MotorHistoryEntry,
  RespiratoryHistoryEntry,
} from "@/lib/testHistory";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

type Section = "hearing" | "respiratory" | "motor";
type HearingFilter = "all" | "speaker" | "headphone";

const chartConfig = {
  value: {
    label: "Value",
    color: "hsl(var(--primary))",
  },
};

const formatSessionLabel = (isoString: string, index: number) => {
  const date = new Date(isoString);
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day} #${index + 1}`;
};

const respiratoryHealthPercent = (rms: number, healthPercent?: number) => {
  if (typeof healthPercent === "number") {
    return Math.max(0, Math.min(100, Math.round(healthPercent)));
  }

  return Math.max(0, Math.min(100, Math.round(100 - rms * 85)));
};

const ResultsHistory = () => {
  const { userId } = useAuth();
  const [section, setSection] = useState<Section>("hearing");
  const [hearingFilter, setHearingFilter] = useState<HearingFilter>("all");
  const [hearingHistory, setHearingHistory] = useState<HearingHistoryEntry[]>([]);
  const [respiratoryHistory, setRespiratoryHistory] = useState<RespiratoryHistoryEntry[]>([]);
  const [motorHistory, setMotorHistory] = useState<MotorHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const [hearing, respiratory, motor] = await Promise.all([
        loadHearingHistory(userId),
        loadRespiratoryHistory(userId),
        loadMotorHistory(userId),
      ]);

      setHearingHistory(hearing);
      setRespiratoryHistory(respiratory);
      setMotorHistory(motor);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const filteredHearingHistory = useMemo(() => {
    if (hearingFilter === "all") return hearingHistory;
    return hearingHistory.filter((entry) => entry.mode === hearingFilter);
  }, [hearingFilter, hearingHistory]);

  const hearingChartData = useMemo(
    () =>
      [...filteredHearingHistory]
        .reverse()
        .map((entry, index) => ({
          name: formatSessionLabel(entry.createdAt, index),
          value: entry.tonesHeardPercent,
        })),
    [filteredHearingHistory],
  );

  const respiratoryChartData = useMemo(
    () =>
      [...respiratoryHistory]
        .reverse()
        .map((entry, index) => ({
          name: formatSessionLabel(entry.createdAt, index),
          value: respiratoryHealthPercent(entry.rms, entry.healthPercent),
        })),
    [respiratoryHistory],
  );

  const motorChartData = useMemo(
    () =>
      [...motorHistory]
        .reverse()
        .map((entry, index) => ({
          name: formatSessionLabel(entry.createdAt, index),
          value: entry.tremorPercent,
        })),
    [motorHistory],
  );

  const renderEmptyState = (message: string) => (
    <div className="glass rounded-lg p-4 text-xs text-muted-foreground">{message}</div>
  );

  const renderHearingSection = () => {
    if (!filteredHearingHistory.length) {
      return renderEmptyState("No hearing results yet for this filter. Complete a hearing test to populate this graph.");
    }

    return (
      <div className="space-y-3">
        <div className="glass rounded-lg p-3">
          <p className="text-xs font-mono text-muted-foreground">HEARING: PERCENT HEARD</p>
          <ChartContainer config={chartConfig} className="h-56 w-full pt-3">
            <LineChart data={hearingChartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} width={32} domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ChartContainer>
        </div>

        <div className="space-y-2">
          {filteredHearingHistory.slice(0, 8).map((entry: HearingHistoryEntry) => (
            <div key={entry.id} className="glass rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono text-muted-foreground uppercase">{entry.mode}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>
              <p className="text-sm text-foreground mt-1">
                Heard {entry.tonesHeard}/{entry.totalTones} ({entry.tonesHeardPercent}%)
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderRespiratorySection = () => {
    if (!respiratoryHistory.length) {
      return renderEmptyState("No respiratory results yet. Complete a respiratory test to populate lung health history.");
    }

    return (
      <div className="space-y-3">
        <div className="glass rounded-lg p-3">
          <p className="text-xs font-mono text-muted-foreground">RESPIRATORY: LUNG HEALTH %</p>
          <ChartContainer config={chartConfig} className="h-56 w-full pt-3">
            <LineChart data={respiratoryChartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} width={32} domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ChartContainer>
        </div>

        <div className="space-y-2">
          {respiratoryHistory.slice(0, 8).map((entry) => (
            <div key={entry.id} className="glass rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono text-muted-foreground uppercase">{entry.label}</p>
                <p className="text-[11px] text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>
              <p className="text-sm text-foreground mt-1">
                Lung Health {respiratoryHealthPercent(entry.rms, entry.healthPercent)}% · RMS {entry.rms.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMotorSection = () => {
    if (!motorHistory.length) {
      return renderEmptyState("No motor results yet. Complete a motor control test to populate tremor history.");
    }

    return (
      <div className="space-y-3">
        <div className="glass rounded-lg p-3">
          <p className="text-xs font-mono text-muted-foreground">MOTOR: TREMOR PERCENT</p>
          <ChartContainer config={chartConfig} className="h-56 w-full pt-3">
            <LineChart data={motorChartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} width={32} domain={[0, 100]} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ChartContainer>
        </div>

        <div className="space-y-2">
          {motorHistory.slice(0, 8).map((entry) => (
            <div key={entry.id} className="glass rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono text-muted-foreground uppercase">Motor Session</p>
                <p className="text-[11px] text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>
              <p className="text-sm text-foreground mt-1">Tremor {entry.tremorPercent}%</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <MobileLayout title="Past Results" showBack>
      <div className="space-y-4 pt-4">
        <div className="glass rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">History and Trends</p>
          </div>
          <p className="text-xs text-muted-foreground">
            View previous results and trend lines for Hearing, Respiratory, and Motor tests.
          </p>
          <Button variant="outline" size="sm" onClick={() => void refreshHistory()} disabled={isLoading}>
            {isLoading ? "Refreshing..." : "Refresh Results"}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button variant={section === "hearing" ? "default" : "outline"} size="sm" onClick={() => setSection("hearing")}>Hearing</Button>
          <Button variant={section === "respiratory" ? "default" : "outline"} size="sm" onClick={() => setSection("respiratory")}>Respiratory</Button>
          <Button variant={section === "motor" ? "default" : "outline"} size="sm" onClick={() => setSection("motor")}>Motor</Button>
        </div>

        {section === "hearing" && (
          <div className="grid grid-cols-3 gap-2">
            <Button variant={hearingFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setHearingFilter("all")}>All</Button>
            <Button variant={hearingFilter === "speaker" ? "default" : "outline"} size="sm" onClick={() => setHearingFilter("speaker")}>Speaker</Button>
            <Button variant={hearingFilter === "headphone" ? "default" : "outline"} size="sm" onClick={() => setHearingFilter("headphone")}>Headphone</Button>
          </div>
        )}

        {section === "hearing" && renderHearingSection()}
        {section === "respiratory" && renderRespiratorySection()}
        {section === "motor" && renderMotorSection()}
      </div>
    </MobileLayout>
  );
};

export default ResultsHistory;
