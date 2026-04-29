/**
 * NB Training Data Utility
 *
 * Manages the `users/{uid}/nbTraining/{dateKey}` Firestore collection.
 * Each document is one day's training sample:
 *
 *   dateKey        YYYY-MM-DD
 *   isWeekend      bool  — derived from the date
 *   isDeficitPhase bool  — was the user in an active calorie deficit that day?
 *   isHighStress   bool  — was Load Management OR Injury mode active that day?
 *   exceededTarget bool  — the class label (did they go over their calorie target?)
 *   source         'user_explicit' | 'meal_log_sum'
 *   recordedAt     ISO string
 *
 * Rules:
 *  - user_explicit always wins — a meal_log_sum write will never overwrite it.
 *  - isDeficitPhase / isHighStress are derived from the profile *at write time*,
 *    which is the most accurate representation of the user's state that day.
 */

import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { getLocalDateKey } from './date';

// ─── Feature derivation ───────────────────────────────────────────────────────

/**
 * True when the user's plan has a calorie deficit.
 * Returns false during Injury, Load Management, or a Deficit Cycling maintenance week.
 */
export function deriveIsDeficitPhase(profile) {
  if (!profile) return false;
  if (profile.activeInjury?.active)    return false;
  if (profile.loadManagement?.active)  return false;
  if (profile.deficitCycling?.active) {
    const dc = profile.deficitCycling;
    const daysSinceStart = Math.floor(
      (Date.now() - new Date(dc.startedAt)) / 86400000
    );
    const cycleLength = (dc.deficitWeeks + dc.maintWeeks) * 7;
    // In a deficit week if we haven't yet rolled into the maintenance portion
    return (daysSinceStart % cycleLength) < dc.deficitWeeks * 7;
  }
  return (profile.dailyDeficit || 0) > 0;
}

/**
 * True when cognitive / physical stress is elevated:
 * Load Management mode OR Injury mode are both considered high-stress states.
 */
export function deriveIsHighStress(profile) {
  if (!profile) return false;
  return !!(profile.loadManagement?.active || profile.activeInjury?.active);
}

// ─── Read / Write ─────────────────────────────────────────────────────────────

/**
 * Write (or update) a training row.
 * A 'meal_log_sum' write is silently dropped if the user already answered explicitly.
 */
export async function writeNBRow(uid, dateKey, exceededTarget, source, profile) {
  const rowRef = doc(db, 'users', uid, 'nbTraining', dateKey);

  if (source === 'meal_log_sum') {
    const existing = await getDoc(rowRef);
    if (existing.exists() && existing.data().source === 'user_explicit') return;
  }

  // Use noon to avoid local timezone edge cases when rebuilding the Date
  const date = new Date(`${dateKey}T12:00:00`);
  const dow  = date.getDay();

  await setDoc(rowRef, {
    dateKey,
    isWeekend:      dow === 0 || dow === 6,
    isDeficitPhase: deriveIsDeficitPhase(profile),
    isHighStress:   deriveIsHighStress(profile),
    exceededTarget,
    source,
    recordedAt: new Date().toISOString(),
  });
}

/** Fetch the training row for today. Returns null if it doesn't exist yet. */
export async function getTodayNBRow(uid) {
  const rowRef = doc(db, 'users', uid, 'nbTraining', getLocalDateKey());
  const snap   = await getDoc(rowRef);
  return snap.exists() ? snap.data() : null;
}

/** Fetch every training row for this user (entire history). */
export async function getAllNBRows(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'nbTraining'));
  return snap.docs.map((d) => d.data());
}

/**
 * Called on dashboard load.
 * If yesterday's training row doesn't exist yet, writes it using the meal-log sum
 * as the class label. This is the automatic fallback when the user didn't answer
 * the explicit prompt.
 */
export async function backfillYesterdayIfMissing(uid, profile) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getLocalDateKey(yesterday);

  const rowRef  = doc(db, 'users', uid, 'nbTraining', yesterdayKey);
  const existing = await getDoc(rowRef);
  if (existing.exists()) return; // already recorded, nothing to do

  const yMealsSnap = await getDocs(
    collection(db, 'users', uid, 'logs', yesterdayKey, 'meals')
  );
  const yTotal     = yMealsSnap.docs.reduce((s, m) => s + (m.data().calories || 0), 0);
  const yExceeded  = yTotal > (profile?.dailyCalorieTarget || 0);

  await writeNBRow(uid, yesterdayKey, yExceeded, 'meal_log_sum', profile);
}
