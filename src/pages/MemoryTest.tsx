import { useEffect, useMemo, useRef, useState } from "react";
import { Brain } from "lucide-react";
import { useAuth } from "@/lib/auth";
import MobileLayout from "@/components/MobileLayout";
import { Button } from "@/components/ui/button";
import { saveMemoryHistory } from "@/lib/testHistory";

type Phase = "idle" | "showing" | "input" | "done";

const GRID_SIZE = 9;
const FLASH_MS = 420;
const PAUSE_MS = 180;

const randomTile = () => Math.floor(Math.random() * GRID_SIZE);

const buildSequence = (length: number) =>
  Array.from({ length }, () => randomTile());

const MemoryTest = () => {
  const { userId } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [level, setLevel] = useState(1);
  const [sequence, setSequence] = useState<number[]>([]);
  const [inputIndex, setInputIndex] = useState(0);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [pressedTile, setPressedTile] = useState<number | null>(null);
  const [bestLevel, setBestLevel] = useState(0);

  const timeoutRef = useRef<number | null>(null);
  const hasSavedRef = useRef(false);

  const clearTimer = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const runSequence = (nextSequence: number[]) => {
    setPhase("showing");
    setInputIndex(0);
    setSequence(nextSequence);

    let step = 0;

    const showNext = () => {
      if (step >= nextSequence.length) {
        setHighlighted(null);
        setPhase("input");
        return;
      }

      setHighlighted(nextSequence[step]);
      timeoutRef.current = window.setTimeout(() => {
        setHighlighted(null);
        timeoutRef.current = window.setTimeout(() => {
          step += 1;
          showNext();
        }, PAUSE_MS);
      }, FLASH_MS);
    };

    showNext();
  };

  const startGame = () => {
    hasSavedRef.current = false;
    setBestLevel(0);
    setLevel(1);
    runSequence(buildSequence(1));
  };

  const endGame = () => {
    setPhase("done");
  };

  const handleTileClick = (tileIndex: number) => {
    if (phase !== "input") return;

    setPressedTile(tileIndex);
    window.setTimeout(() => {
      setPressedTile((current) => (current === tileIndex ? null : current));
    }, 180);

    if (tileIndex !== sequence[inputIndex]) {
      endGame();
      return;
    }

    const nextIndex = inputIndex + 1;
    if (nextIndex >= sequence.length) {
      const completedLevel = sequence.length;
      setBestLevel(completedLevel);
      const nextLevel = completedLevel + 1;
      setLevel(nextLevel);
      clearTimer();
      timeoutRef.current = window.setTimeout(() => {
        runSequence(buildSequence(nextLevel));
      }, 500);
      return;
    }

    setInputIndex(nextIndex);
  };

  useEffect(() => {
    if (phase !== "done" || hasSavedRef.current) return;

    hasSavedRef.current = true;
    saveMemoryHistory(
      {
        levelReached: bestLevel,
        squaresRemembered: bestLevel,
      },
      userId,
    );
  }, [bestLevel, phase, userId]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  const subtitle = useMemo(() => {
    if (phase === "idle") return "Watch the pattern and repeat it. The sequence grows every level.";
    if (phase === "showing") return `Memorize level ${level}`;
    if (phase === "input") return `Repeat the sequence (${inputIndex + 1}/${sequence.length})`;
    return `Game over. You reached level ${bestLevel}.`;
  }, [bestLevel, inputIndex, level, phase, sequence.length]);

  return (
    <MobileLayout title="Sequence Memory" showBack>
      <div className="flex flex-col items-center text-center space-y-5 pt-4">
        <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center">
          <Brain className="w-10 h-10 text-primary" />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Memory Grid</h2>
          <p className="text-xs text-muted-foreground max-w-[300px]">{subtitle}</p>
        </div>

        <div className="w-full grid grid-cols-3 gap-3 max-w-[320px]">
          {Array.from({ length: GRID_SIZE }, (_, index) => {
            const isLit = highlighted === index;
            const isPressed = pressedTile === index;
            return (
              <button
                key={index}
                onClick={() => handleTileClick(index)}
                disabled={phase !== "input"}
                className={`aspect-square rounded-xl border transition-all ${
                  isLit
                    ? "bg-primary border-primary shadow-lg shadow-primary/40 scale-[1.04]"
                    : "bg-secondary/60 border-border"
                } ${isPressed ? "ring-2 ring-primary/80 shadow-lg shadow-primary/35 scale-[1.03]" : ""} ${phase === "input" ? "active:scale-95" : ""}`}
                aria-label={`Tile ${index + 1}`}
              />
            );
          })}
        </div>

        <div className="w-full max-w-[320px] glass rounded-lg p-4 text-left space-y-2">
          <p className="text-xs text-muted-foreground">Current Level: <span className="text-foreground font-semibold">{level}</span></p>
          <p className="text-xs text-muted-foreground">Best This Run: <span className="text-foreground font-semibold">{bestLevel}</span></p>
        </div>

        {phase === "idle" && (
          <Button className="w-full max-w-[320px]" onClick={startGame}>Start Memory Test</Button>
        )}

        {phase === "done" && (
          <div className="w-full max-w-[320px] space-y-2">
            <Button className="w-full" onClick={startGame}>Play Again</Button>
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default MemoryTest;
