import { useState, useEffect, useRef, useCallback } from 'react';
import { writeNBRow, getTodayNBRow, backfillYesterdayIfMissing } from '../utils/nbTraining';
import { markNBAnswered, isNBAnsweredToday } from '../utils/nbAnswered';
import { buildNBCheckInPrompt } from '../utils/nbCheckInPrompt';
import { processDailyStreak, getDefaultStreak } from '../utils/proteinStreak';
import ProteinWarriorCard from '../components/ProteinWarriorCard';
import WorkoutEditor from '../components/WorkoutEditor';
import { recalcProfileWithActivities } from '../utils/recalcWorkout';
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
import * as Haptics from 'expo-haptics';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Onboarding activity database (same as OnboardingScreen) ─────────────────
const ACTIVITY_DATA = {
  Weightlifting: { caloriesPerHour: 400 },
  Running: { caloriesPerHour: 600 },
  Walking: { caloriesPerHour: 280 },
  Cycling: { caloriesPerHour: 500 },
  Yoga: { caloriesPerHour: 250 },
  HIIT: { caloriesPerHour: 650 },
  Sports: {
    caloriesPerHour: 0, hasSubOptions: true,
    subOptions: [
      { name: 'Football/Soccer', caloriesPerHour: 600 },
      { name: 'Basketball', caloriesPerHour: 550 },
      { name: 'Boxing', caloriesPerHour: 700 },
      { name: 'Swimming', caloriesPerHour: 500 },
      { name: 'Tennis', caloriesPerHour: 450 },
      { name: 'Cricket', caloriesPerHour: 350 },
      { name: 'Badminton', caloriesPerHour: 400 },
      { name: 'Volleyball', caloriesPerHour: 350 },
    ],
  },
};

const calcWorkoutWeeklyBurn = (activitySettings) => {
  return Object.entries(activitySettings || {}).reduce((total, [name, settings]) => {
    const actData = ACTIVITY_DATA[name];
    if (!actData) return total;
    let cph = actData.caloriesPerHour;
    if (actData.hasSubOptions && settings?.selectedSport) {
      const sport = actData.subOptions?.find(s => s.name === settings.selectedSport);
      if (sport) cph = sport.caloriesPerHour;
    }
    const days = settings?.daysPerWeek ?? 3;
    const hours = settings?.hoursPerDay ?? 1;
    return total + Math.round(cph * days * hours);
  }, 0);
};

// ── Cool blue palette ───────────────────────────────────────────────────────
const PAL = {
  bg1: '#EFF6FF', bg2: '#DBEAFE', bg3: '#BFDBFE',
  accent: '#2563EB', accentDark: '#1E3A5F', accentLight: '#60A5FA',
  card: '#FFFFFF', cardBorder: '#BFDBFE', softBg: '#DBEAFE',
  text: '#1E3A5F', textSoft: '#3B6B9A', textGray: '#6B7280',
  glow: 'rgba(96,165,250,0.35)', ringBg: '#DBEAFE',
  cool: '#1D4ED8', coolLight: '#93C5FD',
  deficitRed: '#EF4444', maintenanceGreen: '#10B981',
};

