import { useEffect, useRef, useState } from "react";
import { Mic, BarChart3 } from "lucide-react";
import { useAuth } from "@clerk/react";
import MobileLayout from "@/components/MobileLayout";
import { Button } from "@/components/ui/button";
import { saveRespiratoryHistory } from "@/lib/testHistory";

interface LungAnalysisResponse {
  label: "normal" | "crackle" | "wheeze" | "both";
  confidence: number;
  healthPercent?: number;
  durationSeconds: number;
  features: {
    rms: number;
    zeroCrossingRate: number;
  };
  source: string;
  note: string;
}

const ALLOW_ON_DEVICE_FALLBACK = false;

const computeRms = (samples: Float32Array) => {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / samples.length);
};

const computeZeroCrossingRate = (samples: Float32Array) => {
  if (samples.length < 2) return 0;

  let crossings = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
      crossings += 1;
    }
  }

  return crossings / (samples.length - 1);
};

const classifyOnDevice = (samples: Float32Array, sampleRate: number): LungAnalysisResponse => {
  const durationSeconds = samples.length / sampleRate;
  const rmsRaw = computeRms(samples);
  const rms = rmsRaw * 32768;
  const zeroCrossingRate = computeZeroCrossingRate(samples);

  let label: LungAnalysisResponse["label"] = "normal";
  let confidence = 0.55;

  const crackleScore = Math.max(0, Math.min(1, (rms - 800) / 3000)) * Math.max(0, Math.min(1, (0.12 - zeroCrossingRate) / 0.12));
  const wheezeScore = Math.max(0, Math.min(1, (rms - 500) / 2500)) * Math.max(0, Math.min(1, (zeroCrossingRate - 0.08) / 0.25));

  if (crackleScore > 0.28 && wheezeScore > 0.28) {
    label = "both";
    confidence = 0.6 + Math.min(0.35, (crackleScore + wheezeScore) / 2);
  } else if (wheezeScore > crackleScore && wheezeScore > 0.24) {
    label = "wheeze";
    confidence = 0.6 + Math.min(0.35, wheezeScore);
  } else if (crackleScore >= wheezeScore && crackleScore > 0.22) {
    label = "crackle";
    confidence = 0.6 + Math.min(0.35, crackleScore);
  } else {
    confidence = Math.max(0.55, Math.min(0.9, 0.9 - Math.max(crackleScore, wheezeScore)));
  }

  return {
    label,
    confidence: Math.max(0.5, Math.min(0.95, Number(confidence.toFixed(3)))),
    durationSeconds: Number(durationSeconds.toFixed(2)),
    features: {
      rms: Number(rms.toFixed(2)),
      zeroCrossingRate: Number(zeroCrossingRate.toFixed(4)),
    },
    source: "on-device-fallback",
    note: "Server analysis unavailable; showing on-device estimate for this recording.",
  };
};

const mergeFloat32Chunks = (chunks: Float32Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);

  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });

  return merged;
};

const SPECTRUM_BAR_COUNT = 32;
const IDLE_BAR_HEIGHT = 8;
const CAPTURE_DURATION_SECONDS = 25;
const CAPTURE_DURATION_MS = CAPTURE_DURATION_SECONDS * 1000;

const aggregateSpectrumBars = (data: Uint8Array, barCount: number) => {
  const bars = new Array<number>(barCount).fill(IDLE_BAR_HEIGHT);
  const binSize = Math.max(1, Math.floor(data.length / barCount));

  for (let i = 0; i < barCount; i += 1) {
    const start = i * binSize;
    const end = i === barCount - 1 ? data.length : Math.min(data.length, start + binSize);

    let sum = 0;
    for (let j = start; j < end; j += 1) {
      sum += data[j];
    }

    const avg = end > start ? sum / (end - start) : 0;
    const normalized = avg / 255;
    bars[i] = Math.max(IDLE_BAR_HEIGHT, Math.round(normalized * 100));
  }

  return bars;
};

