/**
 * Naive Bayes Dietary Adherence Classifier
 *
 * Predicts whether a user is at high risk of exceeding their daily calorie
 * target based on three binary features:
 *
 *   isWeekend      — Saturday or Sunday (routine breaks down)
 *   isDeficitPhase — user is in an active calorie deficit (ghrelin elevated)
 *   isHighStress   — Load Management OR Injury mode is active (willpower depleted)
 *
 * Training data comes from the user's own `nbTraining` Firestore collection,
 * which grows one row per day. Laplace (add-1) smoothing prevents
 * zero-probability likelihoods from collapsing the posterior.
 *
 * Note: isDeficitPhase and isHighStress are architecturally mutually exclusive
 * in this app (entering LM or Injury sets the deficit to 0), so only 5 of the
 * 8 feature permutations can ever produce a HIGH_RISK alert.
 */

// ─── Classifier ──────────────────────────────────────────────────────────────

export class DietaryAdherenceClassifier {
  constructor() {
    this.classCounts = { exceed: 0, under: 0 };
    this.featureCounts = {
      exceed: { isWeekend: 0, isDeficitPhase: 0, isHighStress: 0 },
      under:  { isWeekend: 0, isDeficitPhase: 0, isHighStress: 0 },
    };
    this.totalDays = 0;
  }

  /**
   * Train on an array of daily row objects (from nbTraining Firestore collection):
   *   { exceededTarget, isWeekend, isDeficitPhase, isHighStress }
   */
  train(rows) {
    rows.forEach((row) => {
      this.totalDays++;
      const cls = row.exceededTarget ? 'exceed' : 'under';
      this.classCounts[cls]++;
      if (row.isWeekend)      this.featureCounts[cls].isWeekend++;
      if (row.isDeficitPhase) this.featureCounts[cls].isDeficitPhase++;
      if (row.isHighStress)   this.featureCounts[cls].isHighStress++;
    });
  }

  /**
   * Binary Laplace-smoothed likelihood P(feature=value | class).
   * Add 1 to numerator, 2 to denominator (one pseudocount per binary outcome).
   */
  _likelihood(feature, cls, value) {
    const count  = this.featureCounts[cls][feature];
    const total  = this.classCounts[cls];
    const pTrue  = (count + 1) / (total + 2);
    return value ? pTrue : 1 - pTrue;
  }

  /**
   * Predict today's overage risk.
   * Returns null when fewer than 3 training rows exist.
   * Returns { riskLevel: 'HIGH_RISK' | 'LOW_RISK', probabilityExceed: number }
   */
  predict(context) {
    if (this.totalDays < 3) return null;

    // Laplace-smoothed class priors (binary: +1 / +2)
    // Prevents a 0-probability class from collapsing the posterior to 0 or 1
    // when the user has only seen one outcome so far.
    const pExceed = (this.classCounts.exceed + 1) / (this.totalDays + 2);
    const pUnder  = (this.classCounts.under  + 1) / (this.totalDays + 2);

    // Posterior ∝ Prior × ∏ Likelihoods  (Naive independence assumption)
    const scoreExceed = pExceed
      * this._likelihood('isWeekend',      'exceed', context.isWeekend)
      * this._likelihood('isDeficitPhase', 'exceed', context.isDeficitPhase)
      * this._likelihood('isHighStress',   'exceed', context.isHighStress);

    const scoreUnder = pUnder
      * this._likelihood('isWeekend',      'under', context.isWeekend)
      * this._likelihood('isDeficitPhase', 'under', context.isDeficitPhase)
      * this._likelihood('isHighStress',   'under', context.isHighStress);

    const total = scoreExceed + scoreUnder;
    const pct   = Math.round((scoreExceed / total) * 100);

    return {
      riskLevel: pct > 50 ? 'HIGH_RISK' : 'LOW_RISK',
      probabilityExceed: pct,
    };
  }
}

// ─── Context key ─────────────────────────────────────────────────────────────

/**
 * Maps the 3-feature boolean vector to a named risk context.
 * Returns null for (F, F, F) — no active pressure, nothing useful to say.
 */
export function getContextKey({ isWeekend, isDeficitPhase, isHighStress }) {
  if ( isWeekend &&  isDeficitPhase && !isHighStress) return 'WEEKEND_DEFICIT';
  if ( isWeekend && !isDeficitPhase &&  isHighStress) return 'WEEKEND_STRESS';
  if (!isWeekend &&  isDeficitPhase && !isHighStress) return 'DEFICIT_ONLY';
  if (!isWeekend && !isDeficitPhase &&  isHighStress) return 'STRESS_ONLY';
  if ( isWeekend && !isDeficitPhase && !isHighStress) return 'WEEKEND_ONLY';
  return null;
}

// ─── Context-aware message pools ─────────────────────────────────────────────

const CONTEXT_MESSAGES = {
  // Weekend + Active deficit
  WEEKEND_DEFICIT: [
    "weekends hit different when you're in a cut. social meals and zero structure are the two biggest calorie bombs — front-load your protein this morning to keep hunger locked down all day.",
    "deficit on a weekend is basically hard mode. your ghrelin is elevated and your routine is gone. eat something high-protein before any plans so you're not starving when food appears.",
    "weekend + active deficit = the highest-variance combo. bank a buffer early. you've already done the math — now just protect it.",
  ],

  // Weekend + High stress (LM or Injury)
  WEEKEND_STRESS: [
    "you're in recovery mode and it's the weekend — that's actually perfect alignment. your only job today is to hit maintenance, rest well, and let the stress come down. zero pressure.",
    "weekend + recovery mode means today is for resetting, not restricting. eat your maintenance calories, hydrate, and protect your bandwidth. the cut will be there when you're ready.",
    "no deficit required this weekend. stress mode is active, which means your brain needs fuel more than restriction. take care of yourself first.",
  ],

  // Weekday + Active deficit
  DEFICIT_ONLY: [
    "mid-week deficit grind is where real progress actually compounds. today's hunger is just your body adapting to the math — stay occupied, drink water, and trust the plan.",
    "running a calculated deficit mid-week. cravings are just your brain asking for cheap energy. your macros are already set to make this as manageable as it can be.",
    "quiet mid-week discipline is the underrated part of every transformation. no social pressure, no noise — just you and the numbers. that's where it stacks.",
  ],

  // Weekday + High stress (LM or Injury)
  STRESS_ONLY: [
    "you're in recovery mode today. your brain burns through glucose faster under pressure — eating your full maintenance calories isn't optional, it's the actual strategy.",
    "high cognitive or physical load means higher caloric demand. recovery mode is not a cheat window — it's a calculated maintenance period. fuel up and handle the hard thing first.",
    "recovery mode means: eat at maintenance, protect your bandwidth, and don't stack calorie stress on top of life stress. the deficit will be waiting when you're ready.",
  ],

  // Weekend + No active pressure
  WEEKEND_ONLY: [
    "weekends quietly break the routine that keeps intake consistent. try anchoring your first meal to the same time as a weekday — it keeps your hunger clock stable.",
    "no deficit, no stress mode — but weekends are still statistically the highest-variance calorie days. stay mindful, log as you go, and you'll be fine.",
    "weekend with no active pressure is the easiest scenario to handle. stay aware, keep logging honestly, and let the data stay accurate for you.",
  ],
};

/**
 * Returns a random message string from the pool for the given context key.
 * Returns null if the key is null or unrecognised.
 */
export function getRandomContextMessage(key) {
  const pool = CONTEXT_MESSAGES[key];
  if (!pool) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
