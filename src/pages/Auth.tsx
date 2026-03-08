import { useMemo } from "react";
import { Activity } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { SignIn, SignUp, useAuth } from "@clerk/react";

type Mode = "login" | "signup";

const getModeFromSearch = (search: string): Mode => {
  const params = new URLSearchParams(search);
  return params.get("mode") === "signup" ? "signup" : "login";
};

const Auth = () => {
  const location = useLocation();
  const { isLoaded, isSignedIn } = useAuth();

  const mode = useMemo(() => getModeFromSearch(location.search), [location.search]);
  const redirectPath = "/dashboard";

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xs font-mono tracking-wider text-muted-foreground uppercase">Checking Session...</p>
      </div>
    );
  }

  if (isSignedIn) {
    return <Navigate to={redirectPath} replace />;
  }
  const toggleHref = mode === "login" ? "/auth?mode=signup" : "/auth?mode=login";
  const toggleLabel = mode === "login" ? "Need an account? Sign up" : "Already registered? Log in";

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-6xl items-center justify-center lg:justify-between">
        <section className="hidden max-w-xl space-y-5 lg:block">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-1.5 text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" />
            BioSync Access
          </p>
          <h1 className="text-5xl font-bold leading-tight text-foreground">Secure your session.</h1>
          <p className="text-sm leading-relaxed text-secondary-foreground">
            Sign in to continue tests, or create a profile to start collecting your biometric baseline from any
            supported device.
          </p>
        </section>

        <section className="glass w-full max-w-md rounded-2xl border border-border p-6 sm:p-8">
          <h2 className="text-2xl font-semibold text-foreground">{mode === "login" ? "Log in" : "Create account"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "login" ? "Use your BioSync credentials." : "Create your BioSync profile."}
          </p>

          <div className="mt-6">
            {mode === "login" ? (
              <SignIn
                routing="hash"
                signUpUrl="/#/auth?mode=signup"
                forceRedirectUrl="/#/dashboard"
              />
            ) : (
              <SignUp
                routing="hash"
                signInUrl="/#/auth?mode=login"
                forceRedirectUrl="/#/dashboard"
              />
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs">
            <Link to={toggleHref} className="text-primary hover:underline">
              {toggleLabel}
            </Link>
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              Back to welcome
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Auth;
