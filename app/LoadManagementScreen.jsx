import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated, Easing, Dimensions, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { useRouter } from 'expo-router';
import { getLocalDateKey } from '../utils/date';
import { writeNBRow, getTodayNBRow, backfillYesterdayIfMissing } from '../utils/nbTraining';
import { markNBAnswered, isNBAnsweredToday } from '../utils/nbAnswered';
import { buildNBCheckInPrompt } from '../utils/nbCheckInPrompt';
import { processDailyStreak, getDefaultStreak } from '../utils/proteinStreak';
import ProteinWarriorCard from '../components/ProteinWarriorCard';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Warm amber/gold palette ─────────────────────────────────────────────────
const PAL = {
  bg1: '#FFFDF5', bg2: '#FFF8E1', bg3: '#FFECB3',
  accent: '#F59E0B', accentDark: '#78350F', accentLight: '#FCD34D',
  card: '#FFFFFF', cardBorder: '#FDE68A', softBg: '#FEF3C7',
  text: '#78350F', textSoft: '#92400E', textGray: '#6B7280',
  glow: 'rgba(252,211,77,0.35)', ringBg: '#FEF3C7',
  warm: '#D97706', warmLight: '#FBBF24',
};

// ── Friendly messages for entry ─────────────────────────────────────────────
const ENTRY_MESSAGES = [
  {
    emoji: '☕',
    title: "hey, life happens and that's okay",
    body: "exams, family stuff, stress — your body needs fuel right now, not a deficit. we're pausing the cut and giving you exactly what you need to stay sharp and functional. zero guilt, zero pressure.",
  },
  {
    emoji: '🫂',
    title: "you're not quitting, you're being smart",
    body: "taking care of yourself during a rough patch isn't weakness — it's literally the smartest thing you can do. we'll hold your progress safe while you handle life.",
  },
  {
    emoji: '🧠',
    title: "your brain needs carbs to function, fr",
    body: "when you're under pressure, your brain burns through glucose like crazy. starving yourself right now would make everything harder. let's fuel you properly instead.",
  },
];

// ── Friendly messages for active mode ───────────────────────────────────────
const ACTIVE_MESSAGES = [
  "you're doing amazing — just eat, rest, and handle your stuff. we got the numbers covered.",
  "no workout expectations, no deficit stress. just maintain and breathe.",
  "your only job right now is to take care of yourself. the grind will be there when you're ready.",
  "eat your maintenance calories, keep your brain fed, and focus on what matters.",
  "this isn't a break from progress — this IS progress. you're protecting your health.",
];

// ── ACTIVITY_DATA for workout calorie calculation ───────────────────────────
const ACTIVITY_DATA = {
  'Running': { metValue: 8, label: 'Running' },
  'Walking': { metValue: 3.5, label: 'Walking' },
  'Cycling': { metValue: 6, label: 'Cycling' },
  'Swimming': { metValue: 7, label: 'Swimming' },
  'Gym/Weights': { metValue: 5, label: 'Gym/Weights' },
  'Yoga': { metValue: 3, label: 'Yoga' },
  'Sports': { metValue: 7, label: 'Sports' },
  'HIIT': { metValue: 9, label: 'HIIT' },
  'Dancing': { metValue: 5.5, label: 'Dancing' },
  'Jump Rope': { metValue: 10, label: 'Jump Rope' },
  'Pilates': { metValue: 3.5, label: 'Pilates' },
  'Martial Arts': { metValue: 8, label: 'Martial Arts' },
};

const calcWorkoutWeeklyBurn = (activitySettings, weight) => {
  if (!activitySettings || typeof activitySettings !== 'object') return 0;
  return Object.entries(activitySettings).reduce((total, [name, settings]) => {
    const met = ACTIVITY_DATA[name]?.metValue || 5;
    const days = settings.daysPerWeek || 0;
    const hours = settings.hoursPerDay || 0;
    const burnPerSession = met * weight * hours;
    return total + burnPerSession * days;
  }, 0);
};

