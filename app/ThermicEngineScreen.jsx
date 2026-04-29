import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Animated, Easing, Dimensions, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getLocalDateKey } from '../utils/date';
import { writeNBRow, getTodayNBRow, backfillYesterdayIfMissing } from '../utils/nbTraining';
import { markNBAnswered, isNBAnsweredToday } from '../utils/nbAnswered';
import { buildNBCheckInPrompt } from '../utils/nbCheckInPrompt';
import { processDailyStreak, getDefaultStreak } from '../utils/proteinStreak';
import ProteinWarriorCard from '../components/ProteinWarriorCard';
import WorkoutEditor from '../components/WorkoutEditor';
import { recalcProfileWithActivities } from '../utils/recalcWorkout';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Orange/fire palette ─────────────────────────────────────────────────────
const PAL = {
  bg1: '#FFFAF5', bg2: '#FFF3E0', bg3: '#FFE0B2',
  accent: '#FF6D00', accentDark: '#BF360C', accentLight: '#FFAB40',
  card: '#FFFFFF', cardBorder: '#FFCC80', softBg: '#FFF3E0',
  text: '#BF360C', textSoft: '#D84315', textGray: '#6B7280',
  glow: 'rgba(255,109,0,0.25)', ringBg: '#FFF3E0',
  warm: '#E65100', warmLight: '#FF9100',
};

// ── TEF percentages (clinical values) ───────────────────────────────────────
const TEF = { protein: 0.25, carbs: 0.08, fat: 0.02 };

// ── Study references ────────────────────────────────────────────────────────
const STUDIES = [
  {
    authors: 'Calcagno, M. et al.',
    year: 2019,
    title: 'The Thermic Effect of Food: A Review',
    journal: 'Journal of the American College of Nutrition',
    doi: '10.1080/07315724.2018.1552544',
    summary: 'Comprehensive review confirming that TEF accounts for approximately 10% of total energy intake, with protein having the highest thermic effect (20-30%), followed by carbohydrates (5-10%) and fats (0-3%).',
  },
  {
    authors: 'Westerterp-Plantenga, M. S. et al.',
    year: 2013,
    title: 'Thermic effect of a meal and appetite in adults',
    journal: 'Food & Nutrition Research',
    doi: '10.3402/fnr.v57i0.19212',
    summary: 'Demonstrated that high-protein meals produce significantly greater thermogenesis and satiety compared to high-carb or high-fat meals, supporting strategic macronutrient selection for weight management.',
  },
];

// ── Explanation facts ───────────────────────────────────────────────────────
// ── Active mode messages ────────────────────────────────────────────────────
const ACTIVE_MESSAGES = [
  "every meal you log earns you a refund. protein-heavy meals = bigger refunds.",
  "your body is literally burning calories to process food. we're just counting them.",
  "this is physics, not magic. digestion costs energy, and now you can see exactly how much.",
  "high-protein meals aren't just good for muscle — they give you the biggest TEF refund.",
  "most calorie apps ignore TEF. you're getting a more accurate picture of your real intake.",
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

// ── Helper: calculate TEF refund from macros ────────────────────────────────
const calcTEFRefund = (proteinG, carbsG, fatG) => {
  const proteinCal = (proteinG || 0) * 4;
  const carbsCal = (carbsG || 0) * 4;
  const fatCal = (fatG || 0) * 9;
  const proteinTEF = proteinCal * TEF.protein;
  const carbsTEF = carbsCal * TEF.carbs;
  const fatTEF = fatCal * TEF.fat;
  return {
    total: Math.round(proteinTEF + carbsTEF + fatTEF),
    proteinTEF: Math.round(proteinTEF),
    carbsTEF: Math.round(carbsTEF),
    fatTEF: Math.round(fatTEF),
    grossCalories: Math.round(proteinCal + carbsCal + fatCal),
  };
};

// ── Animated number ─────────────────────────────────────────────────────────
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
function MacroBar({ label, grams, pct, color, icon, delay = 0, tefPct }) {
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
          {tefPct != null && (
            <View style={{ backgroundColor: '#FF6D0015', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: '#FF6D00' }}>{tefPct}% TEF</Text>
            </View>
          )}
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
function PulseDot({ color = '#FF6D00' }) {
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

// ── Dialog component ────────────────────────────────────────────────────────
function TEDialog({ visible, variant = 'info', title, message, actions, onClose }) {
  if (!visible) return null;
  const iconMap = { info: 'information-outline', warning: 'alert-circle-outline', success: 'check-circle-outline', error: 'close-circle-outline' };
  const colorMap = { info: '#FF6D00', warning: '#E65100', success: '#16A34A', error: '#DC2626' };
  const bgMap = { info: '#FFF8F0', warning: '#FFF8F0', success: '#F0FDF4', error: '#FEF2F2' };
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

// ── Day counter ─────────────────────────────────────────────────────────────
function DayBadge({ startDate }) {
  const start = new Date(startDate);
  const now = new Date();
  const days = Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: PAL.softBg, borderRadius: 20,
      paddingHorizontal: 14, paddingVertical: 8,
      borderWidth: 1, borderColor: PAL.cardBorder, alignSelf: 'center', marginBottom: 16,
    }}>
      <MaterialCommunityIcons name="fire" size={16} color={PAL.accent} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: PAL.accentDark }}>
        Thermic Engine · Day {days}
      </Text>
    </View>
  );
}

