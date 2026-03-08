import { useEffect, useMemo, useState } from "react";
import { Wind, Eye, Gamepad2, Move3D, Activity, Ear, LineChart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth, useClerk, useUser } from "@clerk/react";
import TestCard from "@/components/TestCard";
import MobileLayout from "@/components/MobileLayout";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  HearingHistoryEntry,
  MotorHistoryEntry,
  RespiratoryHistoryEntry,
  loadHearingHistory,
  loadMotorHistory,
  loadRespiratoryHistory,
} from "@/lib/testHistory";

type GraphView = "hearing" | "respiratory" | "motor";
type HearingModeFilter = "all" | "speaker" | "headphone";

const chartConfig = {
  value: {
    label: "Value",
    color: "hsl(var(--primary))",
  },
};

const formatSessionLabel = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const Index = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { userId } = useAuth();
  const { signOut } = useClerk();
  const [graphView, setGraphView] = useState<GraphView>("hearing");
  const [hearingFilter, setHearingFilter] = useState<HearingModeFilter>("all");
  const [hearingHistory, setHearingHistory] = useState<HearingHistoryEntry[]>([]);
  const [respiratoryHistory, setRespiratoryHistory] = useState<RespiratoryHistoryEntry[]>([]);
  const [motorHistory, setMotorHistory] = useState<MotorHistoryEntry[]>([]);
  const [isGraphLoading, setIsGraphLoading] = useState(false);

  useEffect(() => {
    let isActive = true;

    const loadPreviewHistory = async () => {
      setIsGraphLoading(true);
      try {
        const [hearing, respiratory, motor] = await Promise.all([
          loadHearingHistory(userId),
          loadRespiratoryHistory(userId),
          loadMotorHistory(userId),
        ]);

        if (!isActive) return;

        setHearingHistory(hearing);
        setRespiratoryHistory(respiratory);
        setMotorHistory(motor);
      } finally {
        if (isActive) {
          setIsGraphLoading(false);
        }
      }
    };

    void loadPreviewHistory();

    return () => {
      isActive = false;
    };
  }, [userId]);

  const filteredHearingHistory = useMemo(() => {
    if (hearingFilter === "all") return hearingHistory;
    return hearingHistory.filter((entry) => entry.mode === hearingFilter);
  }, [hearingFilter, hearingHistory]);

  const graphData = useMemo(() => {
    if (graphView === "hearing") {
      return [...filteredHearingHistory]
        .slice(0, 10)
        .reverse()
        .map((entry) => ({
          name: formatSessionLabel(entry.createdAt),
          value: entry.tonesHeardPercent,
        }));
    }

    if (graphView === "respiratory") {
      return [...respiratoryHistory]
        .slice(0, 10)
        .reverse()
        .map((entry) => ({
          name: formatSessionLabel(entry.createdAt),
          value: Number(entry.rms.toFixed(2)),
        }));
    }

    return [...motorHistory]
      .slice(0, 10)
      .reverse()
      .map((entry) => ({
        name: formatSessionLabel(entry.createdAt),
        value: entry.tremorPercent,
      }));
  }, [filteredHearingHistory, graphView, motorHistory, respiratoryHistory]);

  const yDomain = graphView === "respiratory" ? undefined : ([0, 100] as const);
  const graphLabel =
    graphView === "hearing"
      ? "Hearing % Heard"
      : graphView === "respiratory"
        ? "Respiratory RMS"
        : "Motor Tremor %";

  return (
    <MobileLayout>
      {/* Header */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary animate-pulse-glow" />
          <h1 className="text-2xl font-bold text-gradient-primary">BioSync</h1>
        </div>
        <p className="text-xs font-mono text-muted-foreground tracking-wider uppercase">
          Biometric Testing Hub
        </p>

        <div className="glass rounded-lg p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">Active User</p>
            <p className="text-sm font-medium text-foreground">{user?.firstName ?? user?.username ?? "User"}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/")}>Welcome</Button>
            <Button size="sm" variant="ghost" onClick={() => void signOut({ redirectUrl: "/" })}>Logout</Button>
          </div>
        </div>
      </div>

      {/* Test Cards */}
      <div className="space-y-3">
        <TestCard
          title="Hearing Age"
          description="Progressive high-frequency tones · Tap when you hear each signal"
          icon={<Ear className="w-5 h-5 text-accent" />}
          status="ready"
          route="/test/hearing"
          accentClass="glow-accent"
        />
        <TestCard
          title="Respiratory Health"
          description="Forced exhalation into microphone · FFT frequency & amplitude analysis"
          icon={<Wind className="w-5 h-5 text-primary" />}
          status="ready"
          route="/test/respiratory"
        />
        <TestCard
          title="Cognitive & Pupil Response"
          description="High-brightness flash · Pupil constriction speed via facial tracking"
          icon={<Eye className="w-5 h-5 text-accent" />}
          status="ready"
          route="/test/pupil"
          accentClass="glow-accent"
        />
        <TestCard
          title="Reaction & Blink Test"
          description="Symbol recognition · Tap or blink response timing"
          icon={<Gamepad2 className="w-5 h-5 text-primary" />}
          status="ready"
          route="/test/reaction"
        />
        <TestCard
          title="Motor Control"
          description="Gyroscope steadiness · Crosshair tracking for micro-tremor detection"
          icon={<Move3D className="w-5 h-5 text-accent" />}
          status="ready"
          route="/test/motor"
          accentClass="glow-accent"
        />
      </div>

      {/* Live Graph Preview */}
      <div
        className="glass rounded-lg p-4 space-y-3 cursor-pointer"
        onClick={() => navigate("/results")}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            navigate("/results");
          }
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <LineChart className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-mono text-muted-foreground tracking-wider uppercase">Trend Preview</h3>
          </div>
          <span className="text-[10px] text-muted-foreground">Tap to expand</span>
        </div>

        <div className="grid grid-cols-3 gap-2" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant={graphView === "hearing" ? "default" : "outline"} onClick={() => setGraphView("hearing")}>Hearing</Button>
          <Button size="sm" variant={graphView === "respiratory" ? "default" : "outline"} onClick={() => setGraphView("respiratory")}>Resp</Button>
          <Button size="sm" variant={graphView === "motor" ? "default" : "outline"} onClick={() => setGraphView("motor")}>Motor</Button>
        </div>

        {graphView === "hearing" && (
          <div className="grid grid-cols-3 gap-2" onClick={(event) => event.stopPropagation()}>
            <Button size="sm" variant={hearingFilter === "all" ? "default" : "outline"} onClick={() => setHearingFilter("all")}>All</Button>
            <Button size="sm" variant={hearingFilter === "speaker" ? "default" : "outline"} onClick={() => setHearingFilter("speaker")}>Speaker</Button>
            <Button size="sm" variant={hearingFilter === "headphone" ? "default" : "outline"} onClick={() => setHearingFilter("headphone")}>Headphone</Button>
          </div>
        )}

        {isGraphLoading ? (
          <p className="text-xs text-muted-foreground">Loading trend data...</p>
        ) : graphData.length > 0 ? (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">{graphLabel}</p>
            <ChartContainer config={chartConfig} className="h-44 w-full">
              <RechartsLineChart data={graphData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} minTickGap={20} />
                <YAxis tickLine={false} axisLine={false} width={36} domain={yDomain} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2.5} dot={{ r: 2 }} />
              </RechartsLineChart>
            </ChartContainer>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No saved data yet for this view. Run a test to populate the graph.</p>
        )}
      </div>

      {/* Info */}
      <div className="glass rounded-lg p-4 space-y-2">
        <h3 className="text-xs font-mono text-muted-foreground tracking-wider">HOW IT WORKS</h3>
        <p className="text-xs text-secondary-foreground leading-relaxed">
          BioSync gives you direct access to five sensor-driven tests. Each test captures a
          different physiological dimension - auditory, respiratory, neurological, reflexive,
          and proprioceptive - so you can run and review tests from one place.
        </p>
      </div>

      {/* Bottom spacer */}
      <div className="h-8" />
    </MobileLayout>
  );
};

export default Index;
