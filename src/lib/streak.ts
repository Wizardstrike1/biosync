const MS_PER_DAY = 24 * 60 * 60 * 1000;

const startOfLocalDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const getDayTimestamps = (createdAtValues: string[]) => {
  const completedDays = new Set<number>();

  createdAtValues.forEach((createdAt) => {
    const date = new Date(createdAt);
    if (!Number.isNaN(date.getTime())) {
      completedDays.add(startOfLocalDay(date).getTime());
    }
  });

  return [...completedDays].sort((a, b) => b - a);
};

export const computeCurrentDailyStreak = (createdAtValues: string[]) => {
  const sortedDays = getDayTimestamps(createdAtValues);

  if (sortedDays.length === 0) {
    return { streak: 0, completedToday: false };
  }

  const today = startOfLocalDay(new Date()).getTime();
  const latest = sortedDays[0];
  const daysFromLatestToToday = Math.floor((today - latest) / MS_PER_DAY);

  if (daysFromLatestToToday > 1) {
    return { streak: 0, completedToday: false };
  }

  let streak = 1;
  for (let i = 1; i < sortedDays.length; i += 1) {
    const gap = Math.floor((sortedDays[i - 1] - sortedDays[i]) / MS_PER_DAY);
    if (gap !== 1) {
      break;
    }
    streak += 1;
  }

  return {
    streak,
    completedToday: latest === today,
  };
};

export const computeHighestDailyStreak = (createdAtValues: string[]) => {
  const sortedDesc = getDayTimestamps(createdAtValues);

  if (sortedDesc.length === 0) {
    return 0;
  }

  const sortedAsc = [...sortedDesc].reverse();
  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedAsc.length; i += 1) {
    const gap = Math.floor((sortedAsc[i] - sortedAsc[i - 1]) / MS_PER_DAY);

    if (gap === 1) {
      currentStreak += 1;
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
      continue;
    }

    currentStreak = 1;
  }

  return maxStreak;
};
