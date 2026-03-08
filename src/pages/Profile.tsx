import { motion } from "framer-motion";
import { User, LogOut } from "lucide-react";
import { useAuth, useClerk, useUser } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";
import {
  loadHearingHistory,
  loadMotorHistory,
  loadRespiratoryHistory,
} from "@/lib/testHistory";
import { computeHealthScore } from "@/lib/healthScore";

const Profile = () => {
  const { user } = useUser();
  const { userId } = useAuth();
  const { signOut } = useClerk();
  const [counts, setCounts] = useState({ hearing: 0, respiratory: 0, motor: 0 });
  const [overallScore, setOverallScore] = useState(0);

  useEffect(() => {
    let active = true;

    const loadStats = async () => {
      const [hearing, respiratory, motor] = await Promise.all([
        loadHearingHistory(userId),
        loadRespiratoryHistory(userId),
        loadMotorHistory(userId),
      ]);

      if (!active) return;

      setCounts({
        hearing: hearing.length,
        respiratory: respiratory.length,
        motor: motor.length,
      });
      setOverallScore(computeHealthScore(hearing, respiratory, motor).overall);
    };

    void loadStats();

    return () => {
      active = false;
    };
  }, [userId]);

  const totalTests = useMemo(
    () => counts.hearing + counts.respiratory + counts.motor,
    [counts.hearing, counts.motor, counts.respiratory],
  );

  return (
    <div className="px-5 pt-14 pb-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-display font-bold text-foreground mb-8">Profile</h1>

        <div className="flex items-center gap-4 mb-8">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-primary" />
            )}
          </div>
          <div>
            <h2 className="font-display font-semibold text-lg text-foreground">
              {user?.fullName ?? user?.firstName ?? "BioSync User"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {user?.primaryEmailAddress?.emailAddress ?? "No email available"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="card-elevated rounded-2xl p-4 border border-border text-center">
            <p className="text-2xl font-display font-bold text-gradient">{overallScore}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Overall Health Score</p>
          </div>
          <div className="card-elevated rounded-2xl p-4 border border-border text-center">
            <p className="text-2xl font-display font-bold text-gradient">{totalTests}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Tests Taken</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl bg-secondary/50 p-4 text-sm text-foreground flex justify-between">
            <span>Hearing Sessions</span>
            <span className="font-semibold">{counts.hearing}</span>
          </div>
          <div className="rounded-xl bg-secondary/50 p-4 text-sm text-foreground flex justify-between">
            <span>Respiratory Sessions</span>
            <span className="font-semibold">{counts.respiratory}</span>
          </div>
          <div className="rounded-xl bg-secondary/50 p-4 text-sm text-foreground flex justify-between">
            <span>Motor Sessions</span>
            <span className="font-semibold">{counts.motor}</span>
          </div>
        </div>

        <button
          onClick={() => void signOut({ redirectUrl: "/" })}
          className="w-full flex items-center gap-4 p-4 rounded-xl mt-6 hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-5 w-5 text-destructive" />
          <span className="text-sm font-medium text-destructive">Log Out</span>
        </button>
      </motion.div>
    </div>
  );
};

export default Profile;
