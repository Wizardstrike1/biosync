import {
  HearingHistoryEntry,
  MotorHistoryEntry,
  RespiratoryHistoryEntry,
} from "@/lib/testHistory";

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const respiratoryLabelPenalty: Record<RespiratoryHistoryEntry["label"], number> = {
  normal: 0,
  crackle: 18,
  wheeze: 18,
  both: 32,
};

const respiratoryScore = (entry: RespiratoryHistoryEntry) => {
  // Lower RMS and a "normal" label indicate better respiratory quality.
  const rmsPenalty = Math.min(40, entry.rms * 85);
  const confidenceBoost = (entry.confidencePercent / 100) * 10;
  const labelPenalty = respiratoryLabelPenalty[entry.label];
  return clampScore(100 - rmsPenalty - labelPenalty + confidenceBoost);
};

const latest = <T extends { createdAt: string }>(entries: T[]) =>
  [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;

export type HealthScoreBreakdown = {
  overall: number;
  hearing: number | null;
  respiratory: number | null;
  motor: number | null;
};

export const computeHealthScore = (
  hearingHistory: HearingHistoryEntry[],
  respiratoryHistory: RespiratoryHistoryEntry[],
  motorHistory: MotorHistoryEntry[],
): HealthScoreBreakdown => {
  const latestHearing = latest(hearingHistory);
  const latestRespiratory = latest(respiratoryHistory);
  const latestMotor = latest(motorHistory);

  const hearing = latestHearing ? clampScore(latestHearing.tonesHeardPercent) : null;
  const respiratory = latestRespiratory ? respiratoryScore(latestRespiratory) : null;
  const motor = latestMotor ? clampScore(latestMotor.stabilityPercent) : null;

  const activeScores = [hearing, respiratory, motor].filter((value): value is number => value !== null);
  const overall = activeScores.length ? clampScore(activeScores.reduce((sum, value) => sum + value, 0) / activeScores.length) : 0;

  return {
    overall,
    hearing,
    respiratory,
    motor,
  };
};
