import { useState } from "react";
import { Eye, ScanFace } from "lucide-react";
import MobileLayout from "@/components/MobileLayout";
import { Button } from "@/components/ui/button";

const PupilTest = () => {
  const [phase, setPhase] = useState<"setup" | "flash" | "result">("setup");

  return (
    <MobileLayout title="Cognitive & Pupil Response" showBack>
      {phase === "flash" ? (
        <div
          className="fixed inset-0 bg-foreground z-[100] flex items-center justify-center animate-in fade-in duration-100"
          onClick={() => setPhase("result")}
        >
          <p className="text-background text-xs font-mono animate-pulse">TAP WHEN READY</p>
        </div>
      ) : ( 
        <div className="flex flex-col items-center text-center space-y-6 pt-8">
          {/* Eye icon */}
          <div className="relative w-28 h-28 rounded-full bg-secondary flex items-center justify-center">
            <Eye className={`w-10 h-10 ${phase === "result" ? "text-accent" : "text-muted-foreground"}`} />
            {phase === "result" && (
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-success flex items-center justify-center">
                <span className="text-[10px] font-bold text-background">✓</span>
              </div> 
            )}
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Pupil Constriction Test</h2>
            <p className="text-xs text-muted-foreground max-w-[260px]">
              {phase === "setup"
                ? "A bright flash will appear. The front camera measures how quickly your pupils constrict."
                : "Pupil constriction speed recorded."}
            </p>
          </div>

          {/* Requirements */}
          <div className="w-full glass rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ScanFace className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-mono text-muted-foreground">REQUIREMENTS</span>
            </div>
            <ul className="space-y-2 text-left">
              {[
                "Front camera access required",
                "Facial feature tracking enabled",
                "Dim environment recommended",
              ].map((req) => (
                <li key={req} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  <span className="text-xs text-secondary-foreground">{req}</span>
                </li>
              ))}
            </ul>
          </div>\

          {/* Results */}
          {phase === "result" && (
            <div className="grid grid-cols-2 gap-3 w-full">
              {[
                { label: "Constriction", value: "320ms" },
                { label: "Recovery", value: "1.2s" },
                { label: "Ratio", value: "0.68" },
                { label: "Symmetry", value: "94%" },
              ].map((m) => (
                <div key={m.label} className="glass rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-accent">{m.value}</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
          )}

          <Button className="w-full" onClick={() => setPhase(phase === "setup" ? "flash" : "setup")}>
            {phase === "setup" ? "Start Flash Test" : "Retake Test"}
          </Button>
        </div>
      )}
    </MobileLayout>
  );
};

export default PupilTest;
