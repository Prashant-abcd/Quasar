/**
 * Recalculate profile fields after workout/activity changes.
 * Returns the updated fields to merge into Firebase profile.
 */
import { calcTotalWeeklyBurn } from './injuryData';

export function recalcProfileWithActivities(profile, newActivitySettings) {
  const w = profile.currentWeight || profile.weight;
  const h = profile.height;
  const age = profile.age;
  const g = profile.gender;

  // Mifflin-St Jeor BMR
  const bmr = g === 'Male'
    ? Math.round(10 * w + 6.25 * h - 5 * age + 5)
    : Math.round(10 * w + 6.25 * h - 5 * age - 161);

  const sedentaryTDEE = Math.round(bmr * 1.2);
  const weeklyWkBurn = calcTotalWeeklyBurn(newActivitySettings);
  const dailyWkBurn = Math.round(weeklyWkBurn / 7);

  // Recalculate deficit from weight difference (same logic as onboarding/WeeklyCheckIn)
  const remainingKg = Math.max(0, w - (profile.goalWeight || w));
  const targetWeeks = profile.targetWeeks || 12;
  let rawDailyDeficit = remainingKg > 0
    ? Math.round((remainingKg * 7700) / (targetWeeks * 7))
    : 0;
  if (rawDailyDeficit < 100 && remainingKg > 0) rawDailyDeficit = 100;

  const foodDeficit = Math.max(0, rawDailyDeficit - dailyWkBurn);
  const dailyCalorieTarget = Math.round(sedentaryTDEE - foodDeficit);

  return {
    activitySettings: newActivitySettings,
    weeklyWorkoutCalories: weeklyWkBurn,
    bmr,
    tdee: sedentaryTDEE,
    sedentaryTDEE,
    dailyDeficit: rawDailyDeficit,
    totalDailyDeficit: rawDailyDeficit,
    foodDeficit,
    dailyCalorieTarget,
  };
}
