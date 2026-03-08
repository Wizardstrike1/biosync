import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

interface MobileLayoutProps {
  title?: string;
  showBack?: boolean;
  children: React.ReactNode;
}

const MobileLayout = ({ title, showBack = false, children }: MobileLayoutProps) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const header = (title || showBack) && (
    <header className="glass sticky top-0 z-50 px-4 py-3 flex items-center gap-3">
      {showBack && (
        <button onClick={() => navigate(-1)} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
      )}
      {title && <h1 className="text-sm font-semibold text-foreground">{title}</h1>}
    </header>
  );

  const mobileBody = (
    <>
      {header}
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-6">{children}</main>
    </>
  );

  if (isMobile) {
    return <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">{mobileBody}</div>;
  }

  return (
    <div className="min-h-screen bg-background p-6 lg:p-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center justify-center gap-10 lg:justify-between">
        <aside className="hidden max-w-md space-y-4 lg:block">
          <p className="text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">Desktop Session</p>
          <h2 className="text-4xl font-semibold text-foreground">BioSync Mobile Console</h2>
          <p className="text-sm leading-relaxed text-secondary-foreground">
            Desktop view keeps the same mobile interaction model in a fixed phone frame so testing flow and controls
            remain consistent across devices.
          </p>
        </aside>

        <div className="w-full max-w-[420px] shrink-0">
          <div className="glass flex min-h-[760px] max-h-[860px] flex-col overflow-hidden rounded-[2rem] border border-border shadow-2xl shadow-black/30">
            {mobileBody}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileLayout;