// ── Dialog component ────────────────────────────────────────────────────────
function LMDialog({ visible, variant = 'info', title, message, actions, onClose }) {
  if (!visible) return null;
  const iconMap = { info: 'information-outline', warning: 'alert-circle-outline', success: 'check-circle-outline', error: 'close-circle-outline' };
  const colorMap = { info: '#F59E0B', warning: '#D97706', success: '#16A34A', error: '#DC2626' };
  const bgMap = { info: '#FFFBEB', warning: '#FFFBEB', success: '#F0FDF4', error: '#FEF2F2' };
  const ic = colorMap[variant];
  return (
    <View style={dlg.overlay}>
      <View style={[dlg.card, { backgroundColor: bgMap[variant], borderColor: ic + '40' }]}>
        <View style={[dlg.iconCircle, { backgroundColor: ic + '18' }]}>
          <MaterialCommunityIcons name={iconMap[variant]} size={28} color={ic} />
        </View>
        <Text style={[dlg.title, { color: PAL.accentDark }]}>{title}</Text>
        {message ? <Text style={dlg.message}>{message}</Text> : null}
        <View style={dlg.actions}>
          {(actions || [{ label: 'OK', onPress: onClose }]).map((a, i) => (
            <TouchableOpacity
              key={i}
              style={[dlg.btn, i === 0 && { backgroundColor: ic }]}
              onPress={() => { a.onPress?.(); onClose?.(); }}
            >
              <Text style={[dlg.btnText, i === 0 ? { color: '#fff' } : { color: ic }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}
const dlg = StyleSheet.create({
  overlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', borderRadius: 24, padding: 24, borderWidth: 1.5, alignItems: 'center' },
  iconCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  message: { fontSize: 13, color: '#4B5563', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  actions: { flexDirection: 'row', gap: 10, width: '100%' },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.06)' },
  btnText: { fontSize: 14, fontWeight: '700' },
});

// ── Animated number counter ─────────────────────────────────────────────────
function AnimatedNum({ value, style, duration = 800 }) {
  const animVal = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const id = animVal.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(animVal, {
      toValue: value, duration,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    return () => animVal.removeListener(id);
  }, [animVal, duration, value]);
  return <Text style={style}>{display}</Text>;
}

// ── Breathing glow ──────────────────────────────────────────────────────────
function BreathingGlow({ color, size = 180 }) {
  const s = useRef(new Animated.Value(0.6)).current;
  const o = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(s, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(s, { toValue: 0.6, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(o, { toValue: 0.6, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.3, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ])).start();
  }, [o, s]);
  return (
    <Animated.View style={{
      position: 'absolute', width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, opacity: o, transform: [{ scale: s }],
    }} />
  );
}

// ── Macro bar ───────────────────────────────────────────────────────────────
function MacroBar({ label, grams, pct, color, icon, delay = 0 }) {
  const w = useRef(new Animated.Value(0)).current;
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(w, { toValue: pct, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(o, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, [delay, o, pct, w]);
  const widthInterp = w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return (
    <Animated.View style={{ opacity: o, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <MaterialCommunityIcons name={icon} size={14} color={color} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>{label}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <AnimatedNum value={grams} style={{ fontSize: 16, fontWeight: '900', color }} />
          <Text style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '600' }}>g</Text>
          <Text style={{ fontSize: 10, color: '#D1D5DB', marginLeft: 4 }}>({pct}%)</Text>
        </View>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: color + '15', overflow: 'hidden' }}>
        <Animated.View style={{ height: '100%', borderRadius: 3, backgroundColor: color, width: widthInterp }} />
      </View>
    </Animated.View>
  );
}

// ── Fade card ───────────────────────────────────────────────────────────────
function FadeCard({ children, delay = 0, style }) {
  const o = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(o, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(y, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
    ]).start();
  }, [delay, o, y]);
  return (
    <Animated.View style={[style, { opacity: o, transform: [{ translateY: y }] }]}>
      {children}
    </Animated.View>
  );
}

// ── Pulse dot ───────────────────────────────────────────────────────────────
function PulseDot({ color = '#F59E0B' }) {
  const s = useRef(new Animated.Value(1)).current;
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(s, { toValue: 2, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(s, { toValue: 1, duration: 0, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(o, { toValue: 0, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(o, { toValue: 1, duration: 0, useNativeDriver: true }),
      ]),
    ])).start();
  }, [o, s]);
  return (
    <View style={{ width: 12, height: 12, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View style={{
        position: 'absolute', width: 12, height: 12, borderRadius: 6,
        backgroundColor: color, opacity: o, transform: [{ scale: s }],
      }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

// ── Day counter badge ───────────────────────────────────────────────────────
function DayBadge({ startDate }) {
  const start = new Date(startDate);
  const now = new Date();
  const days = Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
  const dayLabel = days === 1 ? 'just started — one day at a time'
    : days < 4 ? "early days — you're doing great"
    : days < 7 ? 'almost a week — hang in there'
    : days < 14 ? "over a week strong — you're handling it"
    : 'you are genuinely incredible for lasting this long';
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: PAL.softBg, borderRadius: 20,
      paddingHorizontal: 14, paddingVertical: 8,
      borderWidth: 1, borderColor: PAL.cardBorder, alignSelf: 'center', marginBottom: 16,
    }}>
      <MaterialCommunityIcons name="shield-sun-outline" size={16} color={PAL.accent} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: PAL.accentDark }}>
        Load Management · Day {days}
      </Text>
      <Text style={{ fontSize: 11, color: PAL.textGray }}>{dayLabel}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════════════════
const STEP = { CONFIRM: 1, ACTIVE: 2, EXIT: 3 };

export default function LoadManagementScreen() {
  const router = useRouter();
  const [step, setStep] = useState(STEP.CONFIRM);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // dialog
  const [dialog, setDialog] = useState({ visible: false });
  const showDialog = (opts) => setDialog({ visible: true, ...opts });
  const hideDialog = () => setDialog({ visible: false });

  // active mode data
  const [lmData, setLmData] = useState(null);
  const [proteinStreak, setProteinStreak] = useState(getDefaultStreak());
  const [proteinConsumed, setProteinConsumed] = useState(0);

  // exit flow
  const [exitChoice, setExitChoice] = useState(null); // 'extend' or 'compress'

  // NB check-in
  const [todayNBAnswered, setTodayNBAnswered] = useState(() => isNBAnsweredToday());

  // random messages
  const [entryMsgIdx] = useState(() => Math.floor(Math.random() * ENTRY_MESSAGES.length));
  const [activeMsgIdx] = useState(() => Math.floor(Math.random() * ACTIVE_MESSAGES.length));

  // screen animation
  const screenFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [screenFade, step]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const uid = auth.currentUser.uid;
      const snap = await getDoc(doc(db, 'users', uid, 'profile', 'data'));
      if (!snap.exists()) return;
      const p = snap.data();
      setProfile(p);
      if (p.loadManagement?.active) {
        setLmData(p.loadManagement);
        setStep(STEP.ACTIVE);
        await backfillYesterdayIfMissing(uid, p);
        const todayRow = await getTodayNBRow(uid);
        const answered = isNBAnsweredToday() || todayRow?.source === 'user_explicit';
        if (todayRow?.source === 'user_explicit') markNBAnswered();
        setTodayNBAnswered(answered);
        // load protein consumed + streak
        const today = getLocalDateKey();
        const mSnap = await getDocs(collection(db, 'users', uid, 'logs', today, 'meals'));
        let pro = 0;
        mSnap.docs.forEach(d => { pro += d.data().protein || 0; });
        setProteinConsumed(pro);
        const rawStreak = p.proteinStreak ?? getDefaultStreak();
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        const { updated, streak } = processDailyStreak(rawStreak, pro, p, getLocalDateKey(), getLocalDateKey(yesterday));
        setProteinStreak(streak);
        if (updated) await updateDoc(doc(db, 'users', uid, 'profile', 'data'), { proteinStreak: streak });
      }
    } catch (e) { console.log(e.message); }
    finally { setLoading(false); }
  };

  const handleNBAnswer = async (exceeded) => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid || !profile) return;
      await writeNBRow(uid, getLocalDateKey(), exceeded, 'user_explicit', profile);
      markNBAnswered();
      setTodayNBAnswered(true);
    } catch (e) { console.log('NB answer:', e.message); }
  };

  const confirmNBAnswer = (exceeded) => {
    showDialog(buildNBCheckInPrompt(exceeded, () => handleNBAnswer(exceeded)));
  };

  // ── Calculate maintenance plan ──────────────────────────────────────────────
  const calcMaintenancePlan = useCallback((prof) => {
    const w = prof.currentWeight || prof.weight;
    const h = prof.height;
    const age = prof.age;
    const g = prof.gender;

    // Mifflin-St Jeor BMR
    const bmr = g === 'Male'
      ? Math.round(10 * w + 6.25 * h - 5 * age + 5)
      : Math.round(10 * w + 6.25 * h - 5 * age - 161);

    // Sedentary TDEE — no workouts expected
    const sedentaryTDEE = Math.round(bmr * 1.2);

    // Macro split: high carbs for brain function, moderate protein, moderate fat
    const carbsPct = 55;
    const proteinPct = 20;
    const fatPct = 25;

    const carbsG = Math.round((sedentaryTDEE * carbsPct / 100) / 4);
    const proteinG = Math.round((sedentaryTDEE * proteinPct / 100) / 4);
    const fatG = Math.round((sedentaryTDEE * fatPct / 100) / 9);

    return {
      active: true,
      currentWeight: w,
      bmr,
      sedentaryTDEE,
      dailyCalories: sedentaryTDEE,
      carbsPct, proteinPct, fatPct,
      carbsG, proteinG, fatG,
      startedAt: new Date().toISOString(),
      // preserve original plan info for exit recalculation
      originalGoalWeight: prof.goalWeight,
      originalTargetWeeks: prof.targetWeeks,
      originalTargetEndDate: prof.targetEndDate || null,
      originalDailyDeficit: prof.dailyDeficit ?? prof.totalDailyDeficit ?? 0,
      originalStartWeight: prof.weight,
      originalActivitySettings: prof.activitySettings || {},
    };
  }, []);

  // ── Enter load management ───────────────────────────────────────────────────
  const handleEnterMode = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // Show streak protection info before activating
    showDialog({
      variant: 'info',
      title: 'warrior protocol — safe mode',
      message: 'your protein streak days will keep counting during load management, but your badge score will stay frozen until you exit. no points lost — just paused.',
      actions: [{ label: 'got it, activate', onPress: () => activateLM() }],
    });
  };
  const activateLM = async () => {
    setSaving(true);
    try {
      const plan = calcMaintenancePlan(profile);
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'profile', 'data'), {
        loadManagement: plan,
      });
      setLmData(plan);
      screenFade.setValue(0);
      setStep(STEP.ACTIVE);
      setTimeout(() => showDialog({
        variant: 'info',
        title: 'warrior protocol protected',
        message: 'your day streak will keep counting while you\'re in load management, but your badge score won\'t change. once you exit, the warrior protocol goes back to normal.',
      }), 400);
    } catch (e) {
      showDialog({ variant: 'error', title: 'oops', message: e.message });
    } finally { setSaving(false); }
  };

  // ── Exit: start the exit flow ───────────────────────────────────────────────
  const handleStartExit = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    screenFade.setValue(0);
    setExitChoice(null);
    setStep(STEP.EXIT);
  };

  // ── Calculate exit options dynamically ──────────────────────────────────────
  const getExitOptions = useCallback(() => {
    if (!lmData || !profile) return { extend: null, compress: null };

    const currentW = lmData.currentWeight;
    const goalW = lmData.originalGoalWeight;
    const originalDeficit = lmData.originalDailyDeficit;

    // How many days were spent in load management
    const startDate = new Date(lmData.startedAt);
    const now = new Date();
    const lmDays = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));

    const excessKg = Math.max(0, currentW - goalW);

    // OPTION 1: Keep original deficit, extend end date
    const extendDays = originalDeficit > 0 ? Math.max(1, Math.ceil((excessKg * 7700) / originalDeficit)) : 70;
    const extendWeeks = Math.ceil(extendDays / 7);
    const extendEndDate = new Date(now.getTime() + extendDays * 86400000);
    const extendDeficit = originalDeficit;

    // OPTION 2: Keep original end date, adjust deficit
    let compressEndDate;
    if (lmData.originalTargetEndDate) {
      compressEndDate = new Date(lmData.originalTargetEndDate);
    } else if (lmData.originalTargetWeeks) {
      const createdAt = profile.createdAt ? new Date(profile.createdAt) : startDate;
      compressEndDate = new Date(createdAt.getTime() + lmData.originalTargetWeeks * 7 * 86400000);
    } else {
      compressEndDate = new Date(now.getTime() + 7 * 86400000);
    }
    const compressDaysLeft = Math.max(1, Math.ceil((compressEndDate - now) / 86400000));
    const compressWeeks = Math.ceil(compressDaysLeft / 7);
    const compressDeficit = excessKg > 0
      ? Math.round((excessKg * 7700) / compressDaysLeft)
      : 0;

    // Recalculate calories for both options
    const g = profile.gender;
    const h = profile.height;
    const age = profile.age;
    const bmr = g === 'Male'
      ? Math.round(10 * currentW + 6.25 * h - 5 * age + 5)
      : Math.round(10 * currentW + 6.25 * h - 5 * age - 161);
    const sedentaryTDEE = Math.round(bmr * 1.2);
    
    // Accurate MET-based workout burn using old entry activity settings
    const weeklyWkBurn = calcWorkoutWeeklyBurn(lmData.originalActivitySettings, currentW);
    const dailyWkBurn = Math.round(weeklyWkBurn / 7);

    const extendFoodDeficit = Math.max(0, extendDeficit - dailyWkBurn);
    const extendCalories = Math.round(sedentaryTDEE - extendFoodDeficit);

    const compressFoodDeficit = Math.max(0, compressDeficit - dailyWkBurn);
    const compressCalories = Math.round(sedentaryTDEE - compressFoodDeficit);

    return {
      lmDays,
      lmWeeks: Math.ceil(lmDays / 7),
      currentWeight: currentW,
      goalWeight: goalW,
      excessKg,
      bmr,
      sedentaryTDEE,
      extend: {
        weeks: extendWeeks,
        deficit: extendDeficit,
        targetEndDate: extendEndDate.toISOString(),
        foodDeficit: extendFoodDeficit,
        calories: extendCalories,
        label: 'Keep my original deficit, take more time',
        desc: `same ${extendDeficit} kcal/day deficit — will take ~${extendWeeks} weeks to reach ${goalW} kg`,
      },
      compress: {
        weeks: compressWeeks,
        deficit: compressDeficit,
        targetEndDate: compressEndDate.toISOString(),
        foodDeficit: compressFoodDeficit,
        calories: compressCalories,
        label: 'Keep my original timeline, adjust deficit',
        desc: compressDeficit > 0
          ? `${compressWeeks} weeks left — deficit adjusts to ${compressDeficit} kcal/day`
          : `${compressWeeks} weeks left — no deficit needed, you're close to goal!`,
      },
    };
  }, [lmData, profile]);

  // ── Finalize exit ───────────────────────────────────────────────────────────
  const handleExitConfirm = async () => {
    if (!exitChoice) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSaving(true);

    try {
      const opts = getExitOptions();
      const chosen = opts[exitChoice];
      const uid = auth.currentUser.uid;

      const g = profile.gender;
      const h = profile.height;
      const age = profile.age;
      const currentW = opts.currentWeight;

      const bmr = g === 'Male'
        ? Math.round(10 * currentW + 6.25 * h - 5 * age + 5)
        : Math.round(10 * currentW + 6.25 * h - 5 * age - 161);
      const sedentaryTDEE = Math.round(bmr * 1.2);

      await setDoc(doc(db, 'users', uid, 'profile', 'data'), {
        ...profile,
        currentWeight: currentW,
        bmr,
        sedentaryTDEE,
        tdee: sedentaryTDEE,
        targetWeeks: chosen.weeks,
        targetEndDate: chosen.targetEndDate,
        dailyDeficit: chosen.deficit,
        totalDailyDeficit: chosen.deficit,
        foodDeficit: chosen.foodDeficit,
        dailyCalorieTarget: chosen.calories,
        activitySettings: lmData.originalActivitySettings || profile.activitySettings || {},
        weeklyWorkoutCalories: Object.entries(lmData.originalActivitySettings || {}).reduce((total, [, settings]) => {
          return total + (settings.daysPerWeek || 3) * (settings.hoursPerDay || 1) * 200;
        }, 0),
        loadManagement: null,
        lastLoadManagementEndedAt: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showDialog({
        variant: 'success',
        title: 'welcome back, champ!',
        message: `you handled that like a pro.\n\nnew daily target: ${chosen.calories} kcal\ndeficit: ${chosen.deficit} kcal/day\ntimeline: ${chosen.weeks} weeks\n\nlet's finish what you started.`,
        actions: [{ label: "let's go!", onPress: () => router.replace('/(tabs)') }],
      });
    } catch (e) {
      showDialog({ variant: 'error', title: 'error', message: e.message });
    } finally { setSaving(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
        <Image source={require('../assets/images/quasar.png')} style={{ width: 240, height: 240 }} resizeMode="contain" />
        <ActivityIndicator size="large" color={PAL.accent} style={{ marginTop: 40 }} />
        <Text style={{ marginTop: 20, color: PAL.accentDark, fontWeight: '600', fontSize: 13 }}>setting up your safe space...</Text>
      </View>
    );
  }

  // ── Step 1: Confirm entry ──────────────────────────────────────────────────
  if (step === STEP.CONFIRM) {
    const currentW = profile?.currentWeight || profile?.weight || 0;
    const plan = profile ? calcMaintenancePlan(profile) : null;
    const entryMsg = ENTRY_MESSAGES[entryMsgIdx];

    return (
      <Animated.View style={{ flex: 1, backgroundColor: PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[PAL.bg1, PAL.bg2, PAL.bg3]} style={StyleSheet.absoluteFill} />
        <LMDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={[st.backBtn, { backgroundColor: PAL.softBg, borderColor: PAL.cardBorder }]}
            onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={PAL.accent} />
          </TouchableOpacity>

          <FadeCard style={st.heroBox}>
            <Text style={st.heroEmoji}>{entryMsg.emoji}</Text>
            <Text style={[st.heroTitle, { color: PAL.text }]}>{entryMsg.title}</Text>
            <Text style={[st.heroSub, { color: PAL.textSoft }]}>{entryMsg.body}</Text>
          </FadeCard>

          {/* What this mode does */}
          <FadeCard delay={100} style={[st.infoCard, { borderColor: PAL.cardBorder }]}>
            <Text style={[st.infoCardTitle, { color: PAL.text }]}>what happens in this mode?</Text>
            {[
              { icon: 'close-circle-outline', color: '#EF4444', text: 'no calorie deficit — your body needs full fuel right now' },
              { icon: 'run-fast', color: '#6B7280', text: 'no workout expectations — rest is productive too' },
              { icon: 'brain', color: '#8B5CF6', text: 'extra carbs — your brain literally runs on glucose' },
              { icon: 'food-apple-outline', color: '#F59E0B', text: 'no meal logging required — just eat mindfully' },
              { icon: 'shield-check-outline', color: '#16A34A', text: 'your progress is safe — we pick up right where you left off' },
            ].map((item, i) => (
              <View key={i} style={st.infoRow}>
                <MaterialCommunityIcons name={item.icon} size={16} color={item.color} />
                <Text style={[st.infoText, { color: PAL.textSoft }]}>{item.text}</Text>
              </View>
            ))}
          </FadeCard>

          {/* Preview numbers */}
          {plan && (
            <FadeCard delay={200} style={[st.previewCard, { borderColor: PAL.cardBorder }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <MaterialCommunityIcons name="calculator-variant-outline" size={16} color={PAL.accent} />
                <Text style={[st.previewCardTitle, { color: PAL.textGray }]}>YOUR MAINTENANCE PLAN</Text>
              </View>

              <View style={st.previewStatsRow}>
                <View style={[st.previewStat, { backgroundColor: '#F59E0B08', borderColor: '#F59E0B20' }]}>
                  <Text style={[st.previewStatVal, { color: PAL.warm }]}>{currentW}</Text>
                  <Text style={st.previewStatLbl}>current weight (kg)</Text>
                </View>
                <View style={[st.previewStat, { backgroundColor: '#F59E0B08', borderColor: '#F59E0B20' }]}>
                  <Text style={[st.previewStatVal, { color: PAL.warm }]}>{plan.bmr}</Text>
                  <Text style={st.previewStatLbl}>your BMR</Text>
                </View>
              </View>

              <View style={[st.calorieHighlight, { borderColor: PAL.cardBorder }]}>
                <Text style={[st.calorieHighlightLabel, { color: PAL.textGray }]}>daily calorie target</Text>
                <Text style={[st.calorieHighlightVal, { color: PAL.accentDark }]}>{plan.dailyCalories}</Text>
                <Text style={[st.calorieHighlightUnit, { color: PAL.textSoft }]}>kcal/day to maintain {currentW} kg</Text>
              </View>

              <Text style={[st.macroTitle, { color: PAL.textGray }]}>RECOMMENDED MACROS</Text>
              <MacroBar label="Carbs" grams={plan.carbsG} pct={plan.carbsPct}
                color="#F59E0B" icon="barley" delay={300} />
              <MacroBar label="Protein" grams={plan.proteinG} pct={plan.proteinPct}
                color="#EF4444" icon="food-steak" delay={450} />
              <MacroBar label="Fat" grams={plan.fatG} pct={plan.fatPct}
                color="#3B82F6" icon="water" delay={600} />

              <View style={[st.carbNote, { backgroundColor: '#8B5CF618', borderColor: '#8B5CF630' }]}>
                <MaterialCommunityIcons name="brain" size={14} color="#8B5CF6" />
                <Text style={{ flex: 1, fontSize: 11, lineHeight: 17, color: '#6D28D9' }}>
                  carbs are intentionally higher — your brain uses ~120g glucose/day just for basic function. under stress, it needs even more.
                </Text>
              </View>
            </FadeCard>
          )}

          <FadeCard delay={300}>
            <TouchableOpacity
              style={[st.btnAccent, { backgroundColor: PAL.accent, opacity: saving ? 0.6 : 1 }]}
              onPress={handleEnterMode}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                  <MaterialCommunityIcons name="shield-sun" size={20} color="#fff" />
                  <Text style={st.btnAccentText}>enter load management mode</Text>
                </>
              }
            </TouchableOpacity>
            <Text style={[st.footnote, { color: PAL.textGray }]}>
              you can exit anytime — your original plan stays safe
            </Text>
          </FadeCard>

          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  // ── Step 2: Active mode ────────────────────────────────────────────────────
  if (step === STEP.ACTIVE && lmData) {
    return (
      <Animated.View style={{ flex: 1, backgroundColor: PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[PAL.bg1, PAL.bg2, PAL.bg3]} style={StyleSheet.absoluteFill} />
        <LMDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <FadeCard delay={0} style={st.activeHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PulseDot color={PAL.accent} />
              <Text style={[st.activeTitle, { color: PAL.text }]}>Load Management</Text>
            </View>
            <View style={[st.modeBadge, { backgroundColor: PAL.accent + '18', borderColor: PAL.accent + '35' }]}>
              <MaterialCommunityIcons name="shield-sun" size={14} color={PAL.accent} />
              <Text style={[st.modeBadgeText, { color: PAL.accent }]}>Active</Text>
            </View>
          </FadeCard>

          {/* Day counter */}
          <DayBadge startDate={lmData.startedAt} />

          {/* Warm message */}
          <FadeCard delay={100} style={[st.warmCard, { borderColor: PAL.cardBorder }]}>
            <View style={{
              width: 48, height: 48, borderRadius: 24, backgroundColor: PAL.accent + '15',
              justifyContent: 'center', alignItems: 'center', marginBottom: 10,
            }}>
              <MaterialCommunityIcons name="hand-heart-outline" size={24} color={PAL.accent} />
            </View>
            <Text style={[st.warmTitle, { color: PAL.text }]}>you're in safe mode</Text>
            <Text style={[st.warmMsg, { color: PAL.textSoft }]}>
              {ACTIVE_MESSAGES[activeMsgIdx]}
            </Text>
          </FadeCard>

          {/* Calorie target card */}
          <FadeCard delay={200} style={[st.calorieCard, { borderColor: PAL.cardBorder }]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <BreathingGlow color={PAL.glow} size={160} />
              <View style={{
                width: 140, height: 140, borderRadius: 70,
                backgroundColor: PAL.softBg, borderWidth: 2, borderColor: PAL.cardBorder,
                justifyContent: 'center', alignItems: 'center',
              }}>
                <AnimatedNum value={lmData.dailyCalories} style={{
                  fontSize: 36, fontWeight: '900', color: PAL.accentDark, letterSpacing: -1,
                }} />
                <Text style={{ fontSize: 11, color: PAL.textSoft, marginTop: 2, fontWeight: '600' }}>kcal/day</Text>
                <Text style={{ fontSize: 10, color: PAL.textGray, marginTop: 1 }}>maintenance</Text>
              </View>
            </View>
            <Text style={[st.calNote, { color: PAL.textGray }]}>
              this is exactly what your body needs to maintain {lmData.currentWeight} kg with zero activity — no more, no less. just eat around this and you're golden.
            </Text>
          </FadeCard>

          {/* Daily check-in */}
          {!todayNBAnswered && (
            <FadeCard delay={260} style={[st.nbCheckCard, { borderColor: PAL.cardBorder }]}>
              <Text style={[st.nbCheckText, { color: PAL.text }]}>did you stay within your calorie target today?</Text>
              <View style={st.nbCheckBtns}>
                <TouchableOpacity style={st.nbCheckBtnGood} onPress={() => confirmNBAnswer(false)}>
                  <Text style={st.nbCheckBtnText}>✓  stayed within</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.nbCheckBtnOver} onPress={() => confirmNBAnswer(true)}>
                  <Text style={st.nbCheckBtnText}>↑  went over</Text>
                </TouchableOpacity>
              </View>
            </FadeCard>
          )}

          {/* Macros */}
          <FadeCard delay={300} style={[st.macroCard, { borderColor: PAL.cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <MaterialCommunityIcons name="chart-donut" size={16} color={PAL.accent} />
              <Text style={[st.macroCardTitle, { color: PAL.textGray }]}>FUEL DISTRIBUTION</Text>
            </View>
            <MacroBar label="Carbs" grams={lmData.carbsG} pct={lmData.carbsPct}
              color="#F59E0B" icon="barley" delay={400} />
            <MacroBar label="Protein" grams={lmData.proteinG} pct={lmData.proteinPct}
              color="#EF4444" icon="food-steak" delay={550} />
            <MacroBar label="Fat" grams={lmData.fatG} pct={lmData.fatPct}
              color="#3B82F6" icon="water" delay={700} />

            <View style={[st.carbNote, { backgroundColor: '#8B5CF618', borderColor: '#8B5CF630' }]}>
              <MaterialCommunityIcons name="brain" size={14} color="#8B5CF6" />
              <Text style={{ flex: 1, fontSize: 11, lineHeight: 17, color: '#6D28D9' }}>
                extra carbs keep your brain sharp during exams and stressful times. this isn't indulgence — it's science.
              </Text>
            </View>
          </FadeCard>

          {/* Stats grid */}
          <FadeCard delay={400} style={[st.statsGrid, { borderColor: PAL.cardBorder }]}>
            {[
              { val: lmData.bmr, lbl: 'Your BMR', icon: 'heart-outline', color: '#6B7280' },
              { val: lmData.sedentaryTDEE, lbl: 'Maintenance', icon: 'fire', color: '#F59E0B' },
              { val: lmData.currentWeight, lbl: 'Current (kg)', icon: 'scale-bathroom', color: '#8B5CF6' },
              { val: 0, lbl: 'Deficit', icon: 'trending-down', color: '#16A34A' },
            ].map((s, i) => (
              <View key={i} style={[st.statCell, { backgroundColor: s.color + '08', borderColor: s.color + '20' }]}>
                <MaterialCommunityIcons name={s.icon} size={16} color={s.color} style={{ marginBottom: 4 }} />
                <AnimatedNum value={s.val} style={[st.statVal, { color: s.color }]} />
                <Text style={st.statLbl}>{s.lbl}</Text>
              </View>
            ))}
          </FadeCard>

          {/* Warrior protocol */}
          <FadeCard delay={450}>
            <ProteinWarriorCard proteinStreak={proteinStreak} proteinConsumed={proteinConsumed} profile={profile} />
          </FadeCard>

          {/* Reminder card */}
          <FadeCard delay={500} style={[st.reminderCard, { borderColor: PAL.cardBorder }]}>
            <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={PAL.accent} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[st.reminderTitle, { color: PAL.text }]}>remember</Text>
              <Text style={[st.reminderText, { color: PAL.textSoft }]}>
                no meal logging needed right now. just eat around {lmData.dailyCalories} kcal, prioritize carbs and sleep, and focus on what actually matters in your life right now. the deficit will be waiting when you're ready — it's not going anywhere.
              </Text>
            </View>
          </FadeCard>

          {/* End mode button */}
          <FadeCard delay={600}>
            <TouchableOpacity
              style={[st.endBtn, { borderColor: '#16A34A' }]}
              onPress={handleStartExit}
            >
              <LinearGradient
                colors={['#F0FDF4', '#DCFCE7']}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, paddingVertical: 16, borderRadius: 14,
                }}
              >
                <MaterialCommunityIcons name="rocket-launch" size={20} color="#16A34A" />
                <Text style={st.endBtnText}>i'm ready to get back at it</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={[st.endNote, { color: PAL.textGray }]}>
              take all the time you need — there's no rush, seriously
            </Text>
          </FadeCard>

          <View style={{ height: 48 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  // ── Step 3: Exit flow ──────────────────────────────────────────────────────
  if (step === STEP.EXIT) {
    const opts = getExitOptions();

    return (
      <Animated.View style={{ flex: 1, backgroundColor: PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[PAL.bg1, PAL.bg2, '#DCFCE7']} style={StyleSheet.absoluteFill} />
        <LMDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={[st.backBtn, { backgroundColor: PAL.softBg, borderColor: PAL.cardBorder }]}
            onPress={() => { screenFade.setValue(0); setStep(STEP.ACTIVE); }}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={PAL.accent} />
          </TouchableOpacity>

          <FadeCard style={st.heroBox}>
            <Text style={st.heroEmoji}>🎉</Text>
            <Text style={[st.heroTitle, { color: PAL.text }]}>you made it through!</Text>
            <Text style={[st.heroSub, { color: PAL.textSoft }]}>
              proud of you for taking care of yourself. now let's figure out how you want to get back on track — no wrong answer here.
            </Text>
          </FadeCard>

          {/* Summary */}
          <FadeCard delay={100} style={[st.exitSummaryCard, { borderColor: PAL.cardBorder }]}>
            <Text style={[st.exitSummaryTitle, { color: PAL.textGray }]}>LOAD MANAGEMENT SUMMARY</Text>
            <View style={st.exitSummaryRow}>
              <View style={st.exitSummaryStat}>
                <Text style={[st.exitSummaryVal, { color: PAL.accentDark }]}>{opts.lmDays}</Text>
                <Text style={st.exitSummaryLbl}>days in LM</Text>
              </View>
              <View style={[st.exitSummaryDivider, { backgroundColor: PAL.cardBorder }]} />
              <View style={st.exitSummaryStat}>
                <Text style={[st.exitSummaryVal, { color: PAL.accentDark }]}>{opts.currentWeight}</Text>
                <Text style={st.exitSummaryLbl}>current kg</Text>
              </View>
              <View style={[st.exitSummaryDivider, { backgroundColor: PAL.cardBorder }]} />
              <View style={st.exitSummaryStat}>
                <Text style={[st.exitSummaryVal, { color: PAL.accentDark }]}>{opts.goalWeight}</Text>
                <Text style={st.exitSummaryLbl}>goal kg</Text>
              </View>
              <View style={[st.exitSummaryDivider, { backgroundColor: PAL.cardBorder }]} />
              <View style={st.exitSummaryStat}>
                <Text style={[st.exitSummaryVal, { color: PAL.accentDark }]}>{opts.excessKg.toFixed(1)}</Text>
                <Text style={st.exitSummaryLbl}>kg to go</Text>
              </View>
            </View>
          </FadeCard>

          {/* Choice cards */}
          <FadeCard delay={200}>
            <Text style={[st.choiceTitle, { color: PAL.text }]}>how do you want to come back?</Text>
          </FadeCard>

          {/* Option 1: Extend */}
          {opts.extend && (
            <FadeCard delay={250}>
              <TouchableOpacity
                style={[st.choiceCard, { borderColor: exitChoice === 'extend' ? '#16A34A' : PAL.cardBorder },
                  exitChoice === 'extend' && { borderWidth: 2, backgroundColor: '#F0FDF4' }]}
                onPress={() => { Haptics.selectionAsync(); setExitChoice('extend'); }}
                activeOpacity={0.88}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: exitChoice === 'extend' ? '#16A34A18' : PAL.softBg,
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <MaterialCommunityIcons name="clock-outline" size={18}
                      color={exitChoice === 'extend' ? '#16A34A' : PAL.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.choiceCardTitle, { color: exitChoice === 'extend' ? '#14532D' : PAL.text }]}>
                      {opts.extend.label}
                    </Text>
                  </View>
                  {exitChoice === 'extend' && (
                    <MaterialCommunityIcons name="check-circle" size={22} color="#16A34A" />
                  )}
                </View>
                <Text style={[st.choiceCardDesc, { color: exitChoice === 'extend' ? '#4B7C5E' : PAL.textGray }]}>
                  {opts.extend.desc}
                </Text>
                <View style={st.choiceStatsRow}>
                  <View style={st.choiceStatBox}>
                    <Text style={[st.choiceStatVal, { color: exitChoice === 'extend' ? '#16A34A' : PAL.warm }]}>{opts.extend.calories}</Text>
                    <Text style={st.choiceStatLbl}>kcal/day</Text>
                  </View>
                  <View style={st.choiceStatBox}>
                    <Text style={[st.choiceStatVal, { color: exitChoice === 'extend' ? '#16A34A' : PAL.warm }]}>{opts.extend.deficit}</Text>
                    <Text style={st.choiceStatLbl}>deficit</Text>
                  </View>
                  <View style={st.choiceStatBox}>
                    <Text style={[st.choiceStatVal, { color: exitChoice === 'extend' ? '#16A34A' : PAL.warm }]}>{opts.extend.weeks}</Text>
                    <Text style={st.choiceStatLbl}>weeks</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </FadeCard>
          )}

          {/* Option 2: Compress */}
          {opts.compress && (
            <FadeCard delay={350}>
              <TouchableOpacity
                style={[st.choiceCard, { borderColor: exitChoice === 'compress' ? '#16A34A' : PAL.cardBorder },
                  exitChoice === 'compress' && { borderWidth: 2, backgroundColor: '#F0FDF4' }]}
                onPress={() => { Haptics.selectionAsync(); setExitChoice('compress'); }}
                activeOpacity={0.88}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: exitChoice === 'compress' ? '#16A34A18' : PAL.softBg,
                    justifyContent: 'center', alignItems: 'center',
                  }}>
                    <MaterialCommunityIcons name="lightning-bolt" size={18}
                      color={exitChoice === 'compress' ? '#16A34A' : PAL.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.choiceCardTitle, { color: exitChoice === 'compress' ? '#14532D' : PAL.text }]}>
                      {opts.compress.label}
                    </Text>
                  </View>
                  {exitChoice === 'compress' && (
                    <MaterialCommunityIcons name="check-circle" size={22} color="#16A34A" />
                  )}
                </View>
                <Text style={[st.choiceCardDesc, { color: exitChoice === 'compress' ? '#4B7C5E' : PAL.textGray }]}>
                  {opts.compress.desc}
                </Text>
                <View style={st.choiceStatsRow}>
                  <View style={st.choiceStatBox}>
                    <Text style={[st.choiceStatVal, { color: exitChoice === 'compress' ? '#16A34A' : PAL.warm }]}>{opts.compress.calories}</Text>
                    <Text style={st.choiceStatLbl}>kcal/day</Text>
                  </View>
                  <View style={st.choiceStatBox}>
                    <Text style={[st.choiceStatVal, { color: exitChoice === 'compress' ? '#16A34A' : PAL.warm }]}>{opts.compress.deficit}</Text>
                    <Text style={st.choiceStatLbl}>deficit</Text>
                  </View>
                  <View style={st.choiceStatBox}>
                    <Text style={[st.choiceStatVal, { color: exitChoice === 'compress' ? '#16A34A' : PAL.warm }]}>{opts.compress.weeks}</Text>
                    <Text style={st.choiceStatLbl}>weeks</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </FadeCard>
          )}

          {/* Warning if compress deficit is high */}
          {exitChoice === 'compress' && opts.compress.deficit > 500 && (
            <FadeCard delay={400}>
              <View style={[st.warningBox, { backgroundColor: '#FEF2F218', borderColor: '#EF444430' }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#EF4444" />
                <Text style={{ flex: 1, fontSize: 11, lineHeight: 17, color: '#B91C1C' }}>
                  heads up — a {opts.compress.deficit} kcal/day deficit is pretty aggressive. if that feels too much, go with the extended timeline instead. no shame in taking it slow.
                </Text>
              </View>
            </FadeCard>
          )}

          <FadeCard delay={450}>
            <TouchableOpacity
              style={[st.btnAccent, {
                backgroundColor: '#16A34A', marginTop: 10,
                opacity: !exitChoice || saving ? 0.4 : 1,
              }]}
              onPress={handleExitConfirm}
              disabled={!exitChoice || saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                  <Text style={st.btnAccentText}>lock in this plan</Text>
                  <MaterialCommunityIcons name="rocket-launch" size={18} color="#fff" />
                </>
              }
            </TouchableOpacity>
          </FadeCard>

          <View style={{ height: 48 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  return null;
}

// ── Styles ──────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  scroll: { padding: 20, paddingTop: 56 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, justifyContent: 'center',
    alignItems: 'center', marginBottom: 16, borderWidth: 1,
  },

  heroBox: { alignItems: 'center', marginBottom: 24 },
  heroEmoji: { fontSize: 44, marginBottom: 10 },
  heroTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: -0.5 },
  heroSub: { fontSize: 13, textAlign: 'center', lineHeight: 21, maxWidth: 320 },

  infoCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 20,
    borderWidth: 1, marginBottom: 16,
  },
  infoCardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 20 },

  previewCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 20,
    borderWidth: 1, marginBottom: 16,
  },
  previewCardTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  previewStatsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  previewStat: {
    flex: 1, alignItems: 'center', borderRadius: 14,
    paddingVertical: 12, borderWidth: 1,
  },
  previewStatVal: { fontSize: 22, fontWeight: '900' },
  previewStatLbl: { fontSize: 10, color: '#6B7280', marginTop: 3 },

  calorieHighlight: {
    alignItems: 'center', backgroundColor: '#FFFBEB',
    borderRadius: 16, padding: 18, borderWidth: 1, marginBottom: 16,
  },
  calorieHighlightLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  calorieHighlightVal: { fontSize: 42, fontWeight: '900', letterSpacing: -1, marginVertical: 4 },
  calorieHighlightUnit: { fontSize: 12, fontWeight: '600' },

  macroTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 12 },

  carbNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: 12, padding: 12, borderWidth: 1, marginTop: 4,
  },

  btnAccent: {
    borderRadius: 16, paddingVertical: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnAccentText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  footnote: { fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 18 },

  // Active screen
  activeHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  activeTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  modeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6,
  },
  modeBadgeText: { fontSize: 12, fontWeight: '700' },

  warmCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 22,
    borderWidth: 1, marginBottom: 16, alignItems: 'center',
  },
  warmTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  warmMsg: { fontSize: 13, textAlign: 'center', lineHeight: 21 },

  calorieCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 22,
    borderWidth: 1, marginBottom: 16, alignItems: 'center',
  },
  calNote: { fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 8 },

  macroCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 20,
    borderWidth: 1, marginBottom: 16,
  },
  macroCardTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    backgroundColor: '#fff', borderRadius: 22, padding: 12,
    borderWidth: 1, marginBottom: 16,
  },
  statCell: {
    width: (SCREEN_W - 80) / 2 - 6, alignItems: 'center',
    borderRadius: 14, paddingVertical: 12, borderWidth: 1,
  },
  statVal: { fontSize: 18, fontWeight: '900' },
  statLbl: { fontSize: 9, color: '#6B7280', marginTop: 3, textAlign: 'center' },

  reminderCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 22, padding: 18,
    borderWidth: 1, marginBottom: 16,
  },
  reminderTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  reminderText: { fontSize: 12, lineHeight: 19 },

  endBtn: { borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, marginBottom: 8 },
  endBtnText: { fontSize: 15, fontWeight: '800', color: '#14532D' },
  endNote: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 16 },

  // Exit flow
  exitSummaryCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 16,
    borderWidth: 1, marginBottom: 16,
  },
  exitSummaryTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 12 },
  exitSummaryRow: { flexDirection: 'row', alignItems: 'center' },
  exitSummaryStat: { flex: 1, alignItems: 'center' },
  exitSummaryVal: { fontSize: 20, fontWeight: '800' },
  exitSummaryLbl: { fontSize: 10, color: '#6B7280', marginTop: 3 },
  exitSummaryDivider: { width: 1, height: 30 },

  choiceTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  choiceCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 18,
    borderWidth: 1, marginBottom: 12,
  },
  choiceCardTitle: { fontSize: 14, fontWeight: '800' },
  choiceCardDesc: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  choiceStatsRow: { flexDirection: 'row', gap: 8 },
  choiceStatBox: {
    flex: 1, alignItems: 'center', backgroundColor: '#FFFBEB',
    borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#FDE68A',
  },
  choiceStatVal: { fontSize: 18, fontWeight: '900' },
  choiceStatLbl: { fontSize: 9, color: '#6B7280', marginTop: 2 },

  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 8,
  },

  // NB check-in
  nbCheckCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, marginBottom: 16,
  },
  nbCheckText: { fontSize: 13, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  nbCheckBtns: { flexDirection: 'row', gap: 10 },
  nbCheckBtnGood: {
    flex: 1, backgroundColor: '#16A34A', borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
  },
  nbCheckBtnOver: {
    flex: 1, backgroundColor: '#EA580C', borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
  },
  nbCheckBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
