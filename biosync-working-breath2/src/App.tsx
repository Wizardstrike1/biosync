import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { setSupabaseAccessTokenGetter } from "@/lib/supabase";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import HearingAgeTest from "./pages/HearingAgeTest";
import RespiratoryTest from "./pages/RespiratoryTest";
import PupilTest from "./pages/PupilTest";
import ReactionTest from "./pages/ReactionTest";
import MotorTest from "./pages/MotorTest";
import ResultsHistory from "./pages/ResultsHistory";
import Welcome from "./pages/Welcome";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const { getToken } = useAuth();

  useEffect(() => {
    setSupabaseAccessTokenGetter(() => getToken({ template: "supabase" }));

    return () => {
      setSupabaseAccessTokenGetter(null);
    };
  }, [getToken]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HashRouter>
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/auth/*" element={<Auth />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<Index />} />
              <Route path="/test/hearing" element={<HearingAgeTest />} />
              <Route path="/test/respiratory" element={<RespiratoryTest />} />
              <Route path="/test/pupil" element={<PupilTest />} />
              <Route path="/test/reaction" element={<ReactionTest />} />
              <Route path="/test/motor" element={<MotorTest />} />
              <Route path="/results" element={<ResultsHistory />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
