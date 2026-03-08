import { Activity, ArrowRight, ShieldCheck, Smartphone, Workflow } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { Button } from "@/components/ui/button";

const Welcome = () => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xs font-mono tracking-wider text-muted-foreground uppercase">Checking Session...</p>
      </div>
    );
  }

  if (isSignedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-6xl flex-col justify-center gap-10 lg:flex-row lg:items-center lg:justify-between">
        <section className="max-w-2xl space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-1.5 text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" />
            Biometric Calibration Platform
          </p>

          <h1 className="text-4xl font-bold leading-tight text-foreground sm:text-5xl lg:text-6xl">
            Welcome to <span className="text-gradient-primary">BioSync</span>
          </h1>

          <p className="max-w-xl text-sm leading-relaxed text-secondary-foreground sm:text-base">
            Run guided physiological tests and build a baseline profile across respiratory, neurological, reflexive,
            and motor dimensions in a single mobile-first workflow.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "Secure Profiles", copy: "Session auth and personalized results" },
              { icon: Smartphone, title: "Mobile Native", copy: "Optimized touch interactions and pacing" },
              { icon: Workflow, title: "Structured Flow", copy: "Step-by-step calibration sequence" },
            ].map((item) => (
              <div key={item.title} className="glass rounded-xl p-4">
                <item.icon className="mb-2 h-4 w-4 text-primary" />
                <p className="text-xs font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="glass w-full max-w-md rounded-2xl border border-border p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-foreground">Get Started</h2>
          <p className="mt-2 text-sm text-muted-foreground">Create an account or log in to continue your baseline assessment.</p>

          <div className="mt-6 space-y-3">
            <Button className="w-full" asChild>
              <Link to="/auth?mode=signup">
                Create account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>

            <Button className="w-full" variant="outline" asChild>
              <Link to="/auth?mode=login">I already have an account</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Welcome;
