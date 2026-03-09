import { FormEvent, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "signup";

const getModeFromSearch = (search: string): Mode => {
  const params = new URLSearchParams(search);
  return params.get("mode") === "signup" ? "signup" : "login";
};

const Auth = () => {
  const location = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError, data } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;

        if (!data.session) {
          setMessage("Account created. Check your email for the confirmation link, then log in.");
        }
      }
    } catch (err) {
      const fallback = mode === "login" ? "Unable to log in." : "Unable to create account.";
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setLoading(false);
    }
  };

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

          <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
            </Button>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {message && <p className="text-xs text-muted-foreground">{message}</p>}
          </form>

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
