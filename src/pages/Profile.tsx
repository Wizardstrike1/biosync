import { motion } from "framer-motion";
import { User, LogOut, Camera, Trash2 } from "lucide-react";
import { useAuth, useClerk, useUser } from "@/lib/auth";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  loadEyeHistory,
  loadHearingHistory,
  loadMemoryHistory,
  loadMotorHistory,
  loadRespiratoryHistory,
} from "@/lib/testHistory";
import { computeHealthScore } from "@/lib/healthScore";
import { computeHighestDailyStreak } from "@/lib/streak";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getUserAvatarUrl, getUserDisplayName } from "@/lib/userProfile";

const AVATAR_STORAGE_BUCKET = "avatars";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image file."));
    };
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });

const Profile = () => {
  const { user } = useUser();
  const { userId } = useAuth();
  const { signOut } = useClerk();
  const [counts, setCounts] = useState({ hearing: 0, respiratory: 0, motor: 0, eye: 0, memory: 0 });
  const [overallScore, setOverallScore] = useState(0);
  const [highestStreak, setHighestStreak] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;

    const loadStats = async () => {
      const [hearing, respiratory, motor, eye, memory] = await Promise.all([
        loadHearingHistory(userId),
        loadRespiratoryHistory(userId),
        loadMotorHistory(userId),
        loadEyeHistory(userId),
        loadMemoryHistory(userId),
      ]);

      if (!active) return;

      setCounts({
        hearing: hearing.length,
        respiratory: respiratory.length,
        motor: motor.length,
        eye: eye.length,
        memory: memory.length,
      });
      setOverallScore(computeHealthScore(hearing, respiratory, motor).overall);

      const allCreatedAt = [
        ...hearing.map((entry) => entry.createdAt),
        ...respiratory.map((entry) => entry.createdAt),
        ...motor.map((entry) => entry.createdAt),
        ...eye.map((entry) => entry.createdAt),
        ...memory.map((entry) => entry.createdAt),
      ];

      setHighestStreak(computeHighestDailyStreak(allCreatedAt));
    };

    void loadStats();

    return () => {
      active = false;
    };
  }, [userId]);

  const totalTests = useMemo(
    () => counts.hearing + counts.respiratory + counts.motor + counts.eye + counts.memory,
    [counts.eye, counts.hearing, counts.memory, counts.motor, counts.respiratory],
  );

  const accountAvatarUrl = getUserAvatarUrl(user);

  useEffect(() => {
    setAvatarUrl(accountAvatarUrl);
  }, [accountAvatarUrl]);

  const saveAvatarUrl = async (nextAvatarUrl: string | null) => {
    if (!supabase || !isSupabaseConfigured) {
      throw new Error("Supabase is not configured for account profile updates.");
    }

    const { error } = await supabase.auth.updateUser({
      data: {
        avatar_url: nextAvatarUrl,
        picture: nextAvatarUrl,
      },
    });

    if (error) {
      throw error;
    }

    setAvatarUrl(nextAvatarUrl);
  };

  const uploadToStorage = async (file: File, nextUserId: string) => {
    if (!supabase) {
      throw new Error("Supabase client is unavailable.");
    }

    const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${nextUserId}/avatar-${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_STORAGE_BUCKET)
      .upload(filePath, file, { upsert: true, contentType: file.type || "image/jpeg" });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from(AVATAR_STORAGE_BUCKET).getPublicUrl(filePath);
    if (!data?.publicUrl) {
      throw new Error("Could not build avatar URL.");
    }

    return data.publicUrl;
  };

  const handlePickAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setAvatarNotice(null);

    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) {
      setAvatarNotice("Please choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setAvatarNotice("Image is too large. Please keep it under 5MB.");
      return;
    }

    setIsAvatarSaving(true);
    try {
      let nextAvatarUrl: string;

      try {
        nextAvatarUrl = await uploadToStorage(file, userId);
      } catch {
        // Fallback keeps avatar persistence even when Storage bucket is not configured.
        nextAvatarUrl = await fileToDataUrl(file);
      }

      await saveAvatarUrl(nextAvatarUrl);
      setAvatarNotice("Profile picture updated.");
    } catch (err) {
      setAvatarNotice(err instanceof Error ? err.message : "Could not update profile picture.");
    } finally {
      setIsAvatarSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarNotice(null);
    setIsAvatarSaving(true);
    try {
      await saveAvatarUrl(null);
      setAvatarNotice("Profile picture removed.");
    } catch (err) {
      setAvatarNotice(err instanceof Error ? err.message : "Could not remove profile picture.");
    } finally {
      setIsAvatarSaving(false);
    }
  };

  const displayName = getUserDisplayName(user);

  const email = user?.email ?? "No email available";

  return (
    <div className="px-5 pt-14 pb-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-display font-bold text-foreground mb-8">Profile</h1>

        <div className="flex items-center gap-4 mb-8">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-primary" />
            )}
          </div>
          <div>
            <h2 className="font-display font-semibold text-lg text-foreground">{displayName}</h2>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </div>

        <div className="mb-6 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePickAvatar}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isAvatarSaving || !userId}
              className="flex-1 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Camera className="h-4 w-4" />
              {isAvatarSaving ? "Saving..." : "Edit Profile Picture"}
            </button>
            <button
              type="button"
              onClick={() => void handleRemoveAvatar()}
              disabled={isAvatarSaving || !avatarUrl || !userId}
              className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          </div>
          {avatarNotice && <p className="text-xs text-muted-foreground">{avatarNotice}</p>}
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
          <div className="card-elevated rounded-2xl p-4 border border-border text-center col-span-2">
            <p className="text-2xl font-display font-bold text-gradient">{highestStreak}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Best Streak (Days)</p>
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
          <div className="rounded-xl bg-secondary/50 p-4 text-sm text-foreground flex justify-between">
            <span>Eye Checker Sessions</span>
            <span className="font-semibold">{counts.eye}</span>
          </div>
          <div className="rounded-xl bg-secondary/50 p-4 text-sm text-foreground flex justify-between">
            <span>Memory Sessions</span>
            <span className="font-semibold">{counts.memory}</span>
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
