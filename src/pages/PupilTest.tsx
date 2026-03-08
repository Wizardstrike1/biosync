import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, ScanFace } from "lucide-react";
import { useAuth } from "@clerk/react";
import MobileLayout from "@/components/MobileLayout";
import { Button } from "@/components/ui/button";
import { saveEyeHistory } from "@/lib/testHistory";

const getDefaultWsUrl = () => {
  if (typeof window === "undefined") return "ws://localhost:8000/ws/gaze";
  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (isLocal) return "ws://localhost:8000/ws/gaze";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${host}:8000/ws/gaze`;
};

const WS_URL = import.meta.env.VITE_EYE_TRACKER_WS_URL ?? getDefaultWsUrl();
const GAZE_CLOUD_SCRIPT_URL = "https://api.gazerecorder.com/GazeCloudAPI.js";
const HIT_RADIUS = 120;
const SQUARE_SIZE = 30;
const TOTAL_TRIALS = 5;
const HIT_COOLDOWN_MS = 1000;
const CONNECT_TIMEOUT_MS = 5000;
const MAX_CONNECT_RETRIES = 2;
const RETRY_DELAY_MS = 1200;
const MIN_TARGET_SPAN = 80;
const TRIAL_TIMEOUT_MS = 5000;
const TARGET_BOX_INSET_RATIO = 0.18;
const TARGET_CENTER_JITTER_PX = 5;
const DIMS_BASE_W = 320;
const DIMS_BASE_H = 420;
const DIMS_RANDOM_X_RANGE = 50;
const DIMS_RANDOM_Y_RANGE = 100;

const CALIB_POINTS = (w: number, h: number) => [
  { x: 80, y: 80 },
  { x: w / 2, y: 80 },
  { x: w - 80, y: 80 },
  { x: 80, y: h / 2 },
  { x: w / 2, y: h / 2 },
  { x: w - 80, y: h / 2 },
  { x: 80, y: h - 80 },
  { x: w / 2, y: h - 80 },
  { x: w - 80, y: h - 80 },
];

type Phase = "setup" | "calibrating" | "testing" | "result";

type Trial = {
  reaction_time: number;
  distance: number;
};

type Telemetry = {
  ear: number | null;
  earBaseline: number | null;
  earDropThreshold: number | null;
  earClosed: boolean;
  blinkScore: number | null;
  leftBlinkScore: number | null;
  rightBlinkScore: number | null;
  blinkEvent: boolean;
  blinkStart: boolean;
  blinkEnd: boolean;
  blinkClosed: boolean;
  headOffsetX: number | null;
  headOffsetY: number | null;
  frameId: number | null;
};

type TrackerDebug = {
  status: string;
  statusAgeMs: number | null;
  cameraOpen: boolean | null;
  cameraIndex: number | null;
  noFrameCount: number;
  noFaceCount: number;
  okCount: number;
};

type GazeCloudApi = {
  OnResult?: (gazeData: { docX?: number; docY?: number }) => void;
  OnCalibrationComplete?: () => void;
  OnCamDenied?: () => void;
  OnError?: (msg: string) => void;
  UseClickRecalibration?: boolean;
  StartEyeTracking: () => void;
  StopEyeTracking?: () => void;
};

const CALIB_DWELL_MS = 2200;

const PupilTest = () => {
  const { userId } = useAuth();
  const [phase, setPhase] = useState<Phase>("setup");
  const [calibIndex, setCalibIndex] = useState(0);
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const [gazePos, setGazePos] = useState<{ x: number; y: number } | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [status, setStatus] = useState("Click Start to begin");
  const [trackingProvider, setTrackingProvider] = useState<"gazecloud">("gazecloud");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isGazeCloudLoading, setIsGazeCloudLoading] = useState(false);
  const [timingEnabled, setTimingEnabled] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [showTapFallback, setShowTapFallback] = useState(false);
  const [dims, setDims] = useState({ w: DIMS_BASE_W, h: DIMS_BASE_H });
  const [telemetry, setTelemetry] = useState<Telemetry>({
    ear: null,
    earBaseline: null,
    earDropThreshold: null,
    earClosed: false,
    blinkScore: null,
    leftBlinkScore: null,
    rightBlinkScore: null,
    blinkEvent: false,
    blinkStart: false,
    blinkEnd: false,
    blinkClosed: false,
    headOffsetX: null,
    headOffsetY: null,
    frameId: null,
  });
  const [blinkCount, setBlinkCount] = useState(0);
  const [lastBlinkAt, setLastBlinkAt] = useState<number | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const [trackerDebug, setTrackerDebug] = useState<TrackerDebug>({
    status: "-",
    statusAgeMs: null,
    cameraOpen: null,
    cameraIndex: null,
    noFrameCount: 0,
    noFaceCount: 0,
    okCount: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const browserStreamRef = useRef<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const testStartRef = useRef<number | null>(null);
  const trialsRef = useRef<Trial[]>([]);
  const calibIndexRef = useRef(0);
  const lastHitRef = useRef<number>(0);
  const trialDeadlineRef = useRef<number | null>(null);
  const initialSpawnPendingRef = useRef(false);
  const doneRef = useRef(false);
  const manualCloseRef = useRef(false);
  const backendErrorActiveRef = useRef(false);
  const pointStartRef = useRef<number | null>(null);
  const gazeCloudStartedRef = useRef(false);
  const gazeCloudLoadedRef = useRef(false);
  const timingEnabledRef = useRef(false);
  const reloadTimeoutRef = useRef<number | null>(null);
  const savedResultRef = useRef(false);

  const getGazeCloud = useCallback(() => {
    const w = window as Window & { GazeCloudAPI?: GazeCloudApi };
    return w.GazeCloudAPI ?? null;
  }, []);

  const loadGazeCloudScript = useCallback(async () => {
    if (gazeCloudLoadedRef.current && getGazeCloud()) return;

    const existingScript = document.querySelector(`script[src="${GAZE_CLOUD_SCRIPT_URL}"]`) as HTMLScriptElement | null;
    if (existingScript) {
      await new Promise<void>((resolve, reject) => {
        if (getGazeCloud()) {
          resolve();
          return;
        }
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("GazeCloud script failed to load")), { once: true });
      });
      gazeCloudLoadedRef.current = true;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GAZE_CLOUD_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("GazeCloud script failed to load"));
      document.body.appendChild(script);
    });

    gazeCloudLoadedRef.current = true;
  }, [getGazeCloud]);
  const advanceCalibrationPoint = useCallback((reason: "blink" | "tap" | "dwell") => {
    const points = CALIB_POINTS(dims.w, dims.h);
    const idx = calibIndexRef.current;
    if (idx >= points.length) return;

    const pt = points[idx];
    wsRef.current?.send(
      JSON.stringify({
        type: "calibrate",
        screen_x: pt.x,
        screen_y: pt.y,
      }),
    );

    if (idx + 1 >= points.length) {
      wsRef.current?.send(JSON.stringify({ type: "finish_calibration" }));
      pointStartRef.current = null;
      setStatus("Finishing calibration...");
      return;
    }

    pointStartRef.current = Date.now();
    setCalibIndex(idx + 1);

    if (reason === "dwell") {
      setStatus(`Point ${idx + 2}/${points.length} - auto-confirmed; blink or tap for next`);
    } else if (reason === "tap") {
      setStatus(`Point ${idx + 2}/${points.length} - tap or blink to confirm`);
    } else {
      setStatus(`Point ${idx + 2}/${points.length} - look at dot, blink to confirm`);
    }
  }, [dims]);


  useEffect(() => {
    trialsRef.current = trials;
  }, [trials]);

  useEffect(() => {
    calibIndexRef.current = calibIndex;
  }, [calibIndex]);

  useEffect(() => {
    timingEnabledRef.current = timingEnabled;
  }, [timingEnabled]);

  const beginTimedTrials = useCallback((readyStatus: string) => {
    setTimingEnabled(false);
    timingEnabledRef.current = false;
    doneRef.current = false;
    lastHitRef.current = 0;
    testStartRef.current = null;
    trialsRef.current = [];
    setTrials([]);
    setTarget(null);
    setPhase("testing");
    setStatus(readyStatus);
    initialSpawnPendingRef.current = true;

    // Enable timing only after the testing phase is entered and state is reset.
    window.setTimeout(() => {
      setTimingEnabled(true);
      timingEnabledRef.current = true;
    }, 0);
  }, []);

  useEffect(() => {
    const randomOffsetX = (Math.random() * 2 - 1) * DIMS_RANDOM_X_RANGE;
    const randomOffsetY = (Math.random() * 2 - 1) * DIMS_RANDOM_Y_RANGE;

    setDims({
      w: DIMS_BASE_W + randomOffsetX,
      h: DIMS_BASE_H + randomOffsetY,
    });
  }, [phase]);

  const newTarget = useCallback((w: number, h: number) => {
    const margin = SQUARE_SIZE + 20;
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 0;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 0;
    const safeW = Number.isFinite(w) && w > margin * 2 + MIN_TARGET_SPAN ? w : viewportW;
    const safeH = Number.isFinite(h) && h > margin * 2 + MIN_TARGET_SPAN ? h : viewportH;

    if (!safeW || !safeH) {
      const fallback = { x: 160, y: 220 };
      setTarget(fallback);
      testStartRef.current = Date.now();
      trialDeadlineRef.current = Date.now() + TRIAL_TIMEOUT_MS;
      return;
    }

    // Spawn anywhere in the usable frame so trials exercise wide visual coverage.
    const minX = margin;
    const maxX = Math.max(minX + MIN_TARGET_SPAN, safeW - margin);
    const minY = margin;
    const maxY = Math.max(minY + MIN_TARGET_SPAN, safeH - margin);

    const nextX = minX + Math.random() * (maxX - minX);
    const nextY = minY + Math.random() * (maxY - minY);

    const next = {
      x: Math.max(minX, Math.min(maxX, nextX)),
      y: Math.max(minY, Math.min(maxY, nextY)),
    };

    setTarget(next);
    testStartRef.current = Date.now();
    trialDeadlineRef.current = Date.now() + TRIAL_TIMEOUT_MS;
  }, []);

  useEffect(() => {
    if (phase !== "testing" || !timingEnabledRef.current || !target || !gazePos || doneRef.current) return;

    const dx = gazePos.x - target.x;
    const dy = gazePos.y - target.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= HIT_RADIUS && testStartRef.current) {
      const now = Date.now();
      if (now - lastHitRef.current < HIT_COOLDOWN_MS) return;
      lastHitRef.current = now;

      const reaction = (now - testStartRef.current) / 1000;
      const updated = [...trialsRef.current, { reaction_time: reaction, distance: dist }];
      trialsRef.current = updated;
      setTrials(updated);

      if (updated.length >= TOTAL_TRIALS) {
        doneRef.current = true;
        setTarget(null);
        trialDeadlineRef.current = null;
        setPhase("result");
      } else {
        newTarget(dims.w, dims.h);
      }
    }
  }, [dims, gazePos, newTarget, phase, target]);

  useEffect(() => {
    if (phase !== "testing" || !timingEnabled || !target || doneRef.current) return;

    const intervalId = window.setInterval(() => {
      if (!trialDeadlineRef.current || doneRef.current) return;
      if (Date.now() < trialDeadlineRef.current) return;

      const updated = [...trialsRef.current, { reaction_time: TRIAL_TIMEOUT_MS / 1000, distance: HIT_RADIUS + 1 }];
      trialsRef.current = updated;
      setTrials(updated);

      if (updated.length >= TOTAL_TRIALS) {
        doneRef.current = true;
        setTarget(null);
        trialDeadlineRef.current = null;
        setPhase("result");
      } else {
        newTarget(dims.w, dims.h);
      }
    }, 200);

    return () => window.clearInterval(intervalId);
  }, [dims, newTarget, phase, target, timingEnabled]);

  const connect = useCallback((attempt = 0) => {
    if (isConnecting) return;

    manualCloseRef.current = false;
    setIsConnecting(true);
    setStatus(`Connecting to eye tracker at ${WS_URL} ...`);

    const timeout = window.setTimeout(() => {
      setIsConnecting(false);
      if (attempt < MAX_CONNECT_RETRIES) {
        setStatus(`Connection timed out. Retrying (${attempt + 1}/${MAX_CONNECT_RETRIES}) ...`);
        window.setTimeout(() => connect(attempt + 1), RETRY_DELAY_MS);
      } else {
        setStatus("Connection timed out. Ensure backend is running on port 8000.");
      }
      wsRef.current?.close();
    }, CONNECT_TIMEOUT_MS);

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      window.clearTimeout(timeout);
      setIsConnecting(false);
      backendErrorActiveRef.current = false;
      setTimingEnabled(false);
      timingEnabledRef.current = false;
      ws.send(JSON.stringify({ type: "reset" }));
      setPhase("calibrating");
      setCalibIndex(0);
      calibIndexRef.current = 0;
      pointStartRef.current = Date.now();
      setStatus("Look at first dot - blink to confirm");
    };

    ws.onerror = () => {
      window.clearTimeout(timeout);
      setIsConnecting(false);
      if (attempt < MAX_CONNECT_RETRIES) {
        setStatus(`Connection failed. Retrying (${attempt + 1}/${MAX_CONNECT_RETRIES}) ...`);
        window.setTimeout(() => connect(attempt + 1), RETRY_DELAY_MS);
      } else {
        setStatus("Could not connect to eye-tracker backend. Check server on :8000.");
      }
    };

    ws.onclose = () => {
      window.clearTimeout(timeout);
      setIsConnecting(false);
      if (manualCloseRef.current) {
        return;
      }
      if (attempt < MAX_CONNECT_RETRIES && phase !== "result") {
        setStatus(`Connection dropped. Reconnecting (${attempt + 1}/${MAX_CONNECT_RETRIES}) ...`);
        window.setTimeout(() => connect(attempt + 1), RETRY_DELAY_MS);
        return;
      }
      if (phase !== "result") {
        if (backendErrorActiveRef.current) {
          return;
        }
        setStatus("Disconnected from backend");
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "backend_error") {
        backendErrorActiveRef.current = true;
        setPhase("setup");
        setStatus(`Backend error: ${data.message}`);
        return;
      }

      if (data.type === "tracker_debug") {
        const now = Date.now();
        setLastMessageAt(now);
        setTrackerDebug({
          status: typeof data.status === "string" ? data.status : "unknown",
          statusAgeMs: typeof data.status_age_ms === "number" ? data.status_age_ms : null,
          cameraOpen: typeof data.camera_open === "boolean" ? data.camera_open : null,
          cameraIndex: typeof data.camera_index === "number" ? data.camera_index : null,
          noFrameCount: typeof data.no_frame_count === "number" ? data.no_frame_count : 0,
          noFaceCount: typeof data.no_face_count === "number" ? data.no_face_count : 0,
          okCount: typeof data.ok_count === "number" ? data.ok_count : 0,
        });
        return;
      }

      if (data.type === "reset_complete") {
        setShowTapFallback(false);
        pointStartRef.current = Date.now();
        setStatus("Ready - look at first dot and blink");
      }
      if (data.type === "calibration_recorded") {
        setShowTapFallback(false);
        setStatus("Point confirmed");
      }
      if (data.type === "calibration_complete") {
        beginTimedTrials("Look at the red square");
      }
      if (data.type === "calibration_error") {
        setIsConnecting(false);
        setStatus(`Calibration failed: ${data.message}`);
        setPhase("setup");
      }

      if (data.type === "gaze") {
        const now = Date.now();
        setMessageCount((count) => count + 1);
        setLastMessageAt(now);

        const blinkEvent = Boolean(data.blink || data.blink_start || data.blink_end);
        if (blinkEvent) {
          setBlinkCount((count) => count + 1);
          setLastBlinkAt(now);
        }

        setShowTapFallback(true);
        setTelemetry({
          ear: typeof data.ear === "number" ? data.ear : null,
          earBaseline: typeof data.ear_baseline === "number" ? data.ear_baseline : null,
          earDropThreshold: typeof data.ear_drop_threshold === "number" ? data.ear_drop_threshold : null,
          earClosed: Boolean(data.ear_closed),
          blinkScore: typeof data.blend_blink_score === "number" ? data.blend_blink_score : null,
          leftBlinkScore: typeof data.left_blink_score === "number" ? data.left_blink_score : null,
          rightBlinkScore: typeof data.right_blink_score === "number" ? data.right_blink_score : null,
          blinkEvent,
          blinkStart: Boolean(data.blink_start),
          blinkEnd: Boolean(data.blink_end),
          blinkClosed: Boolean(data.blink_closed),
          headOffsetX: typeof data.head_offset_x === "number" ? data.head_offset_x : null,
          headOffsetY: typeof data.head_offset_y === "number" ? data.head_offset_y : null,
          frameId: typeof data.frame_id === "number" ? data.frame_id : null,
        });

        if (phase === "calibrating") {
          const shouldConfirmBlink = Boolean(data.blink || data.blink_end || data.blink_start);
          if (shouldConfirmBlink) {
            advanceCalibrationPoint("blink");
          } else {
            const now = Date.now();
            if (!pointStartRef.current) pointStartRef.current = now;
            if (now - pointStartRef.current >= CALIB_DWELL_MS) {
              advanceCalibrationPoint("dwell");
            }
          }
        }

        if (data.calibrated && data.gaze_x !== undefined && !doneRef.current) {
          setIsConnecting(false);
          setGazePos({ x: data.gaze_x, y: data.gaze_y });
        }
      }
    };
  }, [advanceCalibrationPoint, beginTimedTrials, isConnecting, phase]);

  const confirmCalibrationPoint = useCallback(() => {
    if (phase !== "calibrating") return;
    advanceCalibrationPoint("tap");
  }, [advanceCalibrationPoint, phase]);

  useEffect(() => {
    if (phase === "testing" && timingEnabled) {
      doneRef.current = false;
      if (initialSpawnPendingRef.current || !target) {
        initialSpawnPendingRef.current = false;
        newTarget(dims.w, dims.h);
      }
    }
  }, [dims, newTarget, phase, target, timingEnabled]);

  useEffect(() => {
    if (phase !== "testing" || !timingEnabled || target || doneRef.current) return;

    const timeoutId = window.setTimeout(() => {
      if (!doneRef.current && !target) {
        newTarget(dims.w, dims.h);
      }
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [dims, newTarget, phase, target, timingEnabled]);

  useEffect(() => {
    if (phase !== "result") return;

    if (!savedResultRef.current && trialsRef.current.length > 0) {
      const avgReactionMs = Math.round(
        (trialsRef.current.reduce((sum, trial) => sum + trial.reaction_time, 0) / trialsRef.current.length) * 1000,
      );
      const avgDistancePx = Math.round(
        trialsRef.current.reduce((sum, trial) => sum + trial.distance, 0) / trialsRef.current.length,
      );

      saveEyeHistory(
        {
          avgReactionMs,
          avgDistancePx,
          trialCount: trialsRef.current.length,
        },
        userId,
      );
      savedResultRef.current = true;
    }

    setStatus("Test complete. Refreshing page...");
    reloadTimeoutRef.current = window.setTimeout(() => {
      window.location.reload();
    }, 1200);

    return () => {
      if (reloadTimeoutRef.current) {
        window.clearTimeout(reloadTimeoutRef.current);
        reloadTimeoutRef.current = null;
      }
    };
  }, [phase, userId]);

  useEffect(() => {
    return () => {
      if (reloadTimeoutRef.current) {
        window.clearTimeout(reloadTimeoutRef.current);
        reloadTimeoutRef.current = null;
      }
      manualCloseRef.current = true;
      wsRef.current?.close();
      browserStreamRef.current?.getTracks().forEach((track) => track.stop());
      browserStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!previewVideoRef.current || !browserStreamRef.current) return;
    previewVideoRef.current.srcObject = browserStreamRef.current;
  }, [phase]);

  const requestBrowserCameraAccess = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("Camera API unavailable. Use Safari/Chrome over HTTPS or localhost.");
      return false;
    }

    const isLocalHost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!window.isSecureContext && !isLocalHost) {
      setStatus("Camera permission requires HTTPS on mobile browsers. Use HTTPS and retry.");
      return false;
    }

    setStatus("Requesting camera permission...");

    const constraintsToTry: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: "user" } }, audio: false },
      { video: true, audio: false },
    ];

    let lastError: unknown = null;

    for (const constraints of constraintsToTry) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        browserStreamRef.current?.getTracks().forEach((track) => track.stop());
        browserStreamRef.current = stream;
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
        }
        setCameraReady(true);
        setStatus("Camera access granted. Connecting to eye tracker...");
        return true;
      } catch (error) {
        lastError = error;
      }
    }

    const errorName = lastError && typeof lastError === "object" && "name" in lastError
      ? String((lastError as { name?: string }).name)
      : "UnknownError";

    if (errorName === "NotReadableError" || errorName === "AbortError") {
      setCameraReady(false);
      setStatus("Camera appears busy. Closing other camera apps may help; continuing to backend...");
      return true;
    }

    if (errorName === "NotFoundError") {
      setCameraReady(false);
      setStatus("No camera found on this device.");
      return false;
    }

    if (errorName === "NotAllowedError" || errorName === "SecurityError") {
      setCameraReady(false);
      setStatus("Camera permission denied. Enable camera in browser/site settings and retry.");
      return false;
    }

    setCameraReady(false);
    setStatus(`Camera check failed (${errorName}). Continuing may still work with backend camera.`);
    return true;
  }, []);

  const handleStart = useCallback(async () => {
    if (!cameraReady || !browserStreamRef.current) {
      const granted = await requestBrowserCameraAccess();
      if (!granted) return;
    }

    connect();
  }, [cameraReady, connect, requestBrowserCameraAccess]);

  const handleStartGazeCloud = useCallback(async () => {
    if (!cameraReady || !browserStreamRef.current) {
      const granted = await requestBrowserCameraAccess();
      if (!granted) return;
    }

    try {
      setIsGazeCloudLoading(true);
      setStatus("Loading GazeCloud...");
      await loadGazeCloudScript();

      const api = getGazeCloud();
      if (!api) {
        setStatus("GazeCloud API unavailable after load");
        return;
      }

      api.OnResult = (gazeData) => {
        const docX = typeof gazeData?.docX === "number" ? gazeData.docX : null;
        const docY = typeof gazeData?.docY === "number" ? gazeData.docY : null;
        if (docX === null || docY === null) return;

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = Math.max(0, Math.min(rect.width, docX - rect.left));
        const y = Math.max(0, Math.min(rect.height, docY - rect.top));

        const now = Date.now();
        setMessageCount((count) => count + 1);
        setLastMessageAt(now);
        setTrackerDebug((prev) => ({
          ...prev,
          status: "gazecloud_ok",
          statusAgeMs: 0,
          cameraOpen: true,
          cameraIndex: prev.cameraIndex,
          okCount: prev.okCount + 1,
        }));

        setGazePos({ x, y });
      };

      api.OnCalibrationComplete = () => {
        beginTimedTrials("GazeCloud calibration complete. Look at the red square");
      };
      api.OnCamDenied = () => {
        setStatus("GazeCloud camera denied");
      };
      api.OnError = (msg) => {
        setStatus(`GazeCloud error: ${msg}`);
      };
      api.UseClickRecalibration = true;

      setTrackingProvider("gazecloud");
      setPhase("calibrating");
      doneRef.current = false;
      setTimingEnabled(false);
      timingEnabledRef.current = false;
      setTrackerDebug((prev) => ({
        ...prev,
        status: "gazecloud_starting",
        cameraOpen: true,
      }));

      api.StartEyeTracking();
      gazeCloudStartedRef.current = true;
      setStatus("GazeCloud started. Complete calibration prompt to begin timed trials.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setStatus(`Could not start GazeCloud: ${msg}`);
    } finally {
      setIsGazeCloudLoading(false);
    }
  }, [beginTimedTrials, cameraReady, getGazeCloud, loadGazeCloudScript, requestBrowserCameraAccess]);

  const reset = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "reset" }));
    }
    manualCloseRef.current = true;
    wsRef.current?.close();

    if (gazeCloudStartedRef.current) {
      const api = getGazeCloud();
      api?.StopEyeTracking?.();
      gazeCloudStartedRef.current = false;
    }

    setPhase("setup");
    setTrials([]);
    trialsRef.current = [];
    setTimingEnabled(false);
    timingEnabledRef.current = false;
    setGazePos(null);
    setTarget(null);
    setCalibIndex(0);
    calibIndexRef.current = 0;
    testStartRef.current = null;
    trialDeadlineRef.current = null;
    initialSpawnPendingRef.current = false;
    lastHitRef.current = 0;
    doneRef.current = false;
    setIsConnecting(false);
    browserStreamRef.current?.getTracks().forEach((track) => track.stop());
    browserStreamRef.current = null;
    backendErrorActiveRef.current = false;
    setCameraReady(false);
    setShowTapFallback(false);
    setTelemetry({
      ear: null,
      earBaseline: null,
      earDropThreshold: null,
      earClosed: false,
      blinkScore: null,
      leftBlinkScore: null,
      rightBlinkScore: null,
      blinkEvent: false,
      blinkStart: false,
      blinkEnd: false,
      blinkClosed: false,
      headOffsetX: null,
      headOffsetY: null,
      frameId: null,
    });
    setBlinkCount(0);
    setLastBlinkAt(null);
    setMessageCount(0);
    setLastMessageAt(null);
    setTrackerDebug({
      status: "-",
      statusAgeMs: null,
      cameraOpen: null,
      cameraIndex: null,
      noFrameCount: 0,
      noFaceCount: 0,
      okCount: 0,
    });
    pointStartRef.current = null;
    savedResultRef.current = false;
    setStatus("Click Start to begin");
  };

  const avgReaction = trials.length
    ? (trials.reduce((sum, trial) => sum + trial.reaction_time, 0) / trials.length).toFixed(3)
    : null;

  const calibPts = CALIB_POINTS(dims.w, dims.h);

  return (
    <MobileLayout title="Reaction & Blink Test" showBack>
      {phase === "setup" && (
        <div className="flex flex-col items-center text-center space-y-6 pt-8">
          <div className="relative w-28 h-28 rounded-full bg-secondary flex items-center justify-center">
            <Eye className="w-10 h-10 text-muted-foreground" />
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Eye Tracking Reaction Test</h2>
            <p className="text-xs text-muted-foreground max-w-[260px]">
              Calibrate with blinks, then track targets using gaze only.
            </p>
          </div>

          <div className="w-full glass rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ScanFace className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-mono text-muted-foreground">REQUIREMENTS</span>
            </div>
            <ul className="space-y-2 text-left">
              {[
                "GazeCloud tracking in browser",
                "Allow browser camera access (iPhone and laptop)",
                "Complete GazeCloud calibration prompt",
                "Keep head still while tracking",
              ].map((req) => (
                <li key={req} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  <span className="text-xs text-secondary-foreground">{req}</span>
                </li>
              ))}
            </ul>
          </div>

          <Button className="w-full" onClick={() => void handleStartGazeCloud()}>
            {isGazeCloudLoading ? "Loading GazeCloud..." : "Start GazeCloud Mode"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">{status}</p>
        </div>
      )}

      {phase === "calibrating" && (
        <div ref={containerRef} className="fixed inset-0 w-screen h-screen bg-black z-40 overflow-hidden">
          <p className="absolute top-3 left-0 right-0 text-center text-white text-xs z-10 px-4">{status}</p>
          {trackingProvider !== "gazecloud" && calibPts.map((pt, i) => (
            <div
              key={i}
              className="absolute rounded-full transition-all duration-200"
              style={{
                left: pt.x - 12,
                top: pt.y - 12,
                width: 24,
                height: 24,
                backgroundColor: i < calibIndex ? "#22c55e" : i === calibIndex ? "#facc15" : "#1f2937",
                transform: i === calibIndex ? "scale(1.4)" : "scale(1)",
                boxShadow: i === calibIndex ? "0 0 16px #facc15aa" : "none",
              }}
            />
          ))}

          {trackingProvider === "gazecloud" && (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="max-w-md w-full bg-black/55 border border-white/25 rounded-lg p-4 text-center text-slate-100">
                <p className="text-sm font-semibold">Complete GazeCloud calibration</p>
                <p className="text-xs mt-2 text-slate-300">
                  If calibration already finished but this screen stays here, tap the button below to start timed trials.
                </p>
                <Button
                  className="mt-4 w-full"
                  onClick={() => beginTimedTrials("Starting timed test...")}
                >
                  Calibration Done - Start Test
                </Button>
              </div>
            </div>
          )}

          {trackingProvider !== "gazecloud" && showTapFallback && (
            <div className="absolute bottom-3 right-3 z-20">
              <Button size="sm" variant="outline" onClick={confirmCalibrationPoint}>
                Tap To Confirm Dot
              </Button>
            </div>
          )}
        </div>
      )}

      {phase === "testing" && (
        <div
          ref={containerRef}
          className="fixed inset-0 w-screen h-screen bg-black z-40 overflow-hidden"
        >
          <p className="absolute top-3 left-3 text-white text-xs z-10">{status}</p>
          <p className="absolute top-8 left-3 text-cyan-200 text-[10px] font-mono z-10">
            {`dims:${Math.round(dims.w)}x${Math.round(dims.h)}`}
          </p>
          <p className="absolute top-3 right-3 text-white text-xs z-10">
            {trials.length}/{TOTAL_TRIALS}
          </p>

          {target && (
            <>
              <div
                className="absolute bg-red-500 rounded-sm"
                style={{
                  left: target.x - SQUARE_SIZE,
                  top: target.y - SQUARE_SIZE,
                  width: SQUARE_SIZE * 2,
                  height: SQUARE_SIZE * 2,
                }}
              />
              <div
                className="absolute rounded-full border border-red-900 opacity-30"
                style={{
                  left: target.x - HIT_RADIUS,
                  top: target.y - HIT_RADIUS,
                  width: HIT_RADIUS * 2,
                  height: HIT_RADIUS * 2,
                }}
              />
            </>
          )}

          {!target && (
            <div className="absolute inset-0 flex items-center justify-center z-20 px-6">
              <div className="w-full max-w-sm rounded-lg border border-white/30 bg-black/55 p-4 text-center text-white">
                <p className="text-sm">Initializing target...</p>
                <Button className="mt-3 w-full" onClick={() => newTarget(dims.w, dims.h)}>
                  Spawn Target
                </Button>
              </div>
            </div>
          )}

          {gazePos && (
            <>
              <div
                className="absolute rounded-full bg-lime-300 pointer-events-none"
                style={{ left: gazePos.x - 10, top: gazePos.y - 10, width: 20, height: 20, boxShadow: "0 0 18px rgba(163,230,53,0.9)", zIndex: 20 }}
              />
              <div
                className="absolute pointer-events-none text-[10px] font-mono text-lime-200"
                style={{ left: gazePos.x + 14, top: gazePos.y - 6, zIndex: 20 }}
              >
                {`x:${Math.round(gazePos.x)} y:${Math.round(gazePos.y)}`}
              </div>
            </>
          )}

        </div>
      )}

      {phase === "result" && (
        <div className="flex flex-col items-center text-center space-y-6 pt-8">
          <div className="relative w-28 h-28 rounded-full bg-secondary flex items-center justify-center">
            <Eye className="w-10 h-10 text-accent" />
            <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-success flex items-center justify-center">
              <span className="text-[10px] font-bold text-background">✓</span>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Test Complete</h2>
            <p className="text-xs text-muted-foreground">Average reaction time: {avgReaction}s</p>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            {trials.map((trial, i) => (
              <div key={i} className="glass rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-accent">{trial.reaction_time.toFixed(3)}s</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">Trial {i + 1}</p>
              </div>
            ))}
            <div className="glass rounded-lg p-3 text-center col-span-2">
              <p className="text-lg font-bold text-accent">{avgReaction}s</p>
              <p className="text-[10px] font-mono text-muted-foreground mt-0.5">Average</p>
            </div>
          </div>

          <Button className="w-full" onClick={reset}>
            Retake Test
          </Button>
        </div>
      )}
    </MobileLayout>
  );
};

export default PupilTest;
