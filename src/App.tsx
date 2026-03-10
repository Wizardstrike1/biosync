import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Tests from "./pages/Tests";
import Results from "./pages/Results";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import HearingAgeTest from "./pages/HearingAgeTest";
import RespiratoryTest from "./pages/RespiratoryTest";
import PupilTest from "./pages/PupilTest";
import ReactionTest from "./pages/ReactionTest";
import MotorTest from "./pages/MotorTest";
import MemoryTest from "./pages/MemoryTest";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HashRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/auth/*" element={<Auth />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/tests" element={<Tests />} />
                <Route path="/results" element={<Results />} />
                <Route path="/profile" element={<Profile />} />
              </Route>

              {/* Functional test routes */}
              <Route path="/test/hearing" element={<HearingAgeTest />} />
              <Route path="/test/respiratory" element={<RespiratoryTest />} />
              <Route path="/test/pupil" element={<PupilTest />} />
              <Route path="/test/reaction" element={<ReactionTest />} />
              <Route path="/test/motor" element={<MotorTest />} />
              <Route path="/test/memory" element={<MemoryTest />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
