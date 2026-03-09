import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, Ear } from "lucide-react";
import { useAuth } from "@/lib/auth";
import MobileLayout from "@/components/MobileLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveHearingHistory } from "@/lib/testHistory";

type TestPhase = "idle" | "playing" | "done";
type EarSide = "left" | "right" | "both";

const FREQUENCY_SEQUENCE = [8000, 10000, 12000, 14000, 16000, 17000, 18000];
const HEADPHONE_FREQUENCY_SEQUENCE = [7000, 8000, 9000, 10000, 11500, 13000, 14500, 16000, 17200, 18200];
const TONE_DURATION_MS = 1200;
const ROUND_DURATION_MS = 2200;

const estimateHearingAge = (highestHeardFrequency: number) => {
  if (highestHeardFrequency >= 17000) return "18-25";
  if (highestHeardFrequency >= 16000) return "26-35";
  if (highestHeardFrequency >= 14000) return "36-45";
  if (highestHeardFrequency >= 12000) return "46-55";
  if (highestHeardFrequency >= 10000) return "56-65";
  return "65+";
};

const hearingAgeMidpoint = (hearingAgeRange: string) => {
  switch (hearingAgeRange) {
    case "18-25":
      return 21.5;
    case "26-35":
      return 30.5;
    case "36-45":
      return 40.5;
    case "46-55":
      return 50.5;
    case "56-65":
      return 60.5;
    default:
      return 70;
  }
};

