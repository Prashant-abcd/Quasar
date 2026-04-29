/**
 * Calculate time left until targetEndDate and return formatted string + raw values.
 * Falls back to createdAt + targetWeeks if no targetEndDate exists.
 * @param {object} profile - user profile object
 * @returns {{ daysLeft: number, weeksLeft: number, daysRemainder: number, label: string }}
 */
export function getTimeLeft(profile) {
  if (!profile) return { daysLeft: 0, weeksLeft: 0, daysRemainder: 0, label: '0w 0d' };

  let endDate;
  if (profile.targetEndDate) {
    endDate = new Date(profile.targetEndDate);
  } else if (profile.createdAt && profile.targetWeeks) {
    endDate = new Date(new Date(profile.createdAt).getTime() + profile.targetWeeks * 7 * 86400000);
  } else {
    // fallback — treat targetWeeks as starting from now
    endDate = new Date(Date.now() + (profile.targetWeeks || 0) * 7 * 86400000);
  }

  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((endDate - now) / 86400000));
  const weeksLeft = Math.floor(daysLeft / 7);
  const daysRemainder = daysLeft % 7;
  const label = `${weeksLeft}w ${daysRemainder}d`;

  return { daysLeft, weeksLeft, daysRemainder, label };
}
