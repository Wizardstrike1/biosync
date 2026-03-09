import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  user: User | null;
  session: Session | null;
  getToken: () => Promise<string | null>;
  signOut: (opts?: { redirectUrl?: string }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const SupabaseAuthProvider = ({ children }: { children: ReactNode }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoaded(true);
      setSession(null);
      return;
    }

    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setIsLoaded(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      setIsLoaded(true);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? null;

    return {
      isLoaded,
      isSignedIn: Boolean(user),
      userId: user?.id ?? null,
      user,
      session,
      getToken: async () => session?.access_token ?? null,
      signOut: async (opts) => {
        if (supabase) {
          await supabase.auth.signOut();
        }

        if (opts?.redirectUrl && typeof window !== "undefined") {
          window.location.hash = opts.redirectUrl;
        }
      },
    };
  }, [isLoaded, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("SupabaseAuthProvider is missing.");
  }
  return ctx;
};

export const useAuth = () => {
  const { isLoaded, isSignedIn, userId, getToken } = useAuthContext();
  return { isLoaded, isSignedIn, userId, getToken };
};

export const useUser = () => {
  const { user } = useAuthContext();
  return { user };
};

export const useClerk = () => {
  const { signOut } = useAuthContext();
  return { signOut };
};

export const useSupabaseSession = () => {
  const { session, user } = useAuthContext();
  return { session, user };
};
