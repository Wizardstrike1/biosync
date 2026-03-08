import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TestCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  status: "ready" | "completed" | "locked";
  route: string;
  accentClass?: string;
}

const TestCard = ({ title, description, icon, status, route, accentClass = "glow-primary" }: TestCardProps) => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(route)}
      className={`w-full glass rounded-lg p-4 flex items-center gap-4 text-left transition-all active:scale-[0.98] ${
        status === "locked" ? "opacity-40 pointer-events-none" : ""
      }`}
    >
      <div className={`w-12 h-12 rounded-lg bg-secondary flex items-center justify-center shrink-0 ${status === "completed" ? "" : accentClass}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
      </div>
      <div className="shrink-0">
        {status === "completed" ? (
          <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-success" />
          </div>
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
    </button>
  );
};

export default TestCard;
