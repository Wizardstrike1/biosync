import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@clerk/react";

const ProtectedRoute = () => {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-xs font-mono tracking-wider text-muted-foreground uppercase">Checking Session...</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/auth?mode=login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
