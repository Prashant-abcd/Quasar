/**
 * In-memory global flag: has the user already answered the NB check-in today?
 * Shared across all screens so answering once hides the prompt everywhere.
 */
import { getLocalDateKey } from './date';

let _answeredDate = null;

export function markNBAnswered() {
  _answeredDate = getLocalDateKey();
}

export function isNBAnsweredToday() {
  return _answeredDate === getLocalDateKey();
}
