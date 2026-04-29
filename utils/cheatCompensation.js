import { getLocalDateKey } from './date';

const DAY_MS = 24 * 60 * 60 * 1000;

const toWholeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

export const parseDateKey = (dateKey) => {
  if (typeof dateKey !== 'string') return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

export const addDaysToDateKey = (dateKey, days) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  parsed.setDate(parsed.getDate() + days);
  return getLocalDateKey(parsed);
};

export const formatDateKey = (dateKey, options = {}) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return '—';
  return parsed.toLocaleDateString('en-IN', options);
};

const getDayDiff = (startDateKey, endDateKey) => {
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
};

export const normalizeCheatCompensation = (compensation) => {
  if (!compensation || typeof compensation !== 'object') return null;

  const excessCalories = toWholeNumber(compensation.excessCalories);
  const compensationDays = toWholeNumber(compensation.compensationDays);
  const startDateKey = compensation.startDateKey;
  const endDateKey = compensation.endDateKey;
  const cheatDateKey = compensation.cheatDateKey;

  if (!excessCalories || !compensationDays || !startDateKey || !endDateKey || !cheatDateKey) {
    return null;
  }

  const baseDailyReduction = toWholeNumber(
    compensation.baseDailyReduction ?? compensation.dailyReduction
  );
  const remainderCalories = toWholeNumber(compensation.remainderCalories);

  return {
    ...compensation,
    excessCalories,
    compensationDays,
    startDateKey,
    endDateKey,
    cheatDateKey,
    baseDailyReduction,
    remainderCalories,
  };
};

export const buildCheatCompensation = ({
  todayKey = getLocalDateKey(),
  excessCalories,
  compensationDays,
}) => {
  const safeExcess = Math.max(0, Math.round(Number(excessCalories) || 0));
  const safeDays = Math.max(1, Math.round(Number(compensationDays) || 0));
  const baseDailyReduction = Math.floor(safeExcess / safeDays);
  const remainderCalories = safeExcess % safeDays;
  const startDateKey = addDaysToDateKey(todayKey, 1);
  const endDateKey = addDaysToDateKey(todayKey, safeDays);

  return {
    cheatDateKey: todayKey,
    createdAt: new Date().toISOString(),
    excessCalories: safeExcess,
    compensationDays: safeDays,
    baseDailyReduction,
    remainderCalories,
    dailyReduction: remainderCalories === 0 ? baseDailyReduction : undefined,
    startDateKey,
    endDateKey,
  };
};

export const getCompensationReductionForDate = (
  compensation,
  dateKey = getLocalDateKey()
) => {
  const normalized = normalizeCheatCompensation(compensation);
  if (!normalized || dateKey < normalized.startDateKey || dateKey > normalized.endDateKey) {
    return 0;
  }

  const dayOffset = Math.max(0, getDayDiff(normalized.startDateKey, dateKey));
  const bonusReduction = dayOffset < normalized.remainderCalories ? 1 : 0;
  return normalized.baseDailyReduction + bonusReduction;
};

export const getCheatDayAllowanceForDate = (
  compensation,
  dateKey = getLocalDateKey()
) => {
  const normalized = normalizeCheatCompensation(compensation);
  if (!normalized || dateKey !== normalized.cheatDateKey) {
    return 0;
  }

  return normalized.excessCalories;
};

export const buildCompensationSchedule = (compensation) => {
  const normalized = normalizeCheatCompensation(compensation);
  if (!normalized) return [];

  return Array.from({ length: normalized.compensationDays }, (_, index) => {
    const dateKey = addDaysToDateKey(normalized.startDateKey, index);
    return {
      dayNumber: index + 1,
      dateKey,
      reduction:
        normalized.baseDailyReduction + (index < normalized.remainderCalories ? 1 : 0),
    };
  });
};

export const getCompensationReductionRange = (compensation) => {
  const normalized = normalizeCheatCompensation(compensation);
  if (!normalized) return { min: 0, max: 0 };
  return {
    min: normalized.baseDailyReduction,
    max: normalized.baseDailyReduction + (normalized.remainderCalories > 0 ? 1 : 0),
  };
};

export const getEffectiveCalorieTarget = (
  baseTarget,
  compensation,
  dateKey = getLocalDateKey()
) => {
  const safeBaseTarget = Math.max(0, Math.round(Number(baseTarget) || 0));
  return Math.max(
    0,
    safeBaseTarget
      + getCheatDayAllowanceForDate(compensation, dateKey)
      - getCompensationReductionForDate(compensation, dateKey)
  );
};

export const getCheatCompensationState = (
  compensation,
  dateKey = getLocalDateKey()
) => {
  const normalized = normalizeCheatCompensation(compensation);

  if (!normalized) {
    return {
      status: 'none',
      isBlocked: false,
      isScheduled: false,
      isActive: false,
      isCheatDay: false,
      daysRemaining: 0,
      completedDays: 0,
      todayAllowance: 0,
      currentReduction: 0,
      todayNetChange: 0,
      nextReduction: 0,
      schedule: [],
      compensation: null,
    };
  }

  const schedule = buildCompensationSchedule(normalized);
  const isCheatDay = dateKey === normalized.cheatDateKey;

  if (dateKey < normalized.startDateKey) {
    return {
      status: isCheatDay ? 'cheat_day' : 'scheduled',
      isBlocked: true,
      isScheduled: !isCheatDay,
      isActive: false,
      isCheatDay,
      daysRemaining: normalized.compensationDays,
      completedDays: 0,
      todayAllowance: isCheatDay ? normalized.excessCalories : 0,
      currentReduction: 0,
      todayNetChange: isCheatDay ? normalized.excessCalories : 0,
      nextReduction: getCompensationReductionForDate(normalized, normalized.startDateKey),
      schedule,
      compensation: normalized,
    };
  }

  if (dateKey > normalized.endDateKey) {
    return {
      status: 'complete',
      isBlocked: false,
      isScheduled: false,
      isActive: false,
      isCheatDay: false,
      daysRemaining: 0,
      completedDays: normalized.compensationDays,
      todayAllowance: 0,
      currentReduction: 0,
      todayNetChange: 0,
      nextReduction: 0,
      schedule,
      compensation: normalized,
    };
  }

  const daysRemaining = getDayDiff(dateKey, normalized.endDateKey) + 1;
  const completedDays = normalized.compensationDays - daysRemaining;
  const tomorrowKey = addDaysToDateKey(dateKey, 1);

  return {
    status: 'active',
    isBlocked: true,
    isScheduled: false,
    isActive: true,
    isCheatDay: false,
    daysRemaining,
    completedDays,
    todayAllowance: 0,
    currentReduction: getCompensationReductionForDate(normalized, dateKey),
    todayNetChange: -getCompensationReductionForDate(normalized, dateKey),
    nextReduction:
      tomorrowKey && tomorrowKey <= normalized.endDateKey
        ? getCompensationReductionForDate(normalized, tomorrowKey)
        : 0,
    schedule,
    compensation: normalized,
  };
};