// ── Calorie Ring ────────────────────────────────────────────────────────────
function CalorieRing({ consumed, target, refunded, size = 180 }) {
  const netConsumed = Math.max(0, consumed - refunded);
  const remaining = Math.max(0, target - netConsumed);
  const pct = target > 0 ? Math.min(1, netConsumed / target) : 0;

  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animPct = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(animPct, {
      toValue: pct, duration: 1200,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [animPct, pct]);

  const animOffset = animPct.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <SvgGrad id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FF6D00" />
            <Stop offset="1" stopColor="#FFAB40" />
          </SvgGrad>
        </Defs>
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={PAL.ringBg} strokeWidth={strokeWidth} fill="none"
        />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="url(#ringGrad)" strokeWidth={strokeWidth} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animOffset}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <AnimatedNum value={remaining} style={{ fontSize: 32, fontWeight: '900', color: PAL.accentDark, letterSpacing: -1 }} />
        <Text style={{ fontSize: 10, color: PAL.textGray, fontWeight: '600', marginTop: 2 }}>kcal left</Text>
        {refunded > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4, backgroundColor: '#FF6D0012', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
            <MaterialCommunityIcons name="fire" size={11} color="#FF6D00" />
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#FF6D00' }}>+{refunded} refunded</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// AnimatedCircle for the ring
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ═══════════════════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════════════════
const STEP = { EXPLAIN: 1, CONFIRM: 2, ACTIVE: 3, EXIT: 4 };

export default function ThermicEngineScreen() {
  const router = useRouter();
  const [step, setStep] = useState(STEP.EXPLAIN);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // dialog
  const [dialog, setDialog] = useState({ visible: false });
  const showDialog = (opts) => setDialog({ visible: true, ...opts });
  const hideDialog = () => setDialog({ visible: false });

  // active data
  const [teData, setTeData] = useState(null);
  const [todayRefund, setTodayRefund] = useState(0);
  const [todayGross, setTodayGross] = useState(0);
  const [proteinConsumed, setProteinConsumed] = useState(0);
  const [proteinStreak, setProteinStreak] = useState(getDefaultStreak());

  // exit choice
  const [exitChoice, setExitChoice] = useState(null);

  // workout edit
  const [workoutSaving, setWorkoutSaving] = useState(false);

  // NB check-in
  const [todayNBAnswered, setTodayNBAnswered] = useState(() => isNBAnsweredToday());

  // random messages
  const [activeMsgIdx] = useState(() => Math.floor(Math.random() * ACTIVE_MESSAGES.length));

  // screen animation
  const screenFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [screenFade, step]);

  // Initial load only; focus refreshes keep active-mode data current after mount.
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh meals + streak every time screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (teData?.active) {
        const uid = auth.currentUser.uid;
        (async () => {
          const todayProtein = await loadTodayMeals(uid);
          const snap = await getDoc(doc(db, 'users', uid, 'profile', 'data'));
          if (!snap.exists()) return;
          const p = snap.data();
          setProfile(p);
          if (p.thermicEngine?.active) setTeData(p.thermicEngine);
          const rawStreak = p.proteinStreak ?? getDefaultStreak();
          const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
          const { updated, streak } = processDailyStreak(rawStreak, todayProtein, p, getLocalDateKey(), getLocalDateKey(yesterday));
          setProteinStreak(streak);
          if (updated) await updateDoc(doc(db, 'users', uid, 'profile', 'data'), { proteinStreak: streak });
        })();
      }
    }, [teData])
  );

  const loadData = async () => {
    try {
      const uid = auth.currentUser.uid;
      const snap = await getDoc(doc(db, 'users', uid, 'profile', 'data'));
      if (!snap.exists()) return;
      const p = snap.data();
      setProfile(p);
      if (p.thermicEngine?.active) {
        setTeData(p.thermicEngine);
        setStep(STEP.ACTIVE);
        const todayProtein = await loadTodayMeals(uid);
        await backfillYesterdayIfMissing(uid, p);
        const todayRow = await getTodayNBRow(uid);
        const answered = isNBAnsweredToday() || todayRow?.source === 'user_explicit';
        if (todayRow?.source === 'user_explicit') markNBAnswered();
        setTodayNBAnswered(answered);
        // protein streak
        const rawStreak = p.proteinStreak ?? getDefaultStreak();
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        const { updated, streak } = processDailyStreak(rawStreak, todayProtein, p, getLocalDateKey(), getLocalDateKey(yesterday));
        setProteinStreak(streak);
        if (updated) await updateDoc(doc(db, 'users', uid, 'profile', 'data'), { proteinStreak: streak });
      }
    } catch (e) { console.log(e.message); }
    finally { setLoading(false); }
  };

  const loadTodayMeals = async (uid) => {
    try {
      const todayKey = getLocalDateKey();
      const mealsSnap = await getDocs(collection(db, 'users', uid, 'logs', todayKey, 'meals'));
      let totalProtein = 0, totalCarbs = 0, totalFat = 0, totalCal = 0;
      mealsSnap.forEach((mealDoc) => {
        const m = mealDoc.data();
        totalProtein += m.protein || 0;
        totalCarbs += m.carbs || 0;
        totalFat += m.fat || 0;
        totalCal += m.calories || 0;
      });
      setTodayGross(Math.round(totalCal));
      setProteinConsumed(totalProtein);
      const refund = calcTEFRefund(totalProtein, totalCarbs, totalFat);
      setTodayRefund(refund.total);
      return totalProtein;
    } catch (e) { console.log('load meals err:', e.message); return 0; }
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

  const handleWorkoutSave = async (newSettings) => {
    if (!profile) return;
    setWorkoutSaving(true);
    try {
      const updates = recalcProfileWithActivities(profile, newSettings);
      const uid = auth.currentUser.uid;
      await updateDoc(doc(db, 'users', uid, 'profile', 'data'), updates);
      const updatedProfile = { ...profile, ...updates };
      setProfile(updatedProfile);
      // recalc thermic plan with new activities
      const newPlan = calcThermicPlan(updatedProfile);
      await updateDoc(doc(db, 'users', uid, 'profile', 'data'), { thermicEngine: newPlan });
      setTeData(newPlan);
    } catch (e) { console.log('Workout save err:', e.message); }
    finally { setWorkoutSaving(false); }
  };

  // ── Calculate thermic plan ──────────────────────────────────────────────────
  const calcThermicPlan = useCallback((prof) => {
    const w = prof.currentWeight || prof.weight;
    const h = prof.height;
    const age = prof.age;
    const g = prof.gender;

    // Mifflin-St Jeor BMR
    const bmr = g === 'Male'
      ? Math.round(10 * w + 6.25 * h - 5 * age + 5)
      : Math.round(10 * w + 6.25 * h - 5 * age - 161);

    const sedentaryTDEE = Math.round(bmr * 1.2);

    // Include workouts
    const weeklyWkBurn = calcWorkoutWeeklyBurn(prof.activitySettings, w);
    const dailyWkBurn = Math.round(weeklyWkBurn / 7);
    const fullTDEE = sedentaryTDEE + dailyWkBurn;

    // Apply original deficit
    const originalDeficit = prof.dailyDeficit ?? prof.totalDailyDeficit ?? 0;
    const foodDeficit = Math.max(0, originalDeficit - dailyWkBurn);
    const dailyCalories = Math.round(sedentaryTDEE - foodDeficit);

    // Macro split: 30% protein (maximize TEF), 40% carbs, 30% fat
    const proteinPct = 30;
    const carbsPct = 40;
    const fatPct = 30;
    const proteinG = Math.round((dailyCalories * proteinPct / 100) / 4);
    const carbsG = Math.round((dailyCalories * carbsPct / 100) / 4);
    const fatG = Math.round((dailyCalories * fatPct / 100) / 9);

    // Estimate daily TEF refund from recommended macros
    const estimatedRefund = calcTEFRefund(proteinG, carbsG, fatG);

    return {
      active: true,
      startedAt: new Date().toISOString(),
      currentWeight: w,
      bmr,
      sedentaryTDEE,
      dailyWorkoutBurn: dailyWkBurn,
      fullTDEE,
      dailyDeficit: originalDeficit,
      foodDeficit,
      dailyCalories,
      proteinPct, carbsPct, fatPct,
      proteinG, carbsG, fatG,
      estimatedDailyRefund: estimatedRefund.total,
      // preserve original plan
      originalGoalWeight: prof.goalWeight,
      originalTargetWeeks: prof.targetWeeks,
      originalTargetEndDate: prof.targetEndDate || null,
      originalDailyDeficit: originalDeficit,
      originalStartWeight: prof.weight,
      originalActivitySettings: prof.activitySettings || {},
    };
  }, []);

  // ── Enter thermic engine ──────────────────────────────────────────────────
  const handleEnterMode = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSaving(true);
    try {
      const plan = calcThermicPlan(profile);
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'profile', 'data'), {
        thermicEngine: plan,
      });
      setTeData(plan);
      screenFade.setValue(0);
      setStep(STEP.ACTIVE);
    } catch (e) {
      showDialog({ variant: 'error', title: 'oops', message: e.message });
    } finally { setSaving(false); }
  };

  // ── Start exit flow ───────────────────────────────────────────────────────
  const handleStartExit = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    screenFade.setValue(0);
    setExitChoice(null);
    setStep(STEP.EXIT);
  };

  // ── Exit options ──────────────────────────────────────────────────────────
  const getExitOptions = useCallback(() => {
    if (!teData || !profile) return { extend: null, compress: null };

    const currentW = teData.currentWeight;
    const goalW = teData.originalGoalWeight;
    const originalDeficit = teData.originalDailyDeficit;

    const startDate = new Date(teData.startedAt);
    const now = new Date();
    const teDays = Math.max(1, Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)));

    const excessKg = Math.max(0, currentW - goalW);

    // OPTION 1: Keep original deficit, extend end date
    const extendDays = originalDeficit > 0 ? Math.max(1, Math.ceil((excessKg * 7700) / originalDeficit)) : 70;
    const extendWeeks = Math.ceil(extendDays / 7);
    const extendEndDate = new Date(now.getTime() + extendDays * 86400000);
    const extendDeficit = originalDeficit;

    // OPTION 2: Keep original end date, adjust deficit
    let compressEndDate;
    if (teData.originalTargetEndDate) {
      compressEndDate = new Date(teData.originalTargetEndDate);
    } else if (teData.originalTargetWeeks) {
      const createdAt = profile.createdAt ? new Date(profile.createdAt) : startDate;
      compressEndDate = new Date(createdAt.getTime() + teData.originalTargetWeeks * 7 * 86400000);
    } else {
      compressEndDate = new Date(now.getTime() + 7 * 86400000);
    }
    const compressDaysLeft = Math.max(1, Math.ceil((compressEndDate - now) / 86400000));
    const compressWeeks = Math.ceil(compressDaysLeft / 7);
    const compressDeficit = excessKg > 0
      ? Math.round((excessKg * 7700) / compressDaysLeft)
      : 0;

    const g = profile.gender;
    const h = profile.height;
    const age = profile.age;
    const bmr = g === 'Male'
      ? Math.round(10 * currentW + 6.25 * h - 5 * age + 5)
      : Math.round(10 * currentW + 6.25 * h - 5 * age - 161);
    const sedentaryTDEE = Math.round(bmr * 1.2);
    const weeklyWkBurn = calcWorkoutWeeklyBurn(teData.originalActivitySettings, currentW);
    const dailyWkBurn = Math.round(weeklyWkBurn / 7);

    const extendFoodDeficit = Math.max(0, extendDeficit - dailyWkBurn);
    const extendCalories = Math.round(sedentaryTDEE - extendFoodDeficit);

    const compressFoodDeficit = Math.max(0, compressDeficit - dailyWkBurn);
    const compressCalories = Math.round(sedentaryTDEE - compressFoodDeficit);

    const formatTimeLeft = (daysLeft) => {
      const w = Math.floor(daysLeft / 7);
      const d = daysLeft % 7;
      return `${w}w ${d}d`;
    };

    return {
      teDays, teWeeks: Math.ceil(teDays / 7),
      currentWeight: currentW, goalWeight: goalW, excessKg,
      bmr, sedentaryTDEE,
      extend: {
        weeks: extendWeeks, deficit: extendDeficit,
        targetEndDate: extendEndDate.toISOString(),
        foodDeficit: extendFoodDeficit, calories: extendCalories,
        label: 'Keep my original deficit, take more time',
        desc: `same ${extendDeficit} kcal/day deficit — will take ${formatTimeLeft(extendDays)} to reach ${goalW} kg`,
      },
      compress: {
        weeks: compressWeeks, deficit: compressDeficit,
        targetEndDate: compressEndDate.toISOString(),
        foodDeficit: compressFoodDeficit, calories: compressCalories,
        label: 'Keep my original timeline, adjust deficit',
        desc: compressDeficit > 0
          ? `${formatTimeLeft(compressDaysLeft)} left — deficit adjusts to ${compressDeficit} kcal/day`
          : `${formatTimeLeft(compressDaysLeft)} left — no deficit needed, you're close to goal!`,
      },
    };
  }, [teData, profile]);

  // ── Finalize exit ─────────────────────────────────────────────────────────
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
        bmr, sedentaryTDEE, tdee: sedentaryTDEE,
        targetWeeks: chosen.weeks,
        targetEndDate: chosen.targetEndDate,
        dailyDeficit: chosen.deficit,
        totalDailyDeficit: chosen.deficit,
        foodDeficit: chosen.foodDeficit,
        dailyCalorieTarget: chosen.calories,
        activitySettings: teData.originalActivitySettings || profile.activitySettings || {},
        weeklyWorkoutCalories: calcWorkoutWeeklyBurn(teData.originalActivitySettings, currentW),
        thermicEngine: null,
        lastThermicEngineEndedAt: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showDialog({
        variant: 'success',
        title: 'thermic engine deactivated!',
        message: `great run.\n\nnew daily target: ${chosen.calories} kcal\ndeficit: ${chosen.deficit} kcal/day\ntimeline: ${chosen.weeks} weeks\n\nback to standard tracking.`,
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
        <Text style={{ marginTop: 20, color: PAL.accentDark, fontWeight: '600', fontSize: 13 }}>firing up the thermic engine...</Text>
      </View>
    );
  }

  // ── Step 1: Explain TEF ───────────────────────────────────────────────────
  if (step === STEP.EXPLAIN) {
    return (
      <Animated.View style={{ flex: 1, backgroundColor: PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[PAL.bg1, PAL.bg2, PAL.bg3]} style={StyleSheet.absoluteFill} />
        <TEDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={[st.backBtn, { backgroundColor: PAL.softBg, borderColor: PAL.cardBorder }]}
            onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={PAL.accent} />
          </TouchableOpacity>

          <FadeCard style={st.heroBox}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: PAL.accent + '18', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <MaterialCommunityIcons name="fire" size={32} color={PAL.accent} />
            </View>
            <Text style={[st.heroTitle, { color: PAL.text }]}>the thermic engine</Text>
            <Text style={[st.heroSub, { color: PAL.textSoft }]}>
              your body burns calories just digesting food.{'\n'}we track that burn and refund it to your daily budget.
            </Text>
          </FadeCard>

          {/* Science explanation */}
          <FadeCard delay={100} style={[st.infoCard, { borderColor: PAL.cardBorder }]}>
            <Text style={[st.infoCardTitle, { color: PAL.text }]}>what is TEF?</Text>
            <Text style={{ fontSize: 13, color: PAL.textSoft, lineHeight: 21, marginBottom: 16 }}>
              The Thermic Effect of Food (TEF) is the energy your body spends to digest, absorb, and metabolize nutrients. It's a real, measurable calorie cost — and it varies dramatically by macronutrient:
            </Text>

            {/* TEF breakdown visual */}
            <View style={st.tefBreakdown}>
              {[
                { macro: 'Protein', pct: '25%', color: '#EF4444', icon: 'food-steak', desc: '25 out of every 100 protein calories are burned in digestion' },
                { macro: 'Carbs', pct: '8%', color: '#F59E0B', icon: 'barley', desc: '8 out of every 100 carb calories are burned in digestion' },
                { macro: 'Fat', pct: '2%', color: '#3B82F6', icon: 'water', desc: '2 out of every 100 fat calories are burned in digestion' },
              ].map((item, i) => (
                <View key={i} style={[st.tefRow, { borderColor: item.color + '25' }]}>
                  <View style={[st.tefIconBox, { backgroundColor: item.color + '12' }]}>
                    <MaterialCommunityIcons name={item.icon} size={18} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#1a1a1a' }}>{item.macro}</Text>
                      <View style={{ backgroundColor: item.color + '15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: item.color }}>{item.pct} TEF</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: '#6B7280', lineHeight: 16 }}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </FadeCard>

          {/* Example calculation */}
          <FadeCard delay={200} style={[st.exampleCard, { borderColor: PAL.cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <MaterialCommunityIcons name="calculator-variant" size={16} color={PAL.accent} />
              <Text style={[st.exampleTitle, { color: PAL.textGray }]}>REAL EXAMPLE</Text>
            </View>
            <Text style={{ fontSize: 13, color: PAL.textSoft, lineHeight: 21, marginBottom: 12 }}>
              Say you log a meal: 20g protein, 50g carbs, 10g fat
            </Text>

            <View style={st.exampleSteps}>
              <View style={st.exampleStep}>
                <Text style={st.exampleStepNum}>1</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.exampleStepTitle}>Gross Calories</Text>
                  <Text style={st.exampleStepBody}>Protein: 20g × 4 = 80 kcal{'\n'}Carbs: 50g × 4 = 200 kcal{'\n'}Fat: 10g × 9 = 90 kcal{'\n'}Total: 370 kcal</Text>
                </View>
              </View>

              <View style={st.exampleStep}>
                <Text style={[st.exampleStepNum, { backgroundColor: '#FF6D0015', color: '#FF6D00' }]}>2</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.exampleStepTitle}>TEF Burn (Digestion Cost)</Text>
                  <Text style={st.exampleStepBody}>Protein: 80 × 25% = 20 kcal{'\n'}Carbs: 200 × 8% = 16 kcal{'\n'}Fat: 90 × 2% = 1.8 kcal{'\n'}Total TEF: ~38 kcal</Text>
                </View>
              </View>

              <View style={st.exampleStep}>
                <Text style={[st.exampleStepNum, { backgroundColor: '#16A34A15', color: '#16A34A' }]}>3</Text>
                <View style={{ flex: 1 }}>
                  <Text style={st.exampleStepTitle}>Your Refund</Text>
                  <Text style={[st.exampleStepBody, { color: '#16A34A', fontWeight: '700' }]}>
                    370 - 38 = 332 kcal net impact{'\n'}
                    You burned 38 kcal just by eating!
                  </Text>
                </View>
              </View>
            </View>
          </FadeCard>

          {/* Study references */}
          <FadeCard delay={300} style={[st.infoCard, { borderColor: PAL.cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <MaterialCommunityIcons name="book-open-variant" size={16} color={PAL.accent} />
              <Text style={[st.exampleTitle, { color: PAL.textGray }]}>PEER-REVIEWED EVIDENCE</Text>
            </View>
            {STUDIES.map((s, i) => (
              <View key={i} style={[st.studyCard, { borderColor: PAL.cardBorder }]}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: PAL.accentDark, marginBottom: 3 }}>
                  {s.authors} ({s.year})
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#374151', fontStyle: 'italic', marginBottom: 4 }}>
                  "{s.title}"
                </Text>
                <Text style={{ fontSize: 10, color: PAL.textGray, marginBottom: 4 }}>
                  {s.journal} · DOI: {s.doi}
                </Text>
                <Text style={{ fontSize: 11, color: PAL.textSoft, lineHeight: 17 }}>
                  {s.summary}
                </Text>
              </View>
            ))}
          </FadeCard>

          {/* Key points */}
          <FadeCard delay={350} style={[st.infoCard, { borderColor: PAL.cardBorder }]}>
            <Text style={[st.infoCardTitle, { color: PAL.text }]}>how it works in the app</Text>
            {[
              { icon: 'food', color: '#FF6D00', text: 'Log meals exactly like before — nothing changes in your workflow' },
              { icon: 'fire', color: '#EF4444', text: 'We calculate the TEF burn from each meal\'s macros automatically' },
              { icon: 'plus-circle', color: '#16A34A', text: 'Your calorie ring gets refunded — net impact is always lower than gross' },
              { icon: 'food-steak', color: '#8B5CF6', text: 'Higher protein meals = bigger refunds. The app naturally rewards better choices' },
              { icon: 'scale-bathroom', color: '#3B82F6', text: 'Weight logging, meal tracking, progress — all stay exactly the same' },
            ].map((item, i) => (
              <View key={i} style={st.infoRow}>
                <MaterialCommunityIcons name={item.icon} size={16} color={item.color} />
                <Text style={[st.infoText, { color: PAL.textSoft }]}>{item.text}</Text>
              </View>
            ))}
          </FadeCard>

          <FadeCard delay={400}>
            <TouchableOpacity
              style={[st.btnAccent, { backgroundColor: PAL.accent }]}
              onPress={() => { screenFade.setValue(0); setStep(STEP.CONFIRM); }}
            >
              <MaterialCommunityIcons name="fire" size={20} color="#fff" />
              <Text style={st.btnAccentText}>i understand — let's set it up</Text>
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

  // ── Step 2: Confirm with weight & workout data ────────────────────────────
  if (step === STEP.CONFIRM) {
    const currentW = profile?.currentWeight || profile?.weight || 0;
    const plan = profile ? calcThermicPlan(profile) : null;

    return (
      <Animated.View style={{ flex: 1, backgroundColor: PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[PAL.bg1, PAL.bg2, PAL.bg3]} style={StyleSheet.absoluteFill} />
        <TEDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={[st.backBtn, { backgroundColor: PAL.softBg, borderColor: PAL.cardBorder }]}
            onPress={() => { screenFade.setValue(0); setStep(STEP.EXPLAIN); }}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={PAL.accent} />
          </TouchableOpacity>

          <FadeCard style={st.heroBox}>
            <Text style={[st.heroTitle, { color: PAL.text }]}>your thermic profile</Text>
            <Text style={[st.heroSub, { color: PAL.textSoft }]}>
              here's how we calculated your daily target using your weight and workout data.
            </Text>
          </FadeCard>

          {/* Weight & workout info */}
          {plan && (
            <>
              <FadeCard delay={100} style={[st.previewCard, { borderColor: PAL.cardBorder }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <MaterialCommunityIcons name="scale-bathroom" size={16} color={PAL.accent} />
                  <Text style={[st.previewCardTitle, { color: PAL.textGray }]}>YOUR BODY DATA</Text>
                </View>

                <View style={st.previewStatsRow}>
                  <View style={[st.previewStat, { backgroundColor: '#FF6D0008', borderColor: '#FF6D0020' }]}>
                    <Text style={[st.previewStatVal, { color: PAL.warm }]}>{currentW}</Text>
                    <Text style={st.previewStatLbl}>weight (kg)</Text>
                  </View>
                  <View style={[st.previewStat, { backgroundColor: '#FF6D0008', borderColor: '#FF6D0020' }]}>
                    <Text style={[st.previewStatVal, { color: PAL.warm }]}>{plan.bmr}</Text>
                    <Text style={st.previewStatLbl}>BMR</Text>
                  </View>
                  <View style={[st.previewStat, { backgroundColor: '#FF6D0008', borderColor: '#FF6D0020' }]}>
                    <Text style={[st.previewStatVal, { color: PAL.warm }]}>{plan.dailyWorkoutBurn}</Text>
                    <Text style={st.previewStatLbl}>workout/day</Text>
                  </View>
                </View>

                <View style={[st.calorieHighlight, { borderColor: PAL.cardBorder }]}>
                  <Text style={[st.calorieHighlightLabel, { color: PAL.textGray }]}>daily calorie target</Text>
                  <Text style={[st.calorieHighlightVal, { color: PAL.accentDark }]}>{plan.dailyCalories}</Text>
                  <Text style={[st.calorieHighlightUnit, { color: PAL.textSoft }]}>kcal/day (with {plan.dailyDeficit} kcal deficit)</Text>
                </View>

                {/* TEF estimate */}
                <View style={[st.tefEstimate, { borderColor: '#FF6D0030' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <MaterialCommunityIcons name="fire" size={16} color="#FF6D00" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#FF6D00' }}>ESTIMATED DAILY TEF REFUND</Text>
                  </View>
                  <Text style={{ fontSize: 28, fontWeight: '900', color: PAL.accentDark, textAlign: 'center' }}>
                    +{plan.estimatedDailyRefund} kcal
                  </Text>
                  <Text style={{ fontSize: 11, color: PAL.textGray, textAlign: 'center', marginTop: 4 }}>
                    based on the recommended 30/40/30 protein-heavy macro split
                  </Text>
                </View>
              </FadeCard>

              {/* Macro split */}
              <FadeCard delay={200} style={[st.infoCard, { borderColor: PAL.cardBorder }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                  <MaterialCommunityIcons name="chart-donut" size={16} color={PAL.accent} />
                  <Text style={[st.previewCardTitle, { color: PAL.textGray }]}>RECOMMENDED MACRO SPLIT</Text>
                </View>
                <MacroBar label="Protein" grams={plan.proteinG} pct={plan.proteinPct}
                  color="#EF4444" icon="food-steak" delay={300} tefPct={25} />
                <MacroBar label="Carbs" grams={plan.carbsG} pct={plan.carbsPct}
                  color="#F59E0B" icon="barley" delay={450} tefPct={8} />
                <MacroBar label="Fat" grams={plan.fatG} pct={plan.fatPct}
                  color="#3B82F6" icon="water" delay={600} tefPct={2} />

                <View style={[st.carbNote, { backgroundColor: '#FF6D0010', borderColor: '#FF6D0025' }]}>
                  <MaterialCommunityIcons name="food-steak" size={14} color="#EF4444" />
                  <Text style={{ flex: 1, fontSize: 11, lineHeight: 17, color: PAL.textSoft }}>
                    protein is at 30% to maximize your TEF refund. higher protein = more free calories burned through digestion.
                  </Text>
                </View>
              </FadeCard>

              {/* Workout activities */}
              {profile.activitySettings && Object.keys(profile.activitySettings).length > 0 && (
                <FadeCard delay={250} style={[st.infoCard, { borderColor: PAL.cardBorder }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <MaterialCommunityIcons name="dumbbell" size={16} color={PAL.accent} />
                    <Text style={[st.previewCardTitle, { color: PAL.textGray }]}>YOUR WORKOUTS</Text>
                  </View>
                  {Object.entries(profile.activitySettings).map(([name, settings], i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: PAL.softBg, justifyContent: 'center', alignItems: 'center' }}>
                        <MaterialCommunityIcons name="run" size={14} color={PAL.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>{name}</Text>
                        <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                          {settings.daysPerWeek}x/week · {settings.hoursPerDay}h/session
                        </Text>
                      </View>
                    </View>
                  ))}
                </FadeCard>
              )}
            </>
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
                  <MaterialCommunityIcons name="fire" size={20} color="#fff" />
                  <Text style={st.btnAccentText}>activate thermic engine</Text>
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

  // ── Step 3: Active mode ───────────────────────────────────────────────────
  if (step === STEP.ACTIVE && teData) {
    const netConsumed = Math.max(0, todayGross - todayRefund);

    return (
      <Animated.View style={{ flex: 1, backgroundColor: PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[PAL.bg1, PAL.bg2, PAL.bg3]} style={StyleSheet.absoluteFill} />
        <TEDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <FadeCard delay={0} style={st.activeHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PulseDot color={PAL.accent} />
              <Text style={[st.activeTitle, { color: PAL.text }]}>Thermic Engine</Text>
            </View>
            <View style={[st.modeBadge, { backgroundColor: PAL.accent + '18', borderColor: PAL.accent + '35' }]}>
              <MaterialCommunityIcons name="fire" size={14} color={PAL.accent} />
              <Text style={[st.modeBadgeText, { color: PAL.accent }]}>Active</Text>
            </View>
          </FadeCard>

          {/* Day counter */}
          <DayBadge startDate={teData.startedAt} />

          {/* Warm message */}
          <FadeCard delay={100} style={[st.warmCard, { borderColor: PAL.cardBorder }]}>
            <View style={{
              width: 48, height: 48, borderRadius: 24, backgroundColor: PAL.accent + '15',
              justifyContent: 'center', alignItems: 'center', marginBottom: 10,
            }}>
              <MaterialCommunityIcons name="fire" size={24} color={PAL.accent} />
            </View>
            <Text style={[st.warmTitle, { color: PAL.text }]}>your digestion is earning you calories</Text>
            <Text style={[st.warmMsg, { color: PAL.textSoft }]}>
              {ACTIVE_MESSAGES[activeMsgIdx]}
            </Text>
          </FadeCard>

          {/* Calorie ring with TEF */}
          <FadeCard delay={200} style={[st.calorieCard, { borderColor: PAL.cardBorder }]}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <BreathingGlow color={PAL.glow} size={200} />
              <CalorieRing
                consumed={todayGross}
                target={teData.dailyCalories}
                refunded={todayRefund}
                size={180}
              />
            </View>

            {/* Today's TEF breakdown */}
            <View style={[st.tefTodayCard, { borderColor: '#FF6D0030' }]}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: PAL.textGray, letterSpacing: 1, marginBottom: 10 }}>TODAY'S THERMIC BREAKDOWN</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={[st.tefTodayStat, { borderColor: '#EF444420' }]}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#EF4444' }}>{todayGross}</Text>
                  <Text style={{ fontSize: 9, color: '#6B7280', marginTop: 2 }}>gross kcal</Text>
                </View>
                <View style={[st.tefTodayStat, { borderColor: '#FF6D0020' }]}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#FF6D00' }}>-{todayRefund}</Text>
                  <Text style={{ fontSize: 9, color: '#6B7280', marginTop: 2 }}>TEF refund</Text>
                </View>
                <View style={[st.tefTodayStat, { borderColor: '#16A34A20' }]}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#16A34A' }}>{netConsumed}</Text>
                  <Text style={{ fontSize: 9, color: '#6B7280', marginTop: 2 }}>net kcal</Text>
                </View>
              </View>
            </View>
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

          {/* Macros target */}
          <FadeCard delay={300} style={[st.macroCard, { borderColor: PAL.cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <MaterialCommunityIcons name="chart-donut" size={16} color={PAL.accent} />
              <Text style={[st.macroCardTitle, { color: PAL.textGray }]}>DAILY MACRO TARGETS</Text>
            </View>
            <MacroBar label="Protein" grams={teData.proteinG} pct={teData.proteinPct}
              color="#EF4444" icon="food-steak" delay={400} tefPct={25} />
            <MacroBar label="Carbs" grams={teData.carbsG} pct={teData.carbsPct}
              color="#F59E0B" icon="barley" delay={550} tefPct={8} />
            <MacroBar label="Fat" grams={teData.fatG} pct={teData.fatPct}
              color="#3B82F6" icon="water" delay={700} tefPct={2} />
          </FadeCard>

          {/* Stats grid */}
          <FadeCard delay={400} style={[st.statsGrid, { borderColor: PAL.cardBorder }]}>
            {[
              { val: teData.bmr, lbl: 'Your BMR', icon: 'heart-outline', color: '#6B7280' },
              { val: teData.dailyCalories, lbl: 'Target kcal', icon: 'fire', color: '#FF6D00' },
              { val: teData.dailyWorkoutBurn, lbl: 'Workout/day', icon: 'dumbbell', color: '#8B5CF6' },
              { val: teData.dailyDeficit, lbl: 'Deficit', icon: 'trending-down', color: '#3B82F6' },
              { val: teData.estimatedDailyRefund, lbl: 'Est. TEF/day', icon: 'fire', color: '#16A34A' },
              { val: teData.currentWeight, lbl: 'Weight (kg)', icon: 'scale-bathroom', color: '#EF4444' },
            ].map((s, i) => (
              <View key={i} style={[st.statCell, { backgroundColor: s.color + '08', borderColor: s.color + '20' }]}>
                <MaterialCommunityIcons name={s.icon} size={16} color={s.color} style={{ marginBottom: 4 }} />
                <AnimatedNum value={s.val} style={[st.statVal, { color: s.color }]} />
                <Text style={st.statLbl}>{s.lbl}</Text>
              </View>
            ))}
          </FadeCard>

          {/* Action buttons */}
          <FadeCard delay={450}>
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                style={[st.actionBtn, { backgroundColor: PAL.accent }]}
                onPress={() => router.push('/MealLogScreen')}
              >
                <MaterialCommunityIcons name="food" size={20} color="#fff" />
                <Text style={st.actionBtnText}>log a meal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.actionBtn, { backgroundColor: '#8B5CF6' }]}
                onPress={() => router.push('/WeeklyCheckIn')}
              >
                <MaterialCommunityIcons name="scale-bathroom" size={20} color="#fff" />
                <Text style={st.actionBtnText}>log weight</Text>
              </TouchableOpacity>
            </View>
          </FadeCard>

          {/* Protein Warrior */}
          <FadeCard delay={480}>
            <ProteinWarriorCard proteinStreak={proteinStreak} proteinConsumed={proteinConsumed} profile={profile} />
          </FadeCard>

          {/* Workout Editor */}
          <FadeCard delay={490}>
            <WorkoutEditor
              activitySettings={profile?.activitySettings || {}}
              onSave={handleWorkoutSave}
              accent={PAL.accent}
              saving={workoutSaving}
              cardBorder={PAL.cardBorder}
            />
          </FadeCard>

          {/* Tip */}
          <FadeCard delay={500} style={[st.reminderCard, { borderColor: PAL.cardBorder }]}>
            <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={PAL.accent} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[st.reminderTitle, { color: PAL.text }]}>pro tip</Text>
              <Text style={[st.reminderText, { color: PAL.textSoft }]}>
                want bigger refunds? prioritize protein. a high-protein meal can refund 20-25% of its protein calories. that's free wiggle room in your budget.
              </Text>
            </View>
          </FadeCard>

          {/* End mode button */}
          <FadeCard delay={600}>
            <TouchableOpacity
              style={[st.endBtn, { borderColor: PAL.cardBorder }]}
              onPress={handleStartExit}
            >
              <LinearGradient
                colors={['#FFF8F0', '#FFE0B2']}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, paddingVertical: 16, borderRadius: 14,
                }}
              >
                <MaterialCommunityIcons name="power" size={20} color={PAL.accent} />
                <Text style={[st.endBtnText, { color: PAL.accentDark }]}>deactivate thermic engine</Text>
              </LinearGradient>
            </TouchableOpacity>
          </FadeCard>

          <View style={{ height: 48 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  // ── Step 4: Exit flow ─────────────────────────────────────────────────────
  if (step === STEP.EXIT) {
    const opts = getExitOptions();

    return (
      <Animated.View style={{ flex: 1, backgroundColor: PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[PAL.bg1, PAL.bg2, '#DCFCE7']} style={StyleSheet.absoluteFill} />
        <TEDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={[st.backBtn, { backgroundColor: PAL.softBg, borderColor: PAL.cardBorder }]}
            onPress={() => { screenFade.setValue(0); setStep(STEP.ACTIVE); }}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={PAL.accent} />
          </TouchableOpacity>

          <FadeCard style={st.heroBox}>
            <Text style={{ fontSize: 44, marginBottom: 10 }}>🔧</Text>
            <Text style={[st.heroTitle, { color: PAL.text }]}>shutting down the engine</Text>
            <Text style={[st.heroSub, { color: PAL.textSoft }]}>
              the thermic engine has been tracking your digestion burns. now let's figure out how to continue your journey.
            </Text>
          </FadeCard>

          {/* Summary */}
          <FadeCard delay={100} style={[st.exitSummaryCard, { borderColor: PAL.cardBorder }]}>
            <Text style={[st.exitSummaryTitle, { color: PAL.textGray }]}>THERMIC ENGINE SUMMARY</Text>
            <View style={st.exitSummaryRow}>
              <View style={st.exitSummaryStat}>
                <Text style={[st.exitSummaryVal, { color: PAL.accentDark }]}>{opts.teDays}</Text>
                <Text style={st.exitSummaryLbl}>days active</Text>
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
            <Text style={[st.choiceTitle, { color: PAL.text }]}>how do you want to continue?</Text>
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

          {exitChoice === 'compress' && opts.compress.deficit > 500 && (
            <FadeCard delay={400}>
              <View style={[st.warningBox, { backgroundColor: '#FEF2F218', borderColor: '#EF444430' }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#EF4444" />
                <Text style={{ flex: 1, fontSize: 11, lineHeight: 17, color: '#B91C1C' }}>
                  heads up — a {opts.compress.deficit} kcal/day deficit is pretty aggressive. consider the extended timeline if that feels too intense.
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
  heroTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: -0.5 },
  heroSub: { fontSize: 13, textAlign: 'center', lineHeight: 21, maxWidth: 320 },

  infoCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 20,
    borderWidth: 1, marginBottom: 16,
  },
  infoCardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 20 },

  // TEF breakdown
  tefBreakdown: { gap: 10 },
  tefRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 1,
  },
  tefIconBox: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },

  // Example
  exampleCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 20,
    borderWidth: 1, marginBottom: 16,
  },
  exampleTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  exampleSteps: { gap: 12 },
  exampleStep: { flexDirection: 'row', gap: 10 },
  exampleStepNum: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#F3F4F6',
    textAlign: 'center', lineHeight: 26, fontSize: 12, fontWeight: '900', color: '#374151',
  },
  exampleStepTitle: { fontSize: 13, fontWeight: '800', color: '#374151', marginBottom: 2 },
  exampleStepBody: { fontSize: 12, color: '#6B7280', lineHeight: 19 },

  // Study cards
  studyCard: {
    backgroundColor: '#FFFAF5', borderRadius: 14, padding: 14,
    borderWidth: 1, marginBottom: 10,
  },

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
  previewStatVal: { fontSize: 20, fontWeight: '900' },
  previewStatLbl: { fontSize: 10, color: '#6B7280', marginTop: 3 },

  calorieHighlight: {
    alignItems: 'center', backgroundColor: '#FFF8F0',
    borderRadius: 16, padding: 18, borderWidth: 1, marginBottom: 16,
  },
  calorieHighlightLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  calorieHighlightVal: { fontSize: 42, fontWeight: '900', letterSpacing: -1, marginVertical: 4 },
  calorieHighlightUnit: { fontSize: 12, fontWeight: '600' },

  tefEstimate: {
    alignItems: 'center', backgroundColor: '#FF6D0008',
    borderRadius: 16, padding: 16, borderWidth: 1,
  },

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

  tefTodayCard: {
    width: '100%', backgroundColor: '#FF6D0008',
    borderRadius: 16, padding: 14, borderWidth: 1, marginTop: 8,
  },
  tefTodayStat: {
    flex: 1, alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, paddingVertical: 10, borderWidth: 1,
  },

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
    width: (SCREEN_W - 80) / 3 - 6, alignItems: 'center',
    borderRadius: 14, paddingVertical: 12, borderWidth: 1,
  },
  statVal: { fontSize: 16, fontWeight: '900' },
  statLbl: { fontSize: 8, color: '#6B7280', marginTop: 3, textAlign: 'center' },

  actionBtn: {
    borderRadius: 16, paddingVertical: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  reminderCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 22, padding: 18,
    borderWidth: 1, marginBottom: 16, marginTop: 16,
  },
  reminderTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  reminderText: { fontSize: 12, lineHeight: 19 },

  endBtn: { borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, marginBottom: 8 },
  endBtnText: { fontSize: 15, fontWeight: '800' },

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
    flex: 1, alignItems: 'center', backgroundColor: '#FFF8F0',
    borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#FFCC80',
  },
  choiceStatVal: { fontSize: 18, fontWeight: '900' },
  choiceStatLbl: { fontSize: 9, color: '#6B7280', marginTop: 2 },

  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 8,
  },
});
