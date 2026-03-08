import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Move3D } from "lucide-react";
import { useAuth } from "@clerk/react";
import MobileLayout from "@/components/MobileLayout";
import { Button } from "@/components/ui/button";
import { saveMotorHistory } from "@/lib/testHistory";

type MotionPermission = "unknown" | "granted" | "denied" | "unsupported";

type TestResults = {
  accuracy: number;
  stability: number;
  tremorIndex: number;
  tremorLabel: "Low" | "Moderate" | "High";
};

type StatsAccumulator = {
  totalSamples: number;
  onTargetSamples: number;
  movementDeltas: number[];
  previousPoint: { x: number; y: number } | null;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const average = (arr: number[]) =>
  arr.length ? arr.reduce((sum, value) => sum + value, 0) / arr.length : 0;

const standardDeviation = (arr: number[]) => {
  if (!arr.length) return 0;
  const mean = average(arr);
  const variance =
    arr.reduce((sum, value) => sum + (value - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
};

const getTremorLabel = (tremorIndex: number): "Low" | "Moderate" | "High" => {
  if (tremorIndex < 35) return "Low";
  if (tremorIndex < 65) return "Moderate";
  return "High";
};

const MotorTest = () => {
  const { userId } = useAuth();
  const [phase, setPhase] = useState<"idle" | "testing" | "done">("idle");
  const [targetPos, setTargetPos] = useState({ x: 50, y: 50 });
  const [crosshairPos, setCrosshairPos] = useState({ x: 50, y: 50 });
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [motionPermission, setMotionPermission] =
    useState<MotionPermission>("unknown");
  const [results, setResults] = useState<TestResults>({
    accuracy: 0,
    stability: 0,
    tremorIndex: 0,
    tremorLabel: "Low",
  });

  const intervalRef = useRef<number | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const targetPosRef = useRef(targetPos);
  const crosshairPosRef = useRef(crosshairPos);
  const wasOnTargetRef = useRef(false);
  const orientationOriginRef = useRef<{ beta: number; gamma: number } | null>(
    null,
  );
  const statsRef = useRef<StatsAccumulator>({
    totalSamples: 0,
    onTargetSamples: 0,
    movementDeltas: [],
    previousPoint: null,
  });

  const usesGyro = motionPermission === "granted";

  useEffect(() => {
    targetPosRef.current = targetPos;
  }, [targetPos]);

  useEffect(() => {
    crosshairPosRef.current = crosshairPos;
  }, [crosshairPos]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("DeviceOrientationEvent" in window)) {
      setMotionPermission("unsupported");
      return;
    }

    const OrientationEventWithPermission = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        })
      | undefined;

    // iOS exposes requestPermission; other browsers typically allow orientation by default.
    if (OrientationEventWithPermission?.requestPermission) {
      setMotionPermission("unknown");
    } else {
      setMotionPermission("granted");
    }
  }, []);

  const updateCrosshair = useCallback((x: number, y: number) => {
    if (phase !== "testing") return;

    const next = {
      x: clamp(x, 0, 100),
      y: clamp(y, 0, 100),
    };

    crosshairPosRef.current = next;
    setCrosshairPos(next);

    const currentTarget = targetPosRef.current;
    const distance = Math.hypot(next.x - currentTarget.x, next.y - currentTarget.y);
    const onTarget = distance <= 8;
    if (onTarget && !wasOnTargetRef.current) {
      setScore((prev) => prev + 1);
    }
    wasOnTargetRef.current = onTarget;
  }, [phase]);

  const requestMotionPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setMotionPermission("unsupported");
      return;
    }

    const OrientationEventWithPermission = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        })
      | undefined;

    if (!OrientationEventWithPermission?.requestPermission) {
      setMotionPermission("granted");
      return;
    }

    try {
      const permission = await OrientationEventWithPermission.requestPermission();
      setMotionPermission(permission === "granted" ? "granted" : "denied");
    } catch {
      setMotionPermission("denied");
    }
  }, []);

  const startTest = useCallback(() => {
    setPhase("testing");
    setScore(0);
    setElapsed(0);
    setCrosshairPos({ x: 50, y: 50 });
    setTargetPos({ x: 50, y: 50 });
    orientationOriginRef.current = null;
    wasOnTargetRef.current = false;
    statsRef.current = {
      totalSamples: 0,
      onTargetSamples: 0,
      movementDeltas: [],
      previousPoint: null,
    };
    targetPosRef.current = { x: 50, y: 50 };
    crosshairPosRef.current = { x: 50, y: 50 };
  }, []);

  const resetToIdle = useCallback(() => {
    setPhase("idle");
    setElapsed(0);
  }, []);

  // Move target randomly
  useEffect(() => {
    if (phase !== "testing") return;
    const id = setInterval(() => {
      const nextTarget = {
        x: 20 + Math.random() * 60,
        y: 20 + Math.random() * 60,
      };
      targetPosRef.current = nextTarget;
      setTargetPos(nextTarget);
    }, 2000);
    return () => clearInterval(id);
  }, [phase]);

  // Timer
  useEffect(() => {
    if (phase !== "testing") return;
    const start = Date.now();
    intervalRef.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      setElapsed(s);
      if (s >= 15) {
        setPhase("done");
      }
    }, 100);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase]);

  // Sample at fixed intervals so metrics are independent of device event rate.
  useEffect(() => {
    if (phase !== "testing") return;

    const id = window.setInterval(() => {
      const currentPoint = crosshairPosRef.current;
      const currentTarget = targetPosRef.current;
      const stats = statsRef.current;

      stats.totalSamples += 1;

      const distance = Math.hypot(
        currentPoint.x - currentTarget.x,
        currentPoint.y - currentTarget.y,
      );

      if (distance <= 8) {
        stats.onTargetSamples += 1;
      }

      if (stats.previousPoint) {
        const delta = Math.hypot(
          currentPoint.x - stats.previousPoint.x,
          currentPoint.y - stats.previousPoint.y,
        );
        stats.movementDeltas.push(delta);
      }

      stats.previousPoint = currentPoint;
    }, 50);

    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "testing" || !usesGyro) return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;

      if (!orientationOriginRef.current) {
        orientationOriginRef.current = {
          beta: event.beta,
          gamma: event.gamma,
        };
      }

      const origin = orientationOriginRef.current;
      const relativeGamma = event.gamma - origin.gamma;
      const relativeBeta = event.beta - origin.beta;

      const x = 50 + relativeGamma * 1.4;
      const y = 50 + relativeBeta * 1.2;
      updateCrosshair(x, y);
    };

    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [phase, updateCrosshair, usesGyro]);

  // Track touch/pointer
  const handlePointerMove = (e: React.PointerEvent) => {
    if (phase !== "testing" || !areaRef.current) return;
    const rect = areaRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    updateCrosshair(x, y);
  };

  useEffect(() => {
    if (phase !== "done") return;
    const stats = statsRef.current;

    const accuracy = stats.totalSamples
      ? Math.round((stats.onTargetSamples / stats.totalSamples) * 100)
      : 0;

    const meanDelta = average(stats.movementDeltas);
    const deltaStd = standardDeviation(stats.movementDeltas);
    const tremorIndex = clamp(Math.round(meanDelta * 4 + deltaStd * 8), 0, 100);
    const stability = clamp(Math.round(100 - (meanDelta * 5 + deltaStd * 7)), 0, 100);

    const nextResults = {
      accuracy,
      stability,
      tremorIndex,
      tremorLabel: getTremorLabel(tremorIndex),
    };

    setResults(nextResults);
    saveMotorHistory({
      tremorPercent: nextResults.tremorIndex,
      stabilityPercent: nextResults.stability,
      accuracyPercent: nextResults.accuracy,
      targetHits: score,
    }, userId);
  }, [phase, score, userId]);

  const controlMode = useMemo(() => {
    if (usesGyro) return "Gyroscope";
    return "Touch";
  }, [usesGyro]);

  return (
    <MobileLayout title="Motor Control" showBack>
      <div className="flex flex-col items-center text-center space-y-6 pt-4">
        {phase === "idle" && (
          <>
            <div className="w-28 h-28 rounded-full bg-secondary flex items-center justify-center glow-accent">
              <Move3D className="w-10 h-10 text-accent" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Gyroscope Steadiness</h2>
              <p className="text-xs text-muted-foreground max-w-[260px]">
                Keep the crosshair on the moving target. On iPhone, tilt your phone to
                steer with gyroscope; touch control is available as fallback.
              </p>
            </div>
            <div className="w-full glass rounded-lg p-4 space-y-2">
              <span className="text-xs font-mono text-muted-foreground">SENSORS USED</span>
              <div className="flex flex-wrap gap-2">
                {["Gyroscope", "Accelerometer", "Touch"].map((s) => (
                  <span key={s} className="text-[10px] font-mono bg-secondary px-2 py-1 rounded text-secondary-foreground">{s}</span>
                ))}
              </div>
            </div>

            {motionPermission === "unknown" && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={requestMotionPermission}
              >
                Enable Motion Access (iPhone)
              </Button>
            )}

            {motionPermission === "denied" && (
              <p className="text-[11px] text-muted-foreground">
                Motion access denied. You can still complete the test with touch.
              </p>
            )}

            <Button className="w-full" onClick={startTest}>
              Begin Test
            </Button>
          </>
        )}

        {phase === "testing" && (
          <>
            <div className="flex justify-between w-full">
              <span className="text-xs font-mono text-muted-foreground">{15 - elapsed}s remaining</span>
              <span className="text-xs font-mono text-primary">
                Control: {controlMode}
              </span>
            </div>
            <div
              ref={areaRef}
              onPointerMove={handlePointerMove}
              className="w-full aspect-square bg-secondary rounded-lg relative overflow-hidden touch-none cursor-none border border-border"
            >
              {/* Grid */}
              <svg className="absolute inset-0 w-full h-full opacity-10">
                {Array.from({ length: 10 }, (_, i) => (
                  <g key={i}>
                    <line x1={`${i * 10}%`} y1="0" x2={`${i * 10}%`} y2="100%" stroke="currentColor" />
                    <line x1="0" y1={`${i * 10}%`} x2="100%" y2={`${i * 10}%`} stroke="currentColor" />
                  </g>
                ))}
              </svg>

              {/* Target */}
              <div
                className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 ease-in-out"
                style={{ left: `${targetPos.x}%`, top: `${targetPos.y}%` }}
              >
                <div className="w-full h-full rounded-full border-2 border-accent animate-pulse-glow" />
                <div className="absolute inset-2 rounded-full bg-accent/40" />
              </div>

              {/* Crosshair */}
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: `${crosshairPos.x}%`, top: `${crosshairPos.y}%` }}
              >
                <Crosshair className="w-6 h-6 text-primary" />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Keep the crosshair centered on the moving ring for maximum accuracy.
            </p>
          </>
        )}

        {phase === "done" && (
          <>
            <div className="w-28 h-28 rounded-full bg-secondary flex items-center justify-center glow-accent">
              <Move3D className="w-10 h-10 text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Test Complete</h2>
            <div className="grid grid-cols-2 gap-3 w-full">
              {[
                { label: "Accuracy", value: `${results.accuracy}%` },
                { label: "Target Hits", value: `${score}` },
                {
                  label: "Tremor Index",
                  value: `${results.tremorIndex} (${results.tremorLabel})`,
                },
                { label: "Stability", value: `${results.stability}%` },
              ].map((m) => (
                <div key={m.label} className="glass rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-accent">{m.value}</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={resetToIdle}>
              Retake Test
            </Button>
          </>
        )}
      </div>
    </MobileLayout>
  );
};

export default MotorTest;