const HearingAgeTest = () => {
  const { userId } = useAuth();
  const [phase, setPhase] = useState<TestPhase>("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [heardFrequencies, setHeardFrequencies] = useState<number[]>([]);
  const [isTonePlaying, setIsTonePlaying] = useState(false);
  const [pressedThisRound, setPressedThisRound] = useState(false);
  const [actualAge, setActualAge] = useState("");
  const [headphoneMode, setHeadphoneMode] = useState(false);
  const [currentEar, setCurrentEar] = useState<EarSide>("both");
  const [correctEarHits, setCorrectEarHits] = useState(0);
  const [wrongEarPresses, setWrongEarPresses] = useState(0);
  const [falsePressesNoTone, setFalsePressesNoTone] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const roundTimerRef = useRef<number | null>(null);
  const lastPressAtRef = useRef(0);
  const heardFrequenciesRef = useRef<number[]>([]);

  const frequencySequence = headphoneMode ? HEADPHONE_FREQUENCY_SEQUENCE : FREQUENCY_SEQUENCE;
  const currentFrequency = frequencySequence[currentIndex] ?? 0;

  const clearRoundTimer = () => {
    if (roundTimerRef.current !== null) {
      window.clearTimeout(roundTimerRef.current);
      roundTimerRef.current = null;
    }
  };

  const shutdownAudio = () => {
    const context = audioContextRef.current;
    if (!context) return;

    void context.close();
    audioContextRef.current = null;
  };

  const ensureAudioContext = async () => {
    if (!audioContextRef.current) {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error("Web Audio API is not supported in this browser.");
      }
      audioContextRef.current = new AudioContextCtor();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  };

  const playTone = async (frequency: number, pan: number) => {
    const context = await ensureAudioContext();

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const stereoPanner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    const now = context.currentTime;
    const attackSeconds = 0.02;
    const releaseSeconds = 0.06;
    const toneSeconds = TONE_DURATION_MS / 1000;

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(0.25, now + attackSeconds);
    gainNode.gain.setValueAtTime(0.25, now + Math.max(attackSeconds, toneSeconds - releaseSeconds));
    gainNode.gain.linearRampToValueAtTime(0.0001, now + toneSeconds);

    oscillator.connect(gainNode);
    if (stereoPanner) {
      stereoPanner.pan.value = pan;
      gainNode.connect(stereoPanner);
      stereoPanner.connect(context.destination);
    } else {
      gainNode.connect(context.destination);
    }

    oscillator.start(now);
    oscillator.stop(now + toneSeconds);

    setIsTonePlaying(true);

    window.setTimeout(() => {
      setIsTonePlaying(false);
    }, TONE_DURATION_MS);

    return new Promise<void>((resolve) => {
      oscillator.onended = () => {
        oscillator.disconnect();
        gainNode.disconnect();
        if (stereoPanner) {
          stereoPanner.disconnect();
        }
        resolve();
      };
    });
  };

  const completeTest = () => {
    const heardCount = heardFrequenciesRef.current.length;
    const totalTones = frequencySequence.length;
    const highestHeard = heardCount ? Math.max(...heardFrequenciesRef.current) : 0;
    const hearingAgeRange = estimateHearingAge(highestHeard);

    saveHearingHistory({
      mode: headphoneMode ? "headphone" : "speaker",
      tonesHeardPercent: Math.round((heardCount / totalTones) * 100),
      tonesHeard: heardCount,
      totalTones,
      hearingAgeRange,
      highestHeardHz: highestHeard,
      falsePressesNoTone,
      earMatchAccuracy:
        headphoneMode && correctEarHits + wrongEarPresses > 0
          ? Math.round((correctEarHits / (correctEarHits + wrongEarPresses)) * 100)
          : null,
    }, userId);

    clearRoundTimer();
    setPhase("done");
    setIsTonePlaying(false);
    setPressedThisRound(false);
  };

  const startRound = (index: number) => {
    if (index >= frequencySequence.length) {
      completeTest();
      return;
    }

    clearRoundTimer();

    setCurrentIndex(index);
    setPressedThisRound(false);

    const frequency = frequencySequence[index];
    const earForRound: EarSide = headphoneMode ? (Math.random() < 0.5 ? "left" : "right") : "both";
    setCurrentEar(earForRound);

    const pan = earForRound === "left" ? -1 : earForRound === "right" ? 1 : 0;
    void playTone(frequency, pan);

    roundTimerRef.current = window.setTimeout(() => {
      startRound(index + 1);
    }, ROUND_DURATION_MS);
  };

  const startTest = async () => {
    setHeardFrequencies([]);
    heardFrequenciesRef.current = [];
    setCurrentIndex(0);
    setPressedThisRound(false);
    setIsTonePlaying(false);
    setCurrentEar("both");
    setCorrectEarHits(0);
    setWrongEarPresses(0);
    setFalsePressesNoTone(0);

    try {
      await ensureAudioContext();
      setPhase("playing");
      void startRound(0);
    } catch {
      setPhase("idle");
    }
  };

  const onHearPress = (pressedEar: EarSide) => {
    if (phase !== "playing") return;

    const now = Date.now();
    if (now - lastPressAtRef.current < 160) return;
    lastPressAtRef.current = now;

    if (pressedThisRound) return;

    // Keep false-press telemetry, but still allow a round to be scored if
    // the user responds just after the tone decays.
    if (!isTonePlaying) {
      setFalsePressesNoTone((prev) => prev + 1);
    }

    const isCorrectEar = !headphoneMode || currentEar === "both" || pressedEar === currentEar;

    setPressedThisRound(true);

    if (isCorrectEar) {
      setHeardFrequencies((prev) => {
        if (prev.includes(currentFrequency)) return prev;
        const next = [...prev, currentFrequency];
        heardFrequenciesRef.current = next;
        return next;
      });

      if (headphoneMode) {
        setCorrectEarHits((prev) => prev + 1);
      }
    } else {
      setWrongEarPresses((prev) => prev + 1);
    }

    clearRoundTimer();
    window.setTimeout(() => {
      startRound(currentIndex + 1);
    }, 260);
  };

  const highestHeardFrequency = useMemo(() => {
    if (heardFrequencies.length === 0) return 0;
    return Math.max(...heardFrequencies);
  }, [heardFrequencies]);

  const hearingAge = estimateHearingAge(highestHeardFrequency);
  const actualAgeValue = Number(actualAge);
  const hasValidAge = Number.isFinite(actualAgeValue) && actualAgeValue >= 5 && actualAgeValue <= 100;
  const estimatedHearingNumericAge = hearingAgeMidpoint(hearingAge);
  const earAccuracy = headphoneMode && correctEarHits + wrongEarPresses > 0
    ? Math.round((correctEarHits / (correctEarHits + wrongEarPresses)) * 100)
    : null;

  const ageIndication = useMemo(() => {
    if (!hasValidAge) {
      return "Enter your age to get a personalized interpretation.";
    }

    const delta = estimatedHearingNumericAge - actualAgeValue;

    if (delta > 5) {
      return "Your hearing profile appears older than your actual age. Consider reducing prolonged loud sound exposure and following up with a formal hearing screening.";
    }

    if (delta < -5) {
      return "Your hearing profile appears younger than your actual age, which is a strong result for this quick screen.";
    }

    return "Your hearing profile is within your expected age range. This looks healthy for a quick hearing check.";
  }, [actualAgeValue, estimatedHearingNumericAge, hasValidAge]);

  const responseIndication = useMemo(() => {
    if (falsePressesNoTone === 0) {
      return "Great response control: you did not press during silent windows.";
    }

    if (falsePressesNoTone <= 2) {
      return "Minor early presses detected. Try waiting for a clear tone before responding.";
    }

    return "Frequent false presses were detected while no tone was playing. Slow down and only press when you clearly hear a signal.";
  }, [falsePressesNoTone]);

  useEffect(() => {
    return () => {
      clearRoundTimer();
      shutdownAudio();
    };
  }, []);

  return (
    <MobileLayout title="Hearing Age Test" showBack>
      <div className="flex flex-col items-center text-center space-y-6 pt-8">
        {phase === "idle" && (
          <>
            <div className="w-28 h-28 rounded-full bg-secondary flex items-center justify-center">
              <Ear className="w-10 h-10 text-primary" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">High-Frequency Hearing Check</h2>
              <p className="text-xs text-muted-foreground max-w-[280px]">
                You will hear short tones from lower to higher frequencies. Press the button every time you hear a tone.
              </p>
            </div>

            <div className="w-full glass rounded-lg p-4 space-y-2 text-left">
              <p className="text-xs font-mono text-muted-foreground">SETUP</p>
              <p className="text-xs text-secondary-foreground">Use headphones if possible and keep your volume at a comfortable level.</p>
              <p className="text-xs text-secondary-foreground">The test runs through {frequencySequence.length} tones and estimates a hearing age range.</p>
            </div>

            <div className="w-full glass rounded-lg p-4 text-left">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-mono text-muted-foreground">HEADPHONE MODE</p>
                  <p className="text-[11px] text-secondary-foreground mt-1">Randomizes left/right ear tones with an extended round set and side-specific response buttons.</p>
                </div>
                <Switch checked={headphoneMode} onCheckedChange={setHeadphoneMode} />
              </div>
            </div>

            <div className="w-full glass rounded-lg p-4 space-y-2 text-left">
              <label htmlFor="actual-age" className="text-xs font-mono text-muted-foreground">YOUR AGE</label>
              <Input
                id="actual-age"
                type="number"
                min={5}
                max={100}
                value={actualAge}
                onChange={(event) => setActualAge(event.target.value)}
                placeholder="Enter your age"
              />
              <p className="text-[11px] text-muted-foreground">Used only to compare your hearing-age estimate.</p>
            </div>

            <Button className="w-full" onClick={() => void startTest()} disabled={!hasValidAge}>
              Start Hearing Test
            </Button>
          </>
        )}

        {phase === "playing" && (
          <>
            <div className={`w-28 h-28 rounded-full bg-secondary flex items-center justify-center ${isTonePlaying ? "glow-primary" : ""}`}>
              <Volume2 className={`w-10 h-10 ${isTonePlaying ? "text-primary" : "text-muted-foreground"}`} />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Listen Carefully</h2>
              <p className="text-xs text-muted-foreground">Tone {currentIndex + 1} / {frequencySequence.length} · {currentFrequency.toLocaleString()} Hz</p>
              {headphoneMode && <p className="text-xs text-primary">Press the ear side where you hear the tone.</p>}
            </div>

            <div className="w-full glass rounded-lg p-4">
              <p className="text-xs text-secondary-foreground">
                Press when you hear the tone. If you do not hear anything, wait and the next tone will play automatically.
              </p>
            </div>

            {headphoneMode ? (
              <div className="grid grid-cols-2 gap-3 w-full">
                <Button className="w-full" onClick={() => onHearPress("left")} disabled={pressedThisRound}>
                  {pressedThisRound ? "Recorded" : "Left Heard"}
                </Button>
                <Button className="w-full" onClick={() => onHearPress("right")} disabled={pressedThisRound}>
                  {pressedThisRound ? "Recorded" : "Right Heard"}
                </Button>
              </div>
            ) : (
              <Button className="w-full" onClick={() => onHearPress("both")} disabled={pressedThisRound}>
                {pressedThisRound ? "Recorded" : "I Hear It"}
              </Button>
            )}
          </>
        )}

        {phase === "done" && (
          <>
            <div className="w-28 h-28 rounded-full bg-secondary flex items-center justify-center glow-primary">
              <Ear className="w-10 h-10 text-primary" />
            </div>

            <h2 className="text-lg font-semibold text-foreground">Test Complete</h2>

            <div className="grid grid-cols-2 gap-3 w-full">
              {[
                { label: "Hearing Age", value: hearingAge },
                { label: "Highest Heard", value: highestHeardFrequency ? `${highestHeardFrequency / 1000}kHz` : "-" },
                { label: "Tones Heard", value: `${heardFrequencies.length}/${frequencySequence.length}` },
                { label: "Your Age", value: hasValidAge ? `${actualAgeValue}` : "-" },
              ].map((metric) => (
                <div key={metric.label} className="glass rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-primary">{metric.value}</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{metric.label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 w-full">
              <div className="glass rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-primary">{falsePressesNoTone}</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">False Presses (Silent)</p>
              </div>
              <div className="glass rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-primary">
                  {headphoneMode ? (earAccuracy === null ? "-" : `${earAccuracy}%`) : "-"}
                </p>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">Ear Match Accuracy</p>
              </div>
            </div>

            <div className="w-full glass rounded-lg p-4 text-left">
              <p className="text-xs font-mono text-muted-foreground">INDICATION</p>
              <p className="text-xs text-secondary-foreground mt-2 leading-relaxed">{ageIndication}</p>
            </div>

            <div className="w-full glass rounded-lg p-4 text-left">
              <p className="text-xs font-mono text-muted-foreground">RESPONSE FEEDBACK</p>
              <p className="text-xs text-secondary-foreground mt-2 leading-relaxed">{responseIndication}</p>
            </div>

            <Button className="w-full" onClick={() => void startTest()}>
              Run Again
            </Button>
          </>
        )}
      </div>
    </MobileLayout>
  );
};

export default HearingAgeTest;
