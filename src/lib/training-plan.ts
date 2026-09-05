export type TrainingPlanSetInput = {
  sequenceNo: number;
  distanceMeters: number;
  repeatCount: number;
  swimmingStyleId: string;
  targetTimeSeconds?: number | null;
  restIntervalSeconds?: number | null;
  notes?: string | null;
  isActive?: boolean;
};

export function formatPlanDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function generateTrainingPlanName(
  planDate: string | Date,
  styleNames: string[],
  period?: string | null
): string {
  const uniqueStyles = [...new Set(styleNames.filter(Boolean))];
  if (!uniqueStyles.length) return "";
  const style = uniqueStyles.length === 1 ? uniqueStyles[0] : "Mixed Swim";
  const periodPrefix = period?.trim() ? `${period.trim()} ` : "";
  return `${periodPrefix}${style} Practice - ${formatPlanDate(planDate)}`;
}

export function validateTrainingPlanSets(sets: TrainingPlanSetInput[]) {
  if (!sets.length) return "Add at least one training set.";
  const sequence = new Set<number>();
  for (const set of sets) {
    if (!Number.isInteger(set.sequenceNo) || set.sequenceNo < 1) return "Set sequence numbers must be positive integers.";
    if (sequence.has(set.sequenceNo)) return "Set sequence numbers must be unique.";
    sequence.add(set.sequenceNo);
    if (!Number.isFinite(set.distanceMeters) || set.distanceMeters <= 0) return "Distance must be greater than zero.";
    if (!Number.isInteger(set.repeatCount) || set.repeatCount <= 0) return "Repeats must be a positive integer.";
    if (!set.swimmingStyleId) return "Select a swimming style for every set.";
  }
  return null;
}

export function trainingPlanSetData(set: TrainingPlanSetInput, styleName: string) {
  return {
    sequenceNo: Number(set.sequenceNo),
    distanceMeters: Number(set.distanceMeters),
    repeatCount: Number(set.repeatCount),
    swimmingStyleId: set.swimmingStyleId,
    setLabel: `${Number(set.distanceMeters)}m x ${Number(set.repeatCount)} ${styleName}`,
    targetTimeSeconds: set.targetTimeSeconds == null ? null : Number(set.targetTimeSeconds),
    restIntervalSeconds: set.restIntervalSeconds == null ? null : Number(set.restIntervalSeconds),
    notes: set.notes?.trim() || null,
    isActive: set.isActive ?? true,
  };
}
