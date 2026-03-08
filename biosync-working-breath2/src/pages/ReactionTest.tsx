import { useState, useEffect, useCallback } from "react";
import { Zap, Star, Circle, Triangle, Square } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { Button } from "@/components/ui/button";

const SYMBOLS = [Star, Circle, Triangle, Square];
const TARGET_INDEX = 0; // Star is the target

const ReactionTest = () => {
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [currentSymbol, setCurrentSymbol] = useState(0);
  const [showSymbol, setShowSymbol] = useState(false);
  const [results, setResults] = useState<number[]>([]);
  const [symbolShownAt, setSymbolShownAt] = useState(0);
  const [round, setRound] = useState(0);

  const showNext = useCallback(() => {
    if (round >= 8) {
      setPhase("done");
      return;
    }
    setShowSymbol(false);
    const delay = 1000 + Math.random() * 2000;
    setTimeout(() => {
      const idx = Math.random() < 0.5 ? TARGET_INDEX : Math.floor(Math.random() * SYMBOLS.length);
      setCurrentSymbol(idx);
      setShowSymbol(true);
      setSymbolShownAt(Date.now());
    }, delay);
  }, [round]);

  useEffect(() => {
    if (phase === "playing" && round === 0) showNext();
  }, [phase, round, showNext]);

  const handleTap = () => {
    if (!showSymbol) return;
    if (currentSymbol === TARGET_INDEX) {
      const reaction = Date.now() - symbolShownAt;
      setResults((r) => [...r, reaction]);
    }
    setRound((r) => r + 1);
    setShowSymbol(false);
    setTimeout(showNext, 300);
  };

  const avgReaction = results.length > 0 ? Math.round(results.reduce((a, b) => a + b, 0) / results.length) : 0;
  const CurrentIcon = SYMBOLS[currentSymbol];

  return (
    <MobileLayout title="Reaction & Blink Test" showBack>
      <div className="flex flex-col items-center text-center space-y-6 pt-8">
        {phase === "idle" && (
          <>
            <div className="w-28 h-28 rounded-full bg-secondary flex items-center justify-center">
              <Zap className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Reaction Game</h2>
              <p className="text-xs text-muted-foreground max-w-[260px]">
                Tap the screen when you see the ★ star symbol. Ignore all other shapes. 8 rounds total.
              </p>
            </div>
            <div className="w-full glass rounded-lg p-4">
              <div className="flex items-center justify-center gap-6">
                {SYMBOLS.map((Icon, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <Icon className={`w-8 h-8 ${i === TARGET_INDEX ? "text-primary" : "text-muted-foreground/40"}`} />
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {i === TARGET_INDEX ? "TAP" : "IGNORE"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={() => { setPhase("playing"); setRound(0); setResults([]); }}>
              Start Game
            </Button>
          </>
        )}

        {phase === "playing" && (
          <button className="w-full flex-1 min-h-[60vh] flex flex-col items-center justify-center" onClick={handleTap}>
            {showSymbol ? (
              <div className={`animate-in zoom-in duration-150 ${currentSymbol === TARGET_INDEX ? "glow-primary" : ""}`}>
                <CurrentIcon className={`w-24 h-24 ${currentSymbol === TARGET_INDEX ? "text-primary" : "text-muted-foreground/30"}`} />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-3 h-3 rounded-full bg-muted-foreground/20 mx-auto animate-pulse-glow" />
                <p className="text-xs font-mono text-muted-foreground">WAIT...</p>
              </div>
            )}
            <p className="text-[10px] font-mono text-muted-foreground mt-8">
              Round {Math.min(round + 1, 8)} / 8
            </p>
          </button>
        )}

        {phase === "done" && (
          <>
            <div className="w-28 h-28 rounded-full bg-secondary flex items-center justify-center glow-primary">
              <Zap className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Test Complete</h2>
            <div className="grid grid-cols-2 gap-3 w-full">
              {[
                { label: "Avg Reaction", value: `${avgReaction}ms` },
                { label: "Best", value: `${results.length ? Math.min(...results) : 0}ms` },
                { label: "Hits", value: `${results.length}/4` },
                { label: "Accuracy", value: `${Math.round((results.length / 4) * 100)}%` },
              ].map((m) => (
                <div key={m.label} className="glass rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-primary">{m.value}</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={() => { setPhase("idle"); }}>
              Play Again
            </Button>
          </>
        )}
      </div>
    </MobileLayout>
  );
};

export default ReactionTest;