const encodeWavFromPcm = (samples: Float32Array, sampleRate: number) => {
  const channels = 1;
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read audio blob."));
    reader.onloadend = () => {
      const value = reader.result as string;
      resolve(value.split(",")[1] ?? "");
    };
    reader.readAsDataURL(blob);
  });

const getAudioContextConstructor = () => {
  const withWebkit = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return window.AudioContext ?? withWebkit.webkitAudioContext;
};

const getUserMediaCompat = (constraints: MediaStreamConstraints) => {
  const nav = navigator as Navigator & {
    webkitGetUserMedia?: (
      constraints: MediaStreamConstraints,
      onSuccess: (stream: MediaStream) => void,
      onError: (error: unknown) => void,
    ) => void;
    mozGetUserMedia?: (
      constraints: MediaStreamConstraints,
      onSuccess: (stream: MediaStream) => void,
      onError: (error: unknown) => void,
    ) => void;
  };

  if (nav.mediaDevices?.getUserMedia) {
    return nav.mediaDevices.getUserMedia(constraints);
  }

  const legacyGetUserMedia = nav.webkitGetUserMedia ?? nav.mozGetUserMedia;
  if (legacyGetUserMedia) {
    return new Promise<MediaStream>((resolve, reject) => {
      legacyGetUserMedia.call(nav, constraints, resolve, reject);
    });
  }

  return Promise.reject(new Error("This browser does not support microphone recording for this test."));
};

