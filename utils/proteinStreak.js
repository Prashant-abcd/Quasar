/**
 * Protein Streak & Warrior Badge System
 *
 * Daily protein goal = currentWeight × 1.8 g
 * Badge score: +10 per day protein goal met via meal logging
 * Shield: awarded every 5th completion — protects streak on a missed day
 * Protected mode (LM / Injury): streak days advance but score stays frozen
 */

// ─── Badge Definitions ────────────────────────────────────────────────────────

export const PROTEIN_BADGES = [
  {
    id: 'recruit',
    name: 'Recruit',
    minScore: 0,
    emoji: '⚔️',
    subtitle: 'Every legend starts somewhere.',
    color: '#9CA3AF',
    gradColors: ['#1F2937', '#374151'],
    borderColor: '#4B5563',
    glowColor: 'rgba(156,163,175,0.4)',
  },
  {
    id: 'scout',
    name: 'Scout',
    minScore: 100,
    emoji: '🏹',
    subtitle: 'First blood. The journey begins.',
    color: '#34D399',
    gradColors: ['#064E3B', '#065F46'],
    borderColor: '#059669',
    glowColor: 'rgba(52,211,153,0.4)',
  },
  {
    id: 'warrior',
    name: 'Warrior',
    minScore: 250,
    emoji: '🛡️',
    subtitle: 'Tested. Forged. Proven.',
    color: '#60A5FA',
    gradColors: ['#1E3A5F', '#1D4ED8'],
    borderColor: '#3B82F6',
    glowColor: 'rgba(96,165,250,0.4)',
  },
  {
    id: 'knight',
    name: 'Knight',
    minScore: 450,
    emoji: '🗡️',
    subtitle: 'Discipline is the sharpest blade.',
    color: '#A78BFA',
    gradColors: ['#2E1065', '#5B21B6'],
    borderColor: '#7C3AED',
    glowColor: 'rgba(167,139,250,0.4)',
  },
  {
    id: 'centurion',
    name: 'Centurion',
    minScore: 700,
    emoji: '👑',
    subtitle: 'Commands a hundred. Fears none.',
    color: '#FCD34D',
    gradColors: ['#78350F', '#B45309'],
    borderColor: '#F59E0B',
    glowColor: 'rgba(252,211,77,0.5)',
  },
  {
    id: 'champion',
    name: 'Champion',
    minScore: 1000,
    emoji: '🏆',
    subtitle: 'The elite among the elite.',
    color: '#FCA5A5',
    gradColors: ['#7F1D1D', '#B91C1C'],
    borderColor: '#EF4444',
    glowColor: 'rgba(252,165,165,0.5)',
  },
  {
    id: 'warlord',
    name: 'Warlord',
    minScore: 1350,
    emoji: '💀',
    subtitle: 'Feared across the realm.',
    color: '#F9A8D4',
    gradColors: ['#500724', '#9D174D'],
    borderColor: '#EC4899',
    glowColor: 'rgba(249,168,212,0.5)',
  },
  {
    id: 'legend',
    name: 'Legend',
    minScore: 1750,
    emoji: '⚡',
    subtitle: 'Mythical. Untouchable. Eternal.',
    color: '#FDBA74',
    gradColors: ['#431407', '#9A3412'],
    borderColor: '#F97316',
    glowColor: 'rgba(253,186,116,0.5)',
  },
  {
    id: 'immortal',
    name: 'Immortal',
    minScore: 2200,
    emoji: '🔱',
    subtitle: 'Beyond all mortal bounds.',
    color: '#FDE68A',
    gradColors: ['#1C1917', '#78350F'],
    borderColor: '#F59E0B',
    glowColor: 'rgba(253,230,138,0.6)',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getProteinGoal(profile) {
  const w = profile?.currentWeight || profile?.weight || 70;
  return Math.round(w * 1.8);
}

export function getBadgeForScore(score) {
  for (let i = PROTEIN_BADGES.length - 1; i >= 0; i--) {
    if (score >= PROTEIN_BADGES[i].minScore) return PROTEIN_BADGES[i];
  }
  return PROTEIN_BADGES[0];
}

export function getNextBadge(score) {
  return PROTEIN_BADGES.find((b) => score < b.minScore) ?? null;
}

export function getDefaultStreak() {
  return {
    currentStreak: 0,
    lastActiveDate: null,   // last date streak was advanced (goal met OR protected)
    lastCompletedDate: null, // last date protein goal was actually met via meals
    shields: 0,
    totalCompletions: 0,
    badgeScore: 0,
  };
}

// ─── Core daily processing ────────────────────────────────────────────────────

/**
 * Call on every dashboard focus with current protein consumed and profile.
 *
 * Rules:
 *  - Gap detected (lastActiveDate < yesterday) AND not protected → use shield or reset
 *  - If protein goal met today AND not already credited → award +10, advance streak
 *  - If in LM / Injury (protected) AND not yet advanced today → advance streak, no score
 *
 * Returns { updated: bool, streak: object }
 * Caller must persist to Firestore when updated === true.
 */
export function processDailyStreak(rawStreak, proteinConsumed, profile, todayKey, yesterdayKey) {
  const s = { ...rawStreak };
  let updated = false;

  const isProtected = !!(profile?.loadManagement?.active || profile?.activeInjury?.active);
  const alreadyDoneToday = s.lastActiveDate === todayKey;

  // ── Step 1: handle any gap since last active date ──────────────────────────
  if (s.lastActiveDate && s.lastActiveDate < yesterdayKey && !alreadyDoneToday) {
    if (!isProtected) {
      if (s.shields > 0) {
        s.shields -= 1;
        // streak preserved, no streak increment for the missed period
      } else {
        s.currentStreak = 0;
        s.badgeScore = 0;
      }
      updated = true;
    }
    // If protected, gap is ignored — streak survives
  }

  // ── Step 2: process today ──────────────────────────────────────────────────
  if (!alreadyDoneToday) {
    const proteinGoal = getProteinGoal(profile);
    const goalMet = proteinConsumed >= proteinGoal;

    if (goalMet) {
      s.currentStreak += 1;
      s.lastActiveDate = todayKey;
      s.lastCompletedDate = todayKey;
      s.totalCompletions += 1;
      s.badgeScore += 10;
      if (s.totalCompletions % 5 === 0) s.shields += 1; // award shield
      updated = true;
    } else if (isProtected) {
      // streak advances but score frozen
      s.currentStreak += 1;
      s.lastActiveDate = todayKey;
      updated = true;
    }
    // Goal not yet met today, not protected → don't advance; user still has rest of day
  }

  return { updated, streak: s };
}