// ── Phase colors ────────────────────────────────────────────────────────────
const PHASE_DEFICIT = { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626', light: '#FCA5A5', label: 'DEFICIT' };
const PHASE_MAINT = { bg: '#ECFDF5', border: '#A7F3D0', color: '#059669', light: '#6EE7B7', label: 'MAINTENANCE' };

// ── Phase-aware perspective checks ──────────────────────────────────────────
const DEFICIT_FACTS = [
  { icon: 'fire', text: "you're in a deficit but your body doesn't know that. it's using stored fat right now as you read this. the plan is working." },
  { icon: 'food', text: "a samosa during a cut is fine — 250 kcal. log it, adjust the rest of the day, move on. no drama needed." },
  { icon: 'trending-down', text: "feeling extra hungry today? that's ghrelin — the hunger hormone. it spikes during cuts. drink water, eat protein, and it calms down in 20 minutes." },
  { icon: 'heart-pulse', text: "your body burns 60-75% of calories just by existing. the deficit you're running is tiny compared to what your body handles automatically." },
  { icon: 'arm-flex', text: "protein keeps muscle during a cut. if you're hitting your protein target, you're losing fat, not muscle. keep going." },
  { icon: 'chart-line', text: "weight might stall for 5-10 days then suddenly drop. it's called the 'whoosh effect' — water leaves fat cells in bursts, not linearly." },
  { icon: 'coffee', text: "black coffee during a cut is basically a cheat code — 2 kcal, appetite suppressant, metabolism boost. drink up." },
  { icon: 'sleep', text: "poor sleep increases hunger by 24% and cravings for junk by 33%. your deficit is easier if you sleep 7+ hours. seriously." },
  { icon: 'emoticon-happy', text: "one bad day in a cut doesn't erase a good week. even if you went 500 over yesterday, that's just 1/7th of one week. you're still winning." },
  { icon: 'walk', text: "a 20-minute walk during a cut burns an extra 100 kcal and reduces appetite. easiest cheat code in fitness." },
  { icon: 'food-apple', text: "fruits are nature's candy AND they have fiber that keeps you full. eat the banana during your cut. it's 105 kcal." },
  { icon: 'water', text: "your body can mistake thirst for hunger. before eating a snack, drink a glass of water and wait 15 minutes. half the time, the 'hunger' vanishes." },
  { icon: 'brain', text: "your brain runs on glucose. if you're foggy during a cut, that's low blood sugar, not weakness. eat a piece of fruit." },
  { icon: 'scale-bathroom', text: "the scale went up 0.5 kg overnight? you didn't gain fat. 500g of fat requires 3,850 excess calories. you ate salt. drink water." },
  { icon: 'dumbbell', text: "training during a deficit preserves muscle mass. even light workouts send a signal to your body: 'keep the muscle, burn the fat.'" },
];

const MAINTENANCE_FACTS = [
  { icon: 'shield-refresh-outline', text: "eating at TDEE right now isn't 'cheating' — it's a metabolic strategy. you're resetting leptin, thyroid hormones, and hunger signals." },
  { icon: 'rice', text: "the extra carbs this week aren't making you fat. they're refilling glycogen, boosting metabolism, and telling your body there's no famine." },
  { icon: 'scale-bathroom', text: "the scale might go up 1-2 kg during maintenance. that's glycogen and water, not fat. each gram of glycogen holds 3g of water. it drops right back." },
  { icon: 'brain', text: "your brain performs measurably better when not in a deficit. use this maintenance week to crush exams, work, or whatever needs your focus." },
  { icon: 'leaf', text: "the MATADOR study showed this exact strategy — eating at maintenance between deficits — resulted in 47% more fat loss than continuous dieting." },
  { icon: 'emoticon-happy', text: "this is the week you can eat that biryani guilt-free. your TDEE is your TDEE. eating at maintenance is literally maintaining." },
  { icon: 'yoga', text: "cortisol drops during maintenance weeks. less stress hormone means less water retention. you might actually look leaner this week even though you're eating more." },
  { icon: 'heart-pulse', text: "your metabolism was slowing down during the deficit. this maintenance phase reverses that. when you go back to cutting, your body will burn fat more efficiently." },
  { icon: 'food-drumstick', text: "don't cut protein during maintenance. keep it moderate — the extra calories should come from carbs and some fat." },
  { icon: 'chart-line', text: "people who take diet breaks lose more weight long-term than people who grind nonstop. you're playing the long game. that's smart." },
  { icon: 'noodles', text: "enjoying a bigger dinner tonight? your TDEE can handle it. that's literally the point of maintenance — eat normally and let your body reset." },
  { icon: 'run-fast', text: "workouts might feel stronger this week. more carbs = more glycogen = more energy. enjoy the performance boost before the next cut." },
  { icon: 'calendar-check', text: "this maintenance phase ends soon. enjoy the food freedom, let your body recover, and come back to the deficit refreshed and primed." },
  { icon: 'trophy', text: "most people can't resist cutting harder. you're disciplined enough to eat MORE when the plan says to. that's elite-level self-control." },
  { icon: 'lightbulb-on-outline', text: "the fact that you're eating at TDEE and NOT overeating proves you have portion awareness. that skill stays forever. this is lifelong progress." },
];

// ── Cycle presets ───────────────────────────────────────────────────────────
const CYCLE_PRESETS = [
  { deficitWeeks: 2, maintWeeks: 1, label: '2:1', desc: '2 weeks deficit, 1 week maintenance', tag: 'balanced' },
  { deficitWeeks: 2, maintWeeks: 2, label: '2:2', desc: '2 weeks deficit, 2 weeks maintenance', tag: 'MATADOR protocol' },
  { deficitWeeks: 3, maintWeeks: 1, label: '3:1', desc: '3 weeks deficit, 1 week maintenance', tag: 'aggressive' },
  { deficitWeeks: 4, maintWeeks: 1, label: '4:1', desc: '4 weeks deficit, 1 week maintenance', tag: 'extended' },
];

// ── Dialog ──────────────────────────────────────────────────────────────────
function DCDialog({ visible, variant = 'info', title, message, actions, onClose }) {
  if (!visible) return null;
  const iconMap = { info: 'information-outline', warning: 'alert-circle-outline', success: 'check-circle-outline', error: 'close-circle-outline' };
  const colorMap = { info: '#2563EB', warning: '#D97706', success: '#16A34A', error: '#DC2626' };
  const bgMap = { info: '#EFF6FF', warning: '#FFFBEB', success: '#F0FDF4', error: '#FEF2F2' };
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
            <TouchableOpacity key={i} style={[dlg.btn, i === 0 && { backgroundColor: ic }]}
              onPress={() => { a.onPress?.(); onClose?.(); }}>
              <Text style={[dlg.btnText, i === 0 ? { color: '#fff' } : { color: ic }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}
const dlg = StyleSheet.create({
  overlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', borderRadius: 24, padding: 24, borderWidth: 1.5, alignItems: 'center' },
  iconCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  message: { fontSize: 13, color: '#4B5563', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  actions: { flexDirection: 'row', gap: 10, width: '100%' },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.06)' },
  btnText: { fontSize: 14, fontWeight: '700' },
});

// ── Animated number ─────────────────────────────────────────────────────────
function AnimatedNum({ value, style, duration = 800 }) {
  const animVal = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const id = animVal.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(animVal, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
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
        Animated.timing(s, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(s, { toValue: 0.6, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(o, { toValue: 0.55, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.3, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
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

// ── Fade card ───────────────────────────────────────────────────────────────
function FadeCard({ children, delay = 0, style }) {
  const o = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(o, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(y, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
    ]).start();
  }, [delay, o, y]);
  return <Animated.View style={[style, { opacity: o, transform: [{ translateY: y }] }]}>{children}</Animated.View>;
}

// ── Pulse dot ───────────────────────────────────────────────────────────────
function PulseDot({ color = '#2563EB' }) {
  const s = useRef(new Animated.Value(1)).current;
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(s, { toValue: 2.2, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
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
      <Animated.View style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: color, opacity: o, transform: [{ scale: s }] }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
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

// ── Calorie Ring ────────────────────────────────────────────────────────────
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
function CalorieRing({ consumed, target, phaseColor }) {
  const SIZE = 190;
  const STROKE = 13;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const progress = Math.min(consumed / (target || 1), 1);
  const remaining = Math.max(0, target - consumed);
  const overTarget = consumed > target;

  const animOffset = useRef(new Animated.Value(CIRC)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const targetOffset = CIRC * (1 - progress);
    Animated.parallel([
      Animated.timing(animOffset, { toValue: targetOffset, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [CIRC, animOffset, opacityAnim, progress, scaleAnim]);

  return (
    <Animated.View style={{ alignItems: 'center', opacity: opacityAnim, transform: [{ scale: scaleAnim }] }}>
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <BreathingGlow color={PAL.glow} size={SIZE + 40} />
        <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Defs>
            <SvgGrad id="dcRingGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={phaseColor} />
              <Stop offset="100%" stopColor={phaseColor + '88'} />
            </SvgGrad>
          </Defs>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={PAL.ringBg} strokeWidth={STROKE} />
          <AnimatedCircle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
            stroke={overTarget ? '#EF4444' : 'url(#dcRingGrad)'}
            strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={`${CIRC}`} strokeDashoffset={animOffset} />
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <AnimatedNum value={remaining} style={{ fontSize: 36, fontWeight: '900', color: overTarget ? '#EF4444' : PAL.accentDark, letterSpacing: -1 }} />
          <Text style={{ fontSize: 11, color: PAL.textSoft, marginTop: 2, fontWeight: '600' }}>kcal remaining</Text>
          <Text style={{ fontSize: 10, color: PAL.textGray, marginTop: 1 }}>of {target} target</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ── Visual cycle timeline ───────────────────────────────────────────────────
function CycleTimeline({ deficitWeeks, maintWeeks, totalCalendarWeeks, currentWeek, isActive }) {
  const cycleLen = deficitWeeks + maintWeeks;
  const blocks = [];
  for (let w = 1; w <= totalCalendarWeeks; w++) {
    const posInCycle = ((w - 1) % cycleLen);
    const isDeficit = posInCycle < deficitWeeks;
    const isCurrent = isActive && w === currentWeek;
    blocks.push({ week: w, isDeficit, isCurrent });
  }

  // Show max 20 blocks, then "+X more"
  const visible = blocks.slice(0, 20);
  const hidden = Math.max(0, blocks.length - 20);

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <MaterialCommunityIcons name="calendar-multiselect" size={14} color={PAL.accent} />
        <Text style={{ fontSize: 10, fontWeight: '700', color: PAL.textGray, letterSpacing: 1.2 }}>CYCLE TIMELINE</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {visible.map((b) => {
          const ph = b.isDeficit ? PHASE_DEFICIT : PHASE_MAINT;
          return (
            <View key={b.week} style={{
              width: 28, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
              backgroundColor: b.isCurrent ? ph.color : ph.bg,
              borderWidth: b.isCurrent ? 2 : 1,
              borderColor: b.isCurrent ? ph.color : ph.border,
            }}>
              <Text style={{
                fontSize: 9, fontWeight: '800',
                color: b.isCurrent ? '#fff' : ph.color,
              }}>W{b.week}</Text>
              <Text style={{
                fontSize: 6, fontWeight: '700', marginTop: 1,
                color: b.isCurrent ? '#fff' : ph.color + '80',
              }}>{b.isDeficit ? 'DEF' : 'MNT'}</Text>
            </View>
          );
        })}
        {hidden > 0 && (
          <View style={{
            width: 28, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
            backgroundColor: PAL.softBg, borderWidth: 1, borderColor: PAL.cardBorder,
          }}>
            <Text style={{ fontSize: 8, fontWeight: '800', color: PAL.textGray }}>+{hidden}</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: PHASE_DEFICIT.color }} />
          <Text style={{ fontSize: 10, color: PAL.textGray }}>Deficit</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: PHASE_MAINT.color }} />
          <Text style={{ fontSize: 10, color: PAL.textGray }}>Maintenance</Text>
        </View>
        {isActive && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: PAL.accent }} />
            <Text style={{ fontSize: 10, color: PAL.textGray }}>You are here</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Phase indicator badge ───────────────────────────────────────────────────
function PhaseBadge({ isDeficit, dayInPhase, totalPhaseDays }) {
  const ph = isDeficit ? PHASE_DEFICIT : PHASE_MAINT;
  const progress = dayInPhase / (totalPhaseDays || 1);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: ph.bg, borderRadius: 16, padding: 14,
      borderWidth: 1.5, borderColor: ph.border, marginBottom: 16,
    }}>
      <View style={{
        width: 44, height: 44, borderRadius: 22, backgroundColor: ph.color + '18',
        justifyContent: 'center', alignItems: 'center',
      }}>
        <MaterialCommunityIcons
          name={isDeficit ? 'trending-down' : 'shield-refresh-outline'}
          size={22} color={ph.color}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: ph.color }}>
          {isDeficit ? 'Deficit Phase' : 'Maintenance Phase'}
        </Text>
        <Text style={{ fontSize: 11, color: ph.color + '99', marginTop: 2 }}>
          Day {dayInPhase} of {totalPhaseDays} · {Math.round(progress * 100)}% through
        </Text>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '900', color: ph.color }}>{totalPhaseDays - dayInPhase}</Text>
        <Text style={{ fontSize: 9, color: ph.color + '80' }}>days left</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════════════════
const STEP = { EXPLAIN: 1, CONFIGURE: 2, ACTIVE: 3, EXIT: 4 };

export default function DeficitCyclingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(STEP.EXPLAIN);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialog, setDialog] = useState({ visible: false });
  const showDialog = (opts) => setDialog({ visible: true, ...opts });
  const hideDialog = () => setDialog({ visible: false });

  // config
  const [selectedPreset, setSelectedPreset] = useState(1); // default to MATADOR 2:2

  // active
  const [dcData, setDcData] = useState(null);
  const [caloriesConsumed, setCaloriesConsumed] = useState(0);
  const [proteinConsumed, setProteinConsumed] = useState(0);
  const [, setCarbsConsumed] = useState(0);
  const [, setFatConsumed] = useState(0);

  // exit
  const [exitChoice, setExitChoice] = useState(null);
  const [perspectiveVisible, setPerspectiveVisible] = useState(true);
  const [todayNBAnswered, setTodayNBAnswered] = useState(() => isNBAnsweredToday());
  const [proteinStreak, setProteinStreak] = useState(getDefaultStreak());
  const [workoutSaving, setWorkoutSaving] = useState(false);
  const [deficitFactIdx] = useState(() => new Date().getDate() % DEFICIT_FACTS.length);
  const [maintFactIdx] = useState(() => new Date().getDate() % MAINTENANCE_FACTS.length);

  const screenFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [screenFade, step]);

  useEffect(() => { loadData(); }, []);

  // Refresh meals + streak every time screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (dcData?.active) {
        const uid = auth.currentUser.uid;
        (async () => {
          const today = getLocalDateKey();
          const mSnap = await getDocs(collection(db, 'users', uid, 'logs', today, 'meals'));
          let cal = 0, pro = 0, carb = 0, fat = 0;
          mSnap.docs.forEach(d => {
            const data = d.data();
            cal += data.calories || 0;
            pro += data.protein || 0;
            carb += data.carbs || 0;
            fat += data.fat || 0;
          });
          setCaloriesConsumed(cal);
          setProteinConsumed(Math.round(pro * 10) / 10);
          setCarbsConsumed(Math.round(carb * 10) / 10);
          setFatConsumed(Math.round(fat * 10) / 10);
          const snap = await getDoc(doc(db, 'users', uid, 'profile', 'data'));
          if (!snap.exists()) return;
          const p = snap.data();
          setProfile(p);
          if (p.deficitCycling?.active) setDcData(p.deficitCycling);
          const rawStreak = p.proteinStreak ?? getDefaultStreak();
          const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
          const { updated, streak } = processDailyStreak(rawStreak, pro, p, getLocalDateKey(), getLocalDateKey(yesterday));
          setProteinStreak(streak);
          if (updated) await updateDoc(doc(db, 'users', uid, 'profile', 'data'), { proteinStreak: streak });
        })();
      }
    }, [dcData])
  );

  const loadData = async () => {
    try {
      const uid = auth.currentUser.uid;
      const snap = await getDoc(doc(db, 'users', uid, 'profile', 'data'));
      if (!snap.exists()) return;
      const p = snap.data();
      setProfile(p);
      if (p.deficitCycling?.active) {
        setDcData(p.deficitCycling);
        setStep(STEP.ACTIVE);
        // load today's meals
        const today = getLocalDateKey();
        const mSnap = await getDocs(collection(db, 'users', uid, 'logs', today, 'meals'));
        let cal = 0, pro = 0, carb = 0, fat = 0;
        mSnap.docs.forEach(d => {
          const data = d.data();
          cal += data.calories || 0;
          pro += data.protein || 0;
          carb += data.carbs || 0;
          fat += data.fat || 0;
        });
        setCaloriesConsumed(cal);
        setProteinConsumed(Math.round(pro * 10) / 10);
        setCarbsConsumed(Math.round(carb * 10) / 10);
        setFatConsumed(Math.round(fat * 10) / 10);

        // NB: backfill yesterday + check today
        await backfillYesterdayIfMissing(uid, p);
        const todayRow = await getTodayNBRow(uid);
        const answered = isNBAnsweredToday() || todayRow?.source === 'user_explicit';
        if (todayRow?.source === 'user_explicit') markNBAnswered();
        setTodayNBAnswered(answered);
        // protein streak
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

  const handleWorkoutSave = async (newSettings) => {
    if (!profile) return;
    setWorkoutSaving(true);
    try {
      const updates = recalcProfileWithActivities(profile, newSettings);
      const uid = auth.currentUser.uid;
      await updateDoc(doc(db, 'users', uid, 'profile', 'data'), updates);
      const updatedProfile = { ...profile, ...updates };
      setProfile(updatedProfile);
      // recalc cycling plan with new activities
      if (dcData?.active) {
        const preset = CYCLE_PRESETS.find(p => p.deficitWeeks === dcData.deficitWeeks && p.maintWeeks === dcData.maintWeeks) || CYCLE_PRESETS[1];
        const newPlan = computePlan(updatedProfile, preset);
        newPlan.startedAt = dcData.startedAt;
        await updateDoc(doc(db, 'users', uid, 'profile', 'data'), { deficitCycling: newPlan });
        setDcData(newPlan);
      }
    } catch (e) { console.log('Workout save err:', e.message); }
    finally { setWorkoutSaving(false); }
  };

  // ── Compute full cycling plan ─────────────────────────────────────────────
  const computePlan = useCallback((prof, preset) => {
    const w = prof.currentWeight || prof.weight;
    const h = prof.height;
    const age = prof.age;
    const g = prof.gender;
    const goalW = prof.goalWeight;
    const originalWeeks = prof.targetWeeks;
    const actSettings = prof.activitySettings || {};

    // BMR
    const bmr = g === 'Male'
      ? Math.round(10 * w + 6.25 * h - 5 * age + 5)
      : Math.round(10 * w + 6.25 * h - 5 * age - 161);
    const sedentaryTDEE = Math.round(bmr * 1.2);

    // Workout burn (from user's original activities)
    const weeklyWkBurn = calcWorkoutWeeklyBurn(actSettings);
    const dailyWkBurn = Math.round(weeklyWkBurn / 7);
    const tdee = sedentaryTDEE + dailyWkBurn;

    // Deficit calc
    const excessKg = Math.max(0, w - goalW);
    const originalDeficit = prof.dailyDeficit ?? prof.totalDailyDeficit ?? 0;
    const deficit = originalDeficit > 0 ? originalDeficit : (excessKg > 0 ? Math.round((excessKg * 7700) / (originalWeeks * 7)) : 0);

    // Deficit phase calories & macros
    const deficitCalories = Math.round(tdee - deficit);
    const deficitMacros = { proteinPct: 30, carbsPct: 40, fatPct: 30 };
    const deficitProteinG = Math.round((deficitCalories * 30 / 100) / 4);
    const deficitCarbsG = Math.round((deficitCalories * 40 / 100) / 4);
    const deficitFatG = Math.round((deficitCalories * 30 / 100) / 9);

    // Maintenance phase calories & macros (higher carbs for metabolic signaling)
    const maintCalories = tdee;
    const maintMacros = { proteinPct: 25, carbsPct: 50, fatPct: 25 };
    const maintProteinG = Math.round((maintCalories * 25 / 100) / 4);
    const maintCarbsG = Math.round((maintCalories * 50 / 100) / 4);
    const maintFatG = Math.round((maintCalories * 25 / 100) / 9);

    // Calendar weeks calculation
    // deficitWeeksNeeded = remaining deficit weeks to reach goal
    const deficitWeeksNeeded = deficit > 0 ? Math.max(1, Math.ceil((excessKg * 7700) / (deficit * 7))) : originalWeeks;
    // totalCalendarWeeks = deficit weeks + proportional maintenance weeks
    const cycleRatio = (preset.deficitWeeks + preset.maintWeeks) / preset.deficitWeeks;
    const totalCalendarWeeks = Math.ceil(deficitWeeksNeeded * cycleRatio);

    return {
      active: true,
      startedAt: new Date().toISOString(),
      currentWeight: w,
      goalWeight: goalW,
      bmr, sedentaryTDEE, tdee,
      weeklyWkBurn, dailyWkBurn,
      deficit,
      // Cycle config
      deficitWeeks: preset.deficitWeeks,
      maintWeeks: preset.maintWeeks,
      cycleLabel: preset.label,
      // Deficit phase
      deficitCalories, ...deficitMacros,
      deficitProteinG, deficitCarbsG, deficitFatG,
      // Maintenance phase
      maintCalories, ...maintMacros,
      maintProteinG, maintCarbsG, maintFatG,
      // Timeline
      deficitWeeksNeeded,
      totalCalendarWeeks,
      targetEndDate: new Date(Date.now() + totalCalendarWeeks * 7 * 86400000).toISOString(),
      // Preserve originals for exit
      originalGoalWeight: goalW,
      originalTargetWeeks: originalWeeks,
      originalTargetEndDate: prof.targetEndDate || null,
      originalDailyDeficit: originalDeficit,
      originalActivitySettings: actSettings,
    };
  }, []);

  // ── Get current phase info dynamically ────────────────────────────────────
  const getPhaseInfo = useCallback((data) => {
    if (!data) return { isDeficit: true, dayInPhase: 1, totalPhaseDays: 7, currentWeek: 1, phaseWeek: 1 };
    const start = new Date(data.startedAt);
    const now = new Date();
    const totalDays = Math.max(1, Math.ceil((now - start) / 86400000));
    const currentWeek = Math.ceil(totalDays / 7);
    const cycleLen = data.deficitWeeks + data.maintWeeks;
    const weekInCycle = ((currentWeek - 1) % cycleLen);
    const isDeficit = weekInCycle < data.deficitWeeks;
    const phaseWeek = isDeficit ? weekInCycle + 1 : weekInCycle - data.deficitWeeks + 1;
    const totalPhaseWeeks = isDeficit ? data.deficitWeeks : data.maintWeeks;
    const dayInWeek = ((totalDays - 1) % 7) + 1;
    const dayInPhase = (phaseWeek - 1) * 7 + dayInWeek;
    const totalPhaseDays = totalPhaseWeeks * 7;
    return { isDeficit, dayInPhase, totalPhaseDays, currentWeek, phaseWeek, totalDays };
  }, []);

  // ── Enter mode ────────────────────────────────────────────────────────────
  const handleEnter = async () => {
    if (profile?.maintaining) {
      showDialog({ variant: 'warning', title: 'not available', message: 'deficit cycling is not available while you\'re in maintenance mode. set a new weight goal from the weight log screen to unlock it.' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSaving(true);
    try {
      const preset = CYCLE_PRESETS[selectedPreset];
      const plan = computePlan(profile, preset);
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'profile', 'data'), {
        deficitCycling: plan,
        // Update daily calorie target to deficit phase (starting phase)
        dailyCalorieTarget: plan.deficitCalories,
        targetEndDate: plan.targetEndDate,
      });
      setDcData(plan);
      screenFade.setValue(0);
      setStep(STEP.ACTIVE);
    } catch (e) {
      showDialog({ variant: 'error', title: 'oops', message: e.message });
    } finally { setSaving(false); }
  };

  // ── Start exit ────────────────────────────────────────────────────────────
  const handleStartExit = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    screenFade.setValue(0);
    setExitChoice(null);
    setStep(STEP.EXIT);
  };

  // ── Exit options ──────────────────────────────────────────────────────────
  const getExitOptions = useCallback(() => {
    if (!dcData || !profile) return {};
    const currentW = dcData.currentWeight;
    const goalW = dcData.originalGoalWeight;
    const originalDeficit = dcData.originalDailyDeficit;
    const startDate = new Date(dcData.startedAt);
    const now = new Date();
    const dcDays = Math.max(1, Math.ceil((now - startDate) / 86400000));
    const excessKg = Math.max(0, currentW - goalW);
    const remainingKg = Math.max(0, excessKg);

    // Option 1: continue with original deficit, extend timeline (no cycling)
    // New end date = now + however many days needed at original pace
    const extendDays = originalDeficit > 0 ? Math.max(1, Math.ceil((remainingKg * 7700) / originalDeficit)) : 70;
    const extendWeeks = Math.ceil(extendDays / 7);
    const extendEndDate = new Date(now.getTime() + extendDays * 86400000);

    // Option 2: keep original end date, increase deficit
    let compressEndDate;
    if (dcData.originalTargetEndDate) {
      compressEndDate = new Date(dcData.originalTargetEndDate);
    } else if (dcData.originalTargetWeeks) {
      // fallback: estimate from start + original weeks
      const createdAt = profile.createdAt ? new Date(profile.createdAt) : startDate;
      compressEndDate = new Date(createdAt.getTime() + dcData.originalTargetWeeks * 7 * 86400000);
    } else {
      compressEndDate = new Date(now.getTime() + 7 * 86400000);
    }
    const compressDaysLeft = Math.max(1, Math.ceil((compressEndDate - now) / 86400000));
    const compressWeeks = Math.ceil(compressDaysLeft / 7);
    const compressDeficit = remainingKg > 0 ? Math.round((remainingKg * 7700) / compressDaysLeft) : 0;

    const g = profile.gender;
    const h = profile.height;
    const age = profile.age;
    const bmr = g === 'Male'
      ? Math.round(10 * currentW + 6.25 * h - 5 * age + 5)
      : Math.round(10 * currentW + 6.25 * h - 5 * age - 161);
    const sedentaryTDEE = Math.round(bmr * 1.2);
    const dailyWkBurn = dcData.dailyWkBurn || 0;
    const tdee = sedentaryTDEE + dailyWkBurn;

    const formatTimeLeft = (daysLeft) => {
      const w = Math.floor(daysLeft / 7);
      const d = daysLeft % 7;
      return `${w}w ${d}d`;
    };

    return {
      dcDays, dcWeeks: Math.ceil(dcDays / 7), currentWeight: currentW, goalWeight: goalW, excessKg: remainingKg,
      extend: {
        weeks: extendWeeks, deficit: originalDeficit,
        targetEndDate: extendEndDate.toISOString(),
        foodDeficit: Math.max(0, originalDeficit - dailyWkBurn),
        calories: Math.round(tdee - originalDeficit),
        label: 'Keep my original deficit, extend timeline',
        desc: `same ${originalDeficit} kcal/day deficit — ${formatTimeLeft(extendDays)} to reach ${goalW} kg`,
      },
      compress: {
        weeks: compressWeeks, deficit: compressDeficit,
        targetEndDate: compressEndDate.toISOString(),
        foodDeficit: Math.max(0, compressDeficit - dailyWkBurn),
        calories: Math.round(tdee - compressDeficit),
        label: 'Keep original end date, adjust deficit',
        desc: compressDeficit > 0
          ? `${formatTimeLeft(compressDaysLeft)} left — deficit adjusts to ${compressDeficit} kcal/day`
          : `${formatTimeLeft(compressDaysLeft)} left — you're basically at goal!`,
      },
      bmr, sedentaryTDEE, tdee,
    };
  }, [dcData, profile]);

  // ── Finalize exit ─────────────────────────────────────────────────────────
  const handleExitConfirm = async () => {
    if (!exitChoice) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSaving(true);
    try {
      const opts = getExitOptions();
      const chosen = opts[exitChoice];
      const uid = auth.currentUser.uid;
      await setDoc(doc(db, 'users', uid, 'profile', 'data'), {
        ...profile,
        currentWeight: opts.currentWeight,
        bmr: opts.bmr, sedentaryTDEE: opts.sedentaryTDEE, tdee: opts.tdee,
        targetWeeks: chosen.weeks,
        targetEndDate: chosen.targetEndDate,
        dailyDeficit: chosen.deficit, totalDailyDeficit: chosen.deficit,
        foodDeficit: chosen.foodDeficit,
        dailyCalorieTarget: chosen.calories,
        activitySettings: dcData.originalActivitySettings || profile.activitySettings || {},
        weeklyWorkoutCalories: dcData.weeklyWkBurn || 0,
        deficitCycling: null,
        lastDeficitCyclingEndedAt: new Date().toISOString(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showDialog({
        variant: 'success', title: 'you outsmarted your metabolism!',
        message: `new daily target: ${chosen.calories} kcal\ndeficit: ${chosen.deficit} kcal/day\ntimeline: ${chosen.weeks} weeks\n\nyour metabolism is reset and primed. let's finish this.`,
        actions: [{ label: "let's go!", onPress: () => router.replace('/(tabs)') }],
      });
    } catch (e) {
      showDialog({ variant: 'error', title: 'error', message: e.message });
    } finally { setSaving(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
        <Image source={require('../assets/images/quasar.png')} style={{ width: 240, height: 240 }} resizeMode="contain" />
        <ActivityIndicator size="large" color={PAL.accent} style={{ marginTop: 40 }} />
        <Text style={{ marginTop: 20, color: PAL.accentDark, fontWeight: '600', fontSize: 13 }}>loading your smart plan...</Text>
      </View>
    );
  }

  // ── STEP 1: Explain the science ───────────────────────────────────────────
  if (step === STEP.EXPLAIN) {
    return (
      <Animated.View style={{ flex: 1, backgroundColor: PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[PAL.bg1, PAL.bg2, PAL.bg3]} style={StyleSheet.absoluteFill} />
        <DCDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={[st.backBtn, { backgroundColor: PAL.softBg, borderColor: PAL.cardBorder }]}
            onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={PAL.accent} />
          </TouchableOpacity>

          {/* Hero */}
          <FadeCard style={st.heroBox}>
            <Text style={st.heroEmoji}>🧬</Text>
            <Text style={[st.heroTitle, { color: PAL.text }]}>your body adapts. let's outsmart it.</Text>
            <Text style={[st.heroSub, { color: PAL.textSoft }]}>
              ever noticed weight loss slowing down even though you're doing everything right? that's metabolic adaptation — and science has a fix.
            </Text>
          </FadeCard>

          {/* The problem */}
          <FadeCard delay={100} style={[st.scienceCard, { borderColor: PAL.cardBorder }]}>
            <View style={st.scienceHeader}>
              <View style={[st.scienceIcon, { backgroundColor: '#EF444418' }]}>
                <MaterialCommunityIcons name="alert-decagram-outline" size={20} color="#EF4444" />
              </View>
              <Text style={[st.scienceCardTitle, { color: PAL.text }]}>the problem with non-stop dieting</Text>
            </View>
            <Text style={[st.scienceBody, { color: PAL.textSoft }]}>
              when you stay in a calorie deficit for weeks, your body fights back. it slows your metabolism, increases hunger hormones (ghrelin goes up, leptin crashes), and makes your body burn fewer calories doing the same activities. this is called{' '}
              <Text style={{ fontWeight: '800', color: '#EF4444' }}>metabolic adaptation</Text>
              {' '}— and it's the #1 reason weight loss stalls.
            </Text>
            <View style={[st.bulletRow, { marginTop: 12 }]}>
              {[
                { icon: 'speedometer-slow', text: 'BMR drops 10-15%', color: '#EF4444' },
                { icon: 'emoticon-sad-outline', text: 'Hunger spikes hard', color: '#F59E0B' },
                { icon: 'trending-down', text: 'Progress flatlines', color: '#6B7280' },
              ].map((b, i) => (
                <View key={i} style={[st.bulletChip, { backgroundColor: b.color + '10', borderColor: b.color + '25' }]}>
                  <MaterialCommunityIcons name={b.icon} size={14} color={b.color} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: b.color }}>{b.text}</Text>
                </View>
              ))}
            </View>
          </FadeCard>

          {/* The solution */}
          <FadeCard delay={200} style={[st.scienceCard, { borderColor: PAL.cardBorder }]}>
            <View style={st.scienceHeader}>
              <View style={[st.scienceIcon, { backgroundColor: '#2563EB18' }]}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color="#2563EB" />
              </View>
              <Text style={[st.scienceCardTitle, { color: PAL.text }]}>the solution: intermittent energy restriction</Text>
            </View>
            <Text style={[st.scienceBody, { color: PAL.textSoft }]}>
              instead of grinding through a nonstop deficit, you alternate between deficit weeks and maintenance weeks. during maintenance phases, you eat at your full TDEE — this{' '}
              <Text style={{ fontWeight: '800', color: PAL.accent }}>resets your metabolism</Text>
              , normalizes hunger hormones, and gives your body a signal that there's no famine happening. then when you drop back into a deficit, your body burns fat more efficiently because it hasn't adapted yet.
            </Text>
          </FadeCard>

          {/* The study */}
          <FadeCard delay={300} style={[st.studyCard, { borderColor: '#2563EB40' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <View style={[st.scienceIcon, { backgroundColor: '#2563EB12' }]}>
                <MaterialCommunityIcons name="flask-outline" size={18} color="#2563EB" />
              </View>
              <Text style={{ fontSize: 12, fontWeight: '800', color: PAL.accent, letterSpacing: 0.5 }}>THE MATADOR STUDY</Text>
            </View>

            <Text style={[st.studyTitle, { color: PAL.text }]}>
              "Intermittent energy restriction attenuates the loss of fat-free mass…"
            </Text>
            <Text style={[st.studyMeta, { color: PAL.textGray }]}>
              Byrne et al., 2018 · International Journal of Obesity · University of Tasmania
            </Text>

            <View style={[st.studyDivider, { backgroundColor: PAL.cardBorder }]} />

            <Text style={[st.studyBody, { color: PAL.textSoft }]}>
              51 obese men were split into two groups: one dieted continuously for 16 weeks, the other alternated 2 weeks of deficit with 2 weeks of maintenance (taking 30 weeks total for the same 16 deficit weeks).
            </Text>

            <View style={st.studyResultsGrid}>
              <View style={[st.studyResult, { backgroundColor: '#10B98112', borderColor: '#10B98130' }]}>
                <Text style={{ fontSize: 28, fontWeight: '900', color: '#059669' }}>47%</Text>
                <Text style={{ fontSize: 10, color: '#065F46', fontWeight: '700', textAlign: 'center' }}>more fat lost by the cycling group</Text>
              </View>
              <View style={[st.studyResult, { backgroundColor: '#2563EB12', borderColor: '#2563EB30' }]}>
                <Text style={{ fontSize: 28, fontWeight: '900', color: '#1D4ED8' }}>–8.0</Text>
                <Text style={{ fontSize: 10, color: '#1E3A5F', fontWeight: '700', textAlign: 'center' }}>kg more total weight loss</Text>
              </View>
            </View>

            <View style={[st.studyHighlight, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
              <MaterialCommunityIcons name="star-four-points" size={14} color="#D97706" />
              <Text style={{ flex: 1, fontSize: 11, lineHeight: 17, color: '#92400E', fontWeight: '600' }}>
                6 months after the study ended, the cycling group had kept off 8 kg more weight than the continuous group. their metabolisms hadn't crashed.
              </Text>
            </View>

            <Text style={[st.studyFootnote, { color: PAL.textGray }]}>
              DOI: 10.1038/s41366-018-0002-y
            </Text>
          </FadeCard>

          {/* Visual comparison */}
          <FadeCard delay={400} style={[st.comparisonCard, { borderColor: PAL.cardBorder }]}>
            <Text style={[st.comparisonTitle, { color: PAL.text }]}>continuous vs. cycling — side by side</Text>
            <View style={st.comparisonRow}>
              <View style={[st.comparisonCol, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <MaterialCommunityIcons name="close-circle" size={18} color="#DC2626" />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#DC2626', marginTop: 6 }}>Continuous</Text>
                <Text style={st.comparisonItem}>metabolism crashes</Text>
                <Text style={st.comparisonItem}>hunger gets brutal</Text>
                <Text style={st.comparisonItem}>muscle loss increases</Text>
                <Text style={st.comparisonItem}>weight rebounds after</Text>
              </View>
              <View style={[st.comparisonCol, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <MaterialCommunityIcons name="check-circle" size={18} color="#2563EB" />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#2563EB', marginTop: 6 }}>Cycling</Text>
                <Text style={st.comparisonItem}>metabolism stays active</Text>
                <Text style={st.comparisonItem}>hunger stays manageable</Text>
                <Text style={st.comparisonItem}>muscle preserved better</Text>
                <Text style={st.comparisonItem}>results stick long-term</Text>
              </View>
            </View>
          </FadeCard>

          {/* What happens in this mode */}
          <FadeCard delay={500} style={[st.scienceCard, { borderColor: PAL.cardBorder }]}>
            <View style={st.scienceHeader}>
              <View style={[st.scienceIcon, { backgroundColor: '#2563EB18' }]}>
                <MaterialCommunityIcons name="cog-outline" size={20} color="#2563EB" />
              </View>
              <Text style={[st.scienceCardTitle, { color: PAL.text }]}>what happens when you activate this</Text>
            </View>
            {[
              { icon: 'swap-horizontal', color: '#2563EB', text: 'your calories automatically cycle between deficit and maintenance phases' },
              { icon: 'food-apple-outline', color: '#10B981', text: 'meal logging stays active — you stay in the habit' },
              { icon: 'scale-bathroom', color: '#8B5CF6', text: 'weekly check-ins stay active — everything recalculates with new weight' },
              { icon: 'run-fast', color: '#F59E0B', text: 'workouts stay the same — your existing activities are factored into TDEE' },
              { icon: 'chart-timeline-variant', color: '#DC2626', text: 'macros shift per phase — more carbs during maintenance for metabolic signaling' },
              { icon: 'calendar-expand-horizontal', color: '#6B7280', text: 'timeline extends to accommodate maintenance weeks — but results are better' },
            ].map((item, i) => (
              <View key={i} style={st.featureRow}>
                <View style={[st.featureDot, { backgroundColor: item.color + '18' }]}>
                  <MaterialCommunityIcons name={item.icon} size={14} color={item.color} />
                </View>
                <Text style={[st.featureText, { color: PAL.textSoft }]}>{item.text}</Text>
              </View>
            ))}
          </FadeCard>

          <FadeCard delay={600}>
            <TouchableOpacity
              style={[st.btnAccent, { backgroundColor: PAL.accent }]}
              onPress={() => { screenFade.setValue(0); setStep(STEP.CONFIGURE); }}
            >
              <Text style={st.btnAccentText}>i'm in — let's set it up</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={[st.footnote, { color: PAL.textGray }]}>
              you can exit anytime and choose how to continue
            </Text>
          </FadeCard>

          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  // ── STEP 2: Configure cycle ───────────────────────────────────────────────
  if (step === STEP.CONFIGURE) {
    const preset = CYCLE_PRESETS[selectedPreset];
    const preview = profile ? computePlan(profile, preset) : null;

    return (
      <Animated.View style={{ flex: 1, backgroundColor: PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[PAL.bg1, PAL.bg2, PAL.bg3]} style={StyleSheet.absoluteFill} />
        <DCDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={[st.backBtn, { backgroundColor: PAL.softBg, borderColor: PAL.cardBorder }]}
            onPress={() => { screenFade.setValue(0); setStep(STEP.EXPLAIN); }}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={PAL.accent} />
          </TouchableOpacity>

          <FadeCard style={st.heroBox}>
            <Text style={st.heroEmoji}>⚡</Text>
            <Text style={[st.heroTitle, { color: PAL.text }]}>pick your cycle rhythm</Text>
            <Text style={[st.heroSub, { color: PAL.textSoft }]}>
              choose how many weeks you want to cut, then how many weeks to eat at maintenance before repeating. the 2:2 is the original MATADOR protocol.
            </Text>
          </FadeCard>

          {/* Cycle presets */}
          <FadeCard delay={100}>
            {CYCLE_PRESETS.map((cp, i) => {
              const sel = selectedPreset === i;
              return (
                <TouchableOpacity key={i}
                  style={[st.presetCard, { borderColor: sel ? PAL.accent : PAL.cardBorder },
                    sel && { borderWidth: 2, backgroundColor: '#EFF6FF' }]}
                  onPress={() => { Haptics.selectionAsync(); setSelectedPreset(i); }}
                  activeOpacity={0.88}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 48, height: 48, borderRadius: 14,
                      backgroundColor: sel ? PAL.accent + '18' : PAL.softBg,
                      justifyContent: 'center', alignItems: 'center',
                      borderWidth: 1, borderColor: sel ? PAL.accent + '40' : PAL.cardBorder,
                    }}>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: sel ? PAL.accent : PAL.textGray }}>{cp.label}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: sel ? PAL.accentDark : PAL.text }}>{cp.desc}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <View style={[st.tagPill, { backgroundColor: sel ? PAL.accent + '15' : '#F3F4F6', borderColor: sel ? PAL.accent + '30' : '#E5E7EB' }]}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: sel ? PAL.accent : PAL.textGray }}>{cp.tag}</Text>
                        </View>
                      </View>
                    </View>
                    {sel && <MaterialCommunityIcons name="check-circle" size={22} color={PAL.accent} />}
                  </View>

                  {/* Mini visual cycle */}
                  <View style={{ flexDirection: 'row', gap: 3, marginTop: 12 }}>
                    {Array.from({ length: cp.deficitWeeks + cp.maintWeeks }).map((_, wi) => {
                      const isDef = wi < cp.deficitWeeks;
                      return (
                        <View key={wi} style={{
                          flex: 1, height: 6, borderRadius: 3,
                          backgroundColor: isDef ? PHASE_DEFICIT.color + (sel ? 'CC' : '40') : PHASE_MAINT.color + (sel ? 'CC' : '40'),
                        }} />
                      );
                    })}
                  </View>
                </TouchableOpacity>
              );
            })}
          </FadeCard>

          {/* Preview numbers */}
          {preview && (
            <FadeCard delay={200} style={[st.previewWrap, { borderColor: PAL.cardBorder }]}>
              <Text style={[st.previewTitle, { color: PAL.textGray }]}>YOUR PLAN PREVIEW</Text>

              {/* Timeline visual */}
              <CycleTimeline
                deficitWeeks={preview.deficitWeeks}
                maintWeeks={preview.maintWeeks}
                totalCalendarWeeks={preview.totalCalendarWeeks}
                currentWeek={0}
                isActive={false}
              />

              <View style={st.previewStatsGrid}>
                {[
                  { val: preview.totalCalendarWeeks, lbl: 'Total weeks', icon: 'calendar-range', color: PAL.accent },
                  { val: preview.deficitWeeksNeeded, lbl: 'Deficit weeks', icon: 'trending-down', color: PHASE_DEFICIT.color },
                  { val: preview.totalCalendarWeeks - preview.deficitWeeksNeeded, lbl: 'Maint weeks', icon: 'shield-refresh-outline', color: PHASE_MAINT.color },
                  { val: preview.deficit, lbl: 'Deficit (kcal)', icon: 'fire', color: '#F59E0B' },
                ].map((s, i) => (
                  <View key={i} style={[st.previewStatCell, { backgroundColor: s.color + '08', borderColor: s.color + '20' }]}>
                    <MaterialCommunityIcons name={s.icon} size={14} color={s.color} />
                    <Text style={[st.previewStatVal, { color: s.color }]}>{s.val}</Text>
                    <Text style={st.previewStatLbl}>{s.lbl}</Text>
                  </View>
                ))}
              </View>

              {/* Deficit vs Maintenance side by side */}
              <View style={st.phaseCompare}>
                <View style={[st.phaseBox, { backgroundColor: PHASE_DEFICIT.bg, borderColor: PHASE_DEFICIT.border }]}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: PHASE_DEFICIT.color, letterSpacing: 1 }}>DEFICIT PHASE</Text>
                  <Text style={{ fontSize: 28, fontWeight: '900', color: PHASE_DEFICIT.color, marginVertical: 4 }}>{preview.deficitCalories}</Text>
                  <Text style={{ fontSize: 10, color: PHASE_DEFICIT.color + '80' }}>kcal/day</Text>
                  <View style={{ marginTop: 8, gap: 3 }}>
                    <Text style={{ fontSize: 9, color: PHASE_DEFICIT.color + '99' }}>P {preview.deficitProteinG}g · C {preview.deficitCarbsG}g · F {preview.deficitFatG}g</Text>
                  </View>
                </View>
                <View style={[st.phaseBox, { backgroundColor: PHASE_MAINT.bg, borderColor: PHASE_MAINT.border }]}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: PHASE_MAINT.color, letterSpacing: 1 }}>MAINTENANCE</Text>
                  <Text style={{ fontSize: 28, fontWeight: '900', color: PHASE_MAINT.color, marginVertical: 4 }}>{preview.maintCalories}</Text>
                  <Text style={{ fontSize: 10, color: PHASE_MAINT.color + '80' }}>kcal/day</Text>
                  <View style={{ marginTop: 8, gap: 3 }}>
                    <Text style={{ fontSize: 9, color: PHASE_MAINT.color + '99' }}>P {preview.maintProteinG}g · C {preview.maintCarbsG}g · F {preview.maintFatG}g</Text>
                  </View>
                </View>
              </View>

              <View style={[st.timelineNote, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <MaterialCommunityIcons name="information-outline" size={14} color="#D97706" />
                <Text style={{ flex: 1, fontSize: 11, lineHeight: 17, color: '#92400E' }}>
                  your original plan was {profile?.targetWeeks} weeks. with cycling, it'll take ~{preview.totalCalendarWeeks} calendar weeks — but you'll lose more fat, keep more muscle, and the results will actually stick.
                </Text>
              </View>
            </FadeCard>
          )}

          <FadeCard delay={300}>
            <TouchableOpacity
              style={[st.btnAccent, { backgroundColor: PAL.accent, opacity: saving ? 0.6 : 1 }]}
              onPress={handleEnter}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                  <MaterialCommunityIcons name="dna" size={20} color="#fff" />
                  <Text style={st.btnAccentText}>activate deficit cycling</Text>
                </>
              }
            </TouchableOpacity>
          </FadeCard>

          <View style={{ height: 48 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  // ── STEP 3: Active dashboard ──────────────────────────────────────────────
  if (step === STEP.ACTIVE && dcData) {
    const phase = getPhaseInfo(dcData);
    const isDeficit = phase.isDeficit;
    const ph = isDeficit ? PHASE_DEFICIT : PHASE_MAINT;
    const todayCalories = isDeficit ? dcData.deficitCalories : dcData.maintCalories;
    const todayProteinG = isDeficit ? dcData.deficitProteinG : dcData.maintProteinG;
    const todayCarbsG = isDeficit ? dcData.deficitCarbsG : dcData.maintCarbsG;
    const todayFatG = isDeficit ? dcData.deficitFatG : dcData.maintFatG;
    return (
      <Animated.View style={{ flex: 1, backgroundColor: PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[PAL.bg1, PAL.bg2, PAL.bg3]} style={StyleSheet.absoluteFill} />
        <DCDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <FadeCard delay={0} style={st.activeHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PulseDot color={ph.color} />
              <Text style={[st.activeTitle, { color: PAL.text }]}>Deficit Cycling</Text>
            </View>
            <View style={[st.modeBadge, { backgroundColor: ph.color + '18', borderColor: ph.color + '35' }]}>
              <MaterialCommunityIcons name={isDeficit ? 'trending-down' : 'shield-refresh-outline'} size={14} color={ph.color} />
              <Text style={[st.modeBadgeText, { color: ph.color }]}>{isDeficit ? 'Cutting' : 'Refeeding'}</Text>
            </View>
          </FadeCard>

          {/* Phase badge */}
          <PhaseBadge isDeficit={isDeficit} dayInPhase={phase.dayInPhase} totalPhaseDays={phase.totalPhaseDays} />

          {/* Phase-aware perspective check */}
          {perspectiveVisible && (() => {
            const facts = isDeficit ? DEFICIT_FACTS : MAINTENANCE_FACTS;
            const idx = isDeficit ? deficitFactIdx : maintFactIdx;
            const fact = facts[idx];
            const factColor = isDeficit ? '#DC2626' : '#059669';
            return (
              <FadeCard delay={80} style={[st.perspectiveCard, { borderColor: factColor + '30' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{
                    width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
                    backgroundColor: factColor + '15', marginRight: 8,
                  }}>
                    <MaterialCommunityIcons name={fact.icon} size={14} color={factColor} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: factColor }}>
                    {isDeficit ? 'DEFICIT PERSPECTIVE' : 'MAINTENANCE PERSPECTIVE'}
                  </Text>
                  <TouchableOpacity onPress={() => setPerspectiveVisible(false)}
                    style={{ width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: PAL.softBg }}>
                    <MaterialCommunityIcons name="close" size={14} color={PAL.textGray} />
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 12, lineHeight: 19, color: PAL.textSoft }}>{fact.text}</Text>
              </FadeCard>
            );
          })()}

          {/* Calorie ring */}
          <FadeCard delay={100} style={[st.ringCard, { borderColor: PAL.cardBorder }]}>
            <CalorieRing consumed={caloriesConsumed} target={todayCalories} phaseColor={ph.color} />
            <Text style={[st.calNote, { color: PAL.textGray }]}>
              {isDeficit
                ? "deficit phase — stay within target to maximize fat loss"
                : "maintenance phase — eat your full TDEE, reset your metabolism"
              }
            </Text>
          </FadeCard>

          {/* Daily check-in */}
          {!todayNBAnswered && (
            <FadeCard delay={180}>
              <View style={[st.nbCheckCard, { borderColor: PAL.accent + '30' }]}>
                <View style={st.nbCheckRow}>
                  <MaterialCommunityIcons name="chart-timeline-variant" size={15} color={PAL.textGray} />
                  <Text style={[st.nbCheckText, { color: PAL.textGray }]}>
                    not tracking every meal? no worries - just let us know how today went so we can look out for you
                  </Text>
                </View>
                <View style={st.nbCheckBtns}>
                  <TouchableOpacity style={[st.nbCheckBtnGood, { borderColor: '#16A34A40', backgroundColor: '#16A34A0D' }]} onPress={() => confirmNBAnswer(false)} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="check" size={13} color="#4ADE80" />
                    <Text style={[st.nbCheckBtnText, { color: '#4ADE80' }]}>stayed within</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.nbCheckBtnOver, { borderColor: PAL.accent + '40', backgroundColor: PAL.accent + '0D' }]} onPress={() => confirmNBAnswer(true)} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="trending-up" size={13} color={PAL.accentLight} />
                    <Text style={[st.nbCheckBtnText, { color: PAL.accentLight }]}>went over</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </FadeCard>
          )}

          {/* Macros */}
          <FadeCard delay={200} style={[st.macroCard, { borderColor: PAL.cardBorder }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <MaterialCommunityIcons name="chart-donut" size={16} color={ph.color} />
              <Text style={[st.macroCardTitle, { color: PAL.textGray }]}>
                {isDeficit ? 'DEFICIT MACROS' : 'MAINTENANCE MACROS'}
              </Text>
            </View>
            <MacroBar label="Protein" grams={todayProteinG} pct={isDeficit ? 30 : 25}
              color="#EF4444" icon="food-steak" delay={300} />
            <MacroBar label="Carbs" grams={todayCarbsG} pct={isDeficit ? 40 : 50}
              color="#F59E0B" icon="barley" delay={450} />
            <MacroBar label="Fat" grams={todayFatG} pct={isDeficit ? 30 : 25}
              color="#3B82F6" icon="water" delay={600} />

            {!isDeficit && (
              <View style={[st.scienceNote, { backgroundColor: '#10B98112', borderColor: '#10B98130' }]}>
                <MaterialCommunityIcons name="leaf" size={14} color="#059669" />
                <Text style={{ flex: 1, fontSize: 11, lineHeight: 17, color: '#065F46' }}>
                  higher carbs during maintenance boost leptin and thyroid hormones — this is what resets your metabolism.
                </Text>
              </View>
            )}
          </FadeCard>

          {/* Cycle timeline */}
          <FadeCard delay={300} style={[st.timelineCard, { borderColor: PAL.cardBorder }]}>
            <CycleTimeline
              deficitWeeks={dcData.deficitWeeks}
              maintWeeks={dcData.maintWeeks}
              totalCalendarWeeks={dcData.totalCalendarWeeks}
              currentWeek={phase.currentWeek}
              isActive={true}
            />
          </FadeCard>

          {/* Stats grid */}
          <FadeCard delay={400} style={[st.statsGrid, { borderColor: PAL.cardBorder }]}>
            {[
              { val: dcData.bmr, lbl: 'BMR', icon: 'heart-outline', color: '#6B7280' },
              { val: dcData.tdee, lbl: 'TDEE', icon: 'fire', color: '#F59E0B' },
              { val: dcData.deficit, lbl: 'Deficit', icon: 'trending-down', color: PHASE_DEFICIT.color },
              { val: todayCalories, lbl: 'Today Target', icon: 'target', color: ph.color },
              { val: dcData.dailyWkBurn, lbl: 'Workout/Day', icon: 'lightning-bolt', color: '#8B5CF6' },
              { val: `W${phase.currentWeek}/${dcData.totalCalendarWeeks}`, lbl: 'Progress', icon: 'calendar-clock', color: '#0891B2' },
            ].map((s, i) => (
              <View key={i} style={[st.statCell, { backgroundColor: (typeof s.val === 'string' ? PAL.accent : s.color) + '08', borderColor: (typeof s.val === 'string' ? PAL.accent : s.color) + '20' }]}>
                <MaterialCommunityIcons name={s.icon} size={16} color={typeof s.val === 'string' ? PAL.accent : s.color} style={{ marginBottom: 4 }} />
                {typeof s.val === 'string'
                  ? <Text style={[st.statVal, { color: PAL.accent }]}>{s.val}</Text>
                  : <AnimatedNum value={s.val} style={[st.statVal, { color: s.color }]} />
                }
                <Text style={st.statLbl}>{s.lbl}</Text>
              </View>
            ))}
          </FadeCard>

          {/* Protein Warrior */}
          <FadeCard delay={440}>
            <ProteinWarriorCard proteinStreak={proteinStreak} proteinConsumed={proteinConsumed} profile={profile} />
          </FadeCard>

          {/* Workout Editor */}
          <FadeCard delay={445}>
            <WorkoutEditor
              activitySettings={profile?.activitySettings || {}}
              onSave={handleWorkoutSave}
              accent={PAL.accent}
              saving={workoutSaving}
              cardBorder={PAL.cardBorder}
            />
          </FadeCard>

          {/* Log meal */}
          <FadeCard delay={500}>
            <TouchableOpacity style={st.logBtn} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/MealLogScreen');
            }}>
              <LinearGradient colors={[ph.color, ph.color + 'CC']} style={st.logBtnGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <MaterialCommunityIcons name="plus-circle" size={22} color="#fff" />
                <Text style={st.logBtnText}>Log a Meal</Text>
              </LinearGradient>
            </TouchableOpacity>
          </FadeCard>

          {/* Weight check-in */}
          <FadeCard delay={550}>
            <TouchableOpacity
              style={[st.weightBtn, { borderColor: '#8B5CF640' }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push('/WeeklyCheckIn');
              }}
            >
              <MaterialCommunityIcons name="scale-bathroom" size={18} color="#8B5CF6" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#8B5CF6' }}>Log Weight</Text>
              <Text style={{ fontSize: 11, color: PAL.textGray, marginLeft: 'auto' }}>recalculates everything</Text>
            </TouchableOpacity>
          </FadeCard>

          {/* End mode */}
          <FadeCard delay={650}>
            <TouchableOpacity style={[st.endBtn, { borderColor: '#D9770640' }]} onPress={handleStartExit}>
              <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 16, borderRadius: 14,
              }}>
                <MaterialCommunityIcons name="exit-run" size={20} color="#D97706" />
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#92400E' }}>exit deficit cycling</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={[st.endNote, { color: PAL.textGray }]}>
              you'll choose how to continue your plan
            </Text>
          </FadeCard>

          <View style={{ height: 48 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  // ── STEP 4: Exit flow ─────────────────────────────────────────────────────
  if (step === STEP.EXIT) {
    const opts = getExitOptions();

    return (
      <Animated.View style={{ flex: 1, backgroundColor: PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[PAL.bg1, PAL.bg2, '#DCFCE7']} style={StyleSheet.absoluteFill} />
        <DCDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={[st.backBtn, { backgroundColor: PAL.softBg, borderColor: PAL.cardBorder }]}
            onPress={() => { screenFade.setValue(0); setStep(STEP.ACTIVE); }}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={PAL.accent} />
          </TouchableOpacity>

          <FadeCard style={st.heroBox}>
            <Text style={st.heroEmoji}>🧬</Text>
            <Text style={[st.heroTitle, { color: PAL.text }]}>metabolism: reset complete</Text>
            <Text style={[st.heroSub, { color: PAL.textSoft }]}>
              you ran {opts.dcWeeks} weeks of deficit cycling. your metabolism is refreshed and ready to burn. let's decide how you want to finish.
            </Text>
          </FadeCard>

          {/* Summary */}
          <FadeCard delay={100} style={[st.exitSummaryCard, { borderColor: PAL.cardBorder }]}>
            <Text style={[st.exitSummaryTitle, { color: PAL.textGray }]}>CYCLING SUMMARY</Text>
            <View style={st.exitSummaryRow}>
              {[
                { val: opts.dcWeeks, lbl: 'weeks cycling' },
                { val: opts.currentWeight, lbl: 'current kg' },
                { val: opts.goalWeight, lbl: 'goal kg' },
                { val: opts.excessKg?.toFixed(1), lbl: 'kg to go' },
              ].map((s, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[st.exitSummaryVal, { color: PAL.accentDark }]}>{s.val}</Text>
                  <Text style={st.exitSummaryLbl}>{s.lbl}</Text>
                </View>
              ))}
            </View>
          </FadeCard>

          <FadeCard delay={150}>
            <Text style={[st.choiceTitle, { color: PAL.text }]}>how do you want to continue?</Text>
          </FadeCard>

          {/* Option cards — same pattern as LoadManagement exit */}
          {['extend', 'compress'].map((key, idx) => {
            const opt = opts[key];
            if (!opt) return null;
            const sel = exitChoice === key;
            const iconName = key === 'extend' ? 'clock-outline' : 'lightning-bolt';
            return (
              <FadeCard key={key} delay={200 + idx * 100}>
                <TouchableOpacity
                  style={[st.choiceCard, { borderColor: sel ? '#16A34A' : PAL.cardBorder },
                    sel && { borderWidth: 2, backgroundColor: '#F0FDF4' }]}
                  onPress={() => { Haptics.selectionAsync(); setExitChoice(key); }}
                  activeOpacity={0.88}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: sel ? '#16A34A18' : PAL.softBg,
                      justifyContent: 'center', alignItems: 'center',
                    }}>
                      <MaterialCommunityIcons name={iconName} size={18} color={sel ? '#16A34A' : PAL.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.choiceCardTitle, { color: sel ? '#14532D' : PAL.text }]}>{opt.label}</Text>
                    </View>
                    {sel && <MaterialCommunityIcons name="check-circle" size={22} color="#16A34A" />}
                  </View>
                  <Text style={[st.choiceCardDesc, { color: sel ? '#4B7C5E' : PAL.textGray }]}>{opt.desc}</Text>
                  <View style={st.choiceStatsRow}>
                    {[
                      { val: opt.calories, lbl: 'kcal/day' },
                      { val: opt.deficit, lbl: 'deficit' },
                      { val: opt.weeks, lbl: 'weeks' },
                    ].map((s, i) => (
                      <View key={i} style={st.choiceStatBox}>
                        <Text style={[st.choiceStatVal, { color: sel ? '#16A34A' : PAL.cool }]}>{s.val}</Text>
                        <Text style={st.choiceStatLbl}>{s.lbl}</Text>
                      </View>
                    ))}
                  </View>
                </TouchableOpacity>
              </FadeCard>
            );
          })}

          {exitChoice === 'compress' && opts.compress?.deficit > 500 && (
            <FadeCard delay={400}>
              <View style={[st.warningBox, { borderColor: '#EF444430' }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#EF4444" />
                <Text style={{ flex: 1, fontSize: 11, lineHeight: 17, color: '#B91C1C' }}>
                  {opts.compress.deficit} kcal/day is aggressive. consider the extended timeline for a smoother ride.
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

  // Science cards
  scienceCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, borderWidth: 1, marginBottom: 16 },
  scienceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  scienceIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  scienceCardTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  scienceBody: { fontSize: 13, lineHeight: 21 },
  bulletRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bulletChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },

  // Study card
  studyCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, borderWidth: 1.5, marginBottom: 16 },
  studyTitle: { fontSize: 14, fontWeight: '800', lineHeight: 20, marginBottom: 4 },
  studyMeta: { fontSize: 11, marginBottom: 12 },
  studyDivider: { height: 1, marginBottom: 12 },
  studyBody: { fontSize: 12, lineHeight: 19, marginBottom: 14 },
  studyResultsGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  studyResult: { flex: 1, alignItems: 'center', borderRadius: 16, paddingVertical: 16, borderWidth: 1 },
  studyHighlight: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 10 },
  studyFootnote: { fontSize: 10, fontStyle: 'italic', textAlign: 'center' },

  // Comparison
  comparisonCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, borderWidth: 1, marginBottom: 16 },
  comparisonTitle: { fontSize: 15, fontWeight: '800', marginBottom: 14 },
  comparisonRow: { flexDirection: 'row', gap: 8 },
  comparisonCol: { flex: 1, borderRadius: 16, padding: 14, borderWidth: 1, alignItems: 'center' },
  comparisonItem: { fontSize: 11, color: '#4B5563', marginTop: 6, textAlign: 'center' },

  // Features list
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  featureDot: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  featureText: { flex: 1, fontSize: 12, lineHeight: 19 },

  // Presets
  presetCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, marginBottom: 10 },
  tagPill: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },

  // Preview
  previewWrap: { backgroundColor: '#fff', borderRadius: 22, padding: 20, borderWidth: 1, marginBottom: 16 },
  previewTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 14 },
  previewStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  previewStatCell: { width: (SCREEN_W - 80) / 2 - 6, alignItems: 'center', borderRadius: 14, paddingVertical: 10, borderWidth: 1 },
  previewStatVal: { fontSize: 20, fontWeight: '900' },
  previewStatLbl: { fontSize: 9, color: '#6B7280', marginTop: 2, textAlign: 'center' },
  phaseCompare: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  phaseBox: { flex: 1, borderRadius: 16, padding: 14, borderWidth: 1, alignItems: 'center' },
  timelineNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, borderWidth: 1 },

  btnAccent: {
    borderRadius: 16, paddingVertical: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  btnAccentText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 18 },

  // Active
  activeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  activeTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  modeBadgeText: { fontSize: 12, fontWeight: '700' },

  perspectiveCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, borderWidth: 1, marginBottom: 14 },
  ringCard: { backgroundColor: '#fff', borderRadius: 22, padding: 22, borderWidth: 1, marginBottom: 16, alignItems: 'center' },
  calNote: { fontSize: 11, textAlign: 'center', fontStyle: 'italic', marginTop: 12 },

  macroCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, borderWidth: 1, marginBottom: 16 },
  macroCardTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  scienceNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, borderWidth: 1, marginTop: 4 },

  timelineCard: { backgroundColor: '#fff', borderRadius: 22, padding: 18, borderWidth: 1, marginBottom: 16 },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    backgroundColor: '#fff', borderRadius: 22, padding: 12, borderWidth: 1, marginBottom: 16,
  },
  statCell: { width: (SCREEN_W - 80) / 3 - 6, alignItems: 'center', borderRadius: 14, paddingVertical: 12, borderWidth: 1 },
  statVal: { fontSize: 18, fontWeight: '900' },
  statLbl: { fontSize: 9, color: '#6B7280', marginTop: 3, textAlign: 'center' },

  logBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  logBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 17 },
  logBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  weightBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#8B5CF608', borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12,
  },

  endBtn: { borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, marginBottom: 8 },
  endNote: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 16 },

  // Exit
  exitSummaryCard: { backgroundColor: '#fff', borderRadius: 22, padding: 16, borderWidth: 1, marginBottom: 16 },
  exitSummaryTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 12 },
  exitSummaryRow: { flexDirection: 'row', alignItems: 'center' },
  exitSummaryVal: { fontSize: 20, fontWeight: '800' },
  exitSummaryLbl: { fontSize: 10, color: '#6B7280', marginTop: 3 },

  choiceTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  choiceCard: { backgroundColor: '#fff', borderRadius: 22, padding: 18, borderWidth: 1, marginBottom: 12 },
  choiceCardTitle: { fontSize: 14, fontWeight: '800' },
  choiceCardDesc: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  choiceStatsRow: { flexDirection: 'row', gap: 8 },
  choiceStatBox: { flex: 1, alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#BFDBFE' },
  choiceStatVal: { fontSize: 18, fontWeight: '900' },
  choiceStatLbl: { fontSize: 9, color: '#6B7280', marginTop: 2 },

  warningBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, borderWidth: 1, backgroundColor: '#FEF2F2', marginBottom: 8 },
  nbCheckCard: { borderRadius: 16, borderWidth: 1, backgroundColor: '#EFF6FF', padding: 14, marginBottom: 14, gap: 12 },
  nbCheckRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  nbCheckText: { flex: 1, fontSize: 12, lineHeight: 18 },
  nbCheckBtns: { flexDirection: 'row', gap: 10 },
  nbCheckBtnGood: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  nbCheckBtnOver: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  nbCheckBtnText: { fontSize: 12, fontWeight: '700' },
});