const RespiratoryTest = () => {
  const { userId } = useAuth();
  const [phase, setPhase] = useState<"idle" | "recording" | "analyzing" | "done">("idle");
  const [analysis, setAnalysis] = useState<LungAnalysisResponse | null>(null);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const spectrumDataRef = useRef<Uint8Array | null>(null);
  const spectrumRafIdRef = useRef<number | null>(null);
  const captureTimeoutRef = useRef<number | null>(null);
  const captureIntervalRef = useRef<number | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const [spectrumBars, setSpectrumBars] = useState<number[]>(() =>
    Array.from({ length: SPECTRUM_BAR_COUNT }, () => IDLE_BAR_HEIGHT),
  );

  const stopSpectrumLoop = () => {
    if (spectrumRafIdRef.current !== null) {
      window.cancelAnimationFrame(spectrumRafIdRef.current);
      spectrumRafIdRef.current = null;
    }
  };

  const clearCaptureTimers = () => {
    if (captureTimeoutRef.current !== null) {
      window.clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
    if (captureIntervalRef.current !== null) {
      window.clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    setSecondsLeft(0);
  };

  const resetSpectrum = () => {
    setSpectrumBars(Array.from({ length: SPECTRUM_BAR_COUNT }, () => IDLE_BAR_HEIGHT));
  };

  const startSpectrumLoop = () => {
    const tick = () => {
      const analyserNode = analyserNodeRef.current;
      const spectrumData = spectrumDataRef.current;

      if (analyserNode && spectrumData) {
        analyserNode.getByteFrequencyData(spectrumData);
        setSpectrumBars(aggregateSpectrumBars(spectrumData, SPECTRUM_BAR_COUNT));
      }

      spectrumRafIdRef.current = window.requestAnimationFrame(tick);
    };

    stopSpectrumLoop();
    spectrumRafIdRef.current = window.requestAnimationFrame(tick);
  };

  const stopTracks = () => {
    if (!streamRef.current) return;
    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const cleanupAudioNodes = async () => {
    stopSpectrumLoop();

    if (processorNodeRef.current) {
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }

    if (analyserNodeRef.current) {
      analyserNodeRef.current.disconnect();
      analyserNodeRef.current = null;
    }

    spectrumDataRef.current = null;

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      setError("");
      setAnalysis(null);

      const AudioContextConstructor = getAudioContextConstructor();
      if (!AudioContextConstructor) {
        setError("This browser does not support Web Audio capture for this test.");
        return;
      }

      const stream = await getUserMediaCompat({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      streamRef.current = stream;
      pcmChunksRef.current = [];

      const audioContext = new AudioContextConstructor();
      audioContextRef.current = audioContext;

      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.82;
      analyserNodeRef.current = analyserNode;
      spectrumDataRef.current = new Uint8Array(analyserNode.frequencyBinCount);

      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      processorNodeRef.current = processorNode;

      processorNode.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(input));
      };

      sourceNode.connect(analyserNode);
      analyserNode.connect(processorNode);
      processorNode.connect(audioContext.destination);

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      startSpectrumLoop();

      const finishCapture = async () => {
        try {
          setPhase("analyzing");
          clearCaptureTimers();

          const mergedSamples = mergeFloat32Chunks(pcmChunksRef.current);
          if (mergedSamples.length === 0) {
            throw new Error("No microphone data captured. Please retry.");
          }

          const recordingDuration = mergedSamples.length / audioContext.sampleRate;
          if (recordingDuration < 1.5) {
            throw new Error("Recording too short. Please exhale for at least 1.5 seconds.");
          }

          const wavBlob = encodeWavFromPcm(mergedSamples, audioContext.sampleRate);
          const audioBase64 = await blobToBase64(wavBlob);

          let result: LungAnalysisResponse;

          try {
            const response = await fetch("/api/lung/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audioBase64 }),
            });

            const responseText = await response.text();
            let body: (Partial<LungAnalysisResponse> & { message?: string; error?: string }) | null = null;

            try {
              body = responseText
                ? (JSON.parse(responseText) as Partial<LungAnalysisResponse> & { message?: string; error?: string })
                : null;
            } catch {
              throw new Error("Respiratory API returned an invalid response payload.");
            }

            if (!response.ok) {
              throw new Error(body?.error || body?.message || "Analysis failed.");
            }

            const supportedSources = new Set(["lung-cnn-pth", "node-wav-fallback"]);
            if (!body || !supportedSources.has(String(body.source)) || typeof body.healthPercent !== "number") {
              throw new Error("Model response missing or invalid.");
            }

            result = body as LungAnalysisResponse;
          } catch (analysisFetchError) {
            if (!ALLOW_ON_DEVICE_FALLBACK) {
              const networkFailure =
                analysisFetchError instanceof TypeError ||
                (analysisFetchError instanceof Error &&
                  /failed to fetch|networkerror/i.test(analysisFetchError.message));

              if (networkFailure) {
                throw new Error(
                  "Unable to reach the respiratory analysis server. Start the local API with 'npm run dev:api' and retry.",
                );
              }

              throw analysisFetchError;
            }

            result = classifyOnDevice(mergedSamples, audioContext.sampleRate);
          }

          setAnalysis(result);

          if (userId) {
            saveRespiratoryHistory({
              rms: result.features.rms,
              confidencePercent: Math.round(result.confidence * 100),
              healthPercent:
                typeof result.healthPercent === "number"
                  ? Math.round(result.healthPercent)
                  : undefined,
              durationSeconds: result.durationSeconds,
              label: result.label,
            }, userId);
          }

          setPhase("done");
        } catch (analysisError) {
          setPhase("idle");
          setError(analysisError instanceof Error ? analysisError.message : "Failed to analyze audio.");
        } finally {
          await cleanupAudioNodes();
          stopTracks();
        }
      };

      setPhase("recording");
      setSecondsLeft(CAPTURE_DURATION_SECONDS);

      captureIntervalRef.current = window.setInterval(() => {
        setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);

      captureTimeoutRef.current = window.setTimeout(() => {
        void finishCapture();
      }, CAPTURE_DURATION_MS);
    } catch {
      setError("Unable to start recording on this device. Please allow microphone access and retry.");
      await cleanupAudioNodes();
      stopTracks();
      setPhase("idle");
      clearCaptureTimers();
    }
  };

  const resetTest = () => {
    setPhase("idle");
    setAnalysis(null);
    setError("");
    resetSpectrum();
    clearCaptureTimers();
    void cleanupAudioNodes();
    stopTracks();
  };

  useEffect(
    () => () => {
      clearCaptureTimers();
      stopSpectrumLoop();
      stopTracks();
      void cleanupAudioNodes();
    },
    [],
  );

  return (
    <MobileLayout title="Respiratory Health" showBack>
      <div className="flex flex-col items-center text-center space-y-6 pt-8">
        {/* Mic visualization */}
        <div className={`relative w-28 h-28 rounded-full bg-secondary flex items-center justify-center ${phase === "recording" ? "glow-primary" : ""}`}>
          <Mic className={`w-10 h-10 ${phase === "recording" ? "text-primary animate-pulse-glow" : "text-muted-foreground"}`} />
          {phase === "recording" && (
            <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
          )}
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Forced Exhalation Test</h2>
          <p className="text-xs text-muted-foreground max-w-[260px]">
            {phase === "idle" && "Place the bottom of your phone on your chest, then breathe deeply for 25 seconds."}
            {phase === "recording" && `Recording... keep the phone on your chest and breathe deeply (${secondsLeft}s left).`}
            {phase === "analyzing" && "Analyzing respiratory signal..."}
            {phase === "done" && "Analysis complete. Prediction and metrics below."}
          </p>
        </div>

        <div className="w-full rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-left">
          <p className="text-xs text-foreground font-medium">Before you start:</p>
          <ul className="mt-1 list-disc pl-4 text-[11px] text-muted-foreground space-y-0.5">
            <li>Place the bottom edge of your phone firmly on your chest.</li>
            <li>Breathe deeply and steadily for the full 25 seconds.</li>
            <li>Reduce background noise as much as possible (quiet room, no fan/TV).</li>
          </ul>
        </div>

        {/* FFT Bars */}
        <div className="w-full glass rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-mono text-muted-foreground">COMPARES WITH DATA FROM OTHER PATIENTS</span>
          </div>
          <div className="flex items-end gap-0.5 h-24">
            {spectrumBars.map((height, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-sm transition-all duration-300 ${phase === "done" ? "bg-primary" : phase === "recording" ? "bg-primary/50" : "bg-secondary"}`}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>

        {/* Metrics */}
        {phase === "done" && analysis && (
          <div className="grid grid-cols-2 gap-3 w-full">
            {[
              {
                label: "Lung Health",
                value:
                  typeof analysis.healthPercent === "number"
                    ? `${Math.round(analysis.healthPercent)}%`
                    : "N/A",
              },
              { label: "Prediction", value: analysis.label.toUpperCase() },
              { label: "Duration", value: `${analysis.durationSeconds}s` },
              { label: "Signal RMS", value: `${analysis.features.rms}` },
            ].map((m) => (
              <div key={m.label} className="glass rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-primary">{m.value}</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>
        )}

        {analysis?.note && (
          <p className="w-full text-left text-[10px] text-muted-foreground">{analysis.note}</p>
        )}

        {analysis?.source && (
          <p className="w-full text-left text-[10px] text-muted-foreground">Source: {analysis.source}</p>
        )}

        {error && (
          <p className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {/* Action */}
        <Button
          className="w-full"
          disabled={phase === "recording" || phase === "analyzing"}
          onClick={() => {
            if (phase === "idle") {
              void startRecording();
            } else {
              resetTest();
            }
          }}
        >
          {phase === "idle"
            ? "Begin Test"
            : phase === "recording"
              ? "Recording..."
              : phase === "analyzing"
                ? "Analyzing..."
                : "Retake Test"}
        </Button>
      </div>
    </MobileLayout>
  );
};

export default RespiratoryTest;
