import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Animated, Easing,
  ActivityIndicator, Dimensions, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle, Line, Text as SvgText, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { getLocalDateKey } from '../utils/date';
import { getTimeLeft } from '../utils/timeLeft';
import {
  getCheatCompensationState,
  getEffectiveCalorieTarget,
} from '../utils/cheatCompensation';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 64;
const CHART_H = 160;

// ─── Mini sparkline chart ──────────────────────────────────────────────────────
function WeightChart({ history, goalWeight }) {
  if (!history || history.length < 2) return null;

  const weights = history.map(h => h.weight);
  const minW = Math.min(...weights, goalWeight) - 1;
  const maxW = Math.max(...weights) + 1;
  const range = maxW - minW || 1;

  const toX = (i) => (i / (history.length - 1)) * CHART_W;
  const toY = (w) => CHART_H - ((w - minW) / range) * CHART_H;

  const linePath = history.map((h, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(h.weight).toFixed(1)}`
  ).join(' ');

  const areaPath = linePath +
    ` L ${toX(history.length - 1).toFixed(1)} ${CHART_H} L 0 ${CHART_H} Z`;

  const goalY = toY(goalWeight);

  return (
    <Svg width={CHART_W} height={CHART_H + 4}>
      <Defs>
        <SvgGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#ff4030" stopOpacity="0.35" />
          <Stop offset="100%" stopColor="#ff4030" stopOpacity="0" />
        </SvgGradient>
      </Defs>

      {/* Goal line */}
      {goalY >= 0 && goalY <= CHART_H && (
        <>
          <Line x1="0" y1={goalY} x2={CHART_W} y2={goalY}
            stroke="#27ae60" strokeWidth="1.5" strokeDasharray="5,4" />
          <SvgText x={CHART_W - 4} y={goalY - 5} fontSize="9" fill="#27ae60" textAnchor="end">
            goal {goalWeight}kg
          </SvgText>
        </>
      )}

      {/* Area fill */}
      <Path d={areaPath} fill="url(#areaGrad)" />

      {/* Line */}
      <Path d={linePath} fill="none" stroke="#ff4030" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots */}
      {history.map((h, i) => (
        <Circle key={i} cx={toX(i)} cy={toY(h.weight)} r="4"
          fill={i === history.length - 1 ? '#ff4030' : '#fff'}
          stroke="#ff4030" strokeWidth="2" />
      ))}
    </Svg>
  );
}

// ─── Big animated weight number ────────────────────────────────────────────────
function AnimatedWeight({ value }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [displayed, setDisplayed] = useState(value || 0);

  useEffect(() => {
    if (!value) return;
    Animated.timing(anim, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    setDisplayed(value);
  }, [anim, value]);

  return (
    <Text style={styles.bigWeight}>{displayed || '—'}</Text>
  );
}

export default function WeightLogScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newWeight, setNewWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);   // live recalc preview
  const [saved, setSaved] = useState(false);       // success state
  const [savedPlan, setSavedPlan] = useState(null);
  const [goalAchieved, setGoalAchieved] = useState(false);
  const [goalChoice, setGoalChoice] = useState(null); // 'new' or 'maintain'
  const [newGoalW, setNewGoalW] = useState('');
  const [newGoalWeeks, setNewGoalWeeks] = useState('');

  // slide-in animation for the result card
  const resultAnim = useRef(new Animated.Value(40)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const load = async () => {
      try {
        const userId = auth.currentUser.uid;
        const snap = await getDoc(doc(db, 'users', userId, 'profile', 'data'));
        if (snap.exists()) setProfile(snap.data());

        const q = query(
          collection(db, 'users', userId, 'weightHistory'),
          orderBy('loggedAt', 'asc')
        );
        const hSnap = await getDocs(q);
        const entries = hSnap.docs.map(d => d.data());
        setHistory(entries);
      } catch (e) {
        console.log(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const recalculate = useCallback((currentW, prof) => {
    const age = prof.age;
    const h = prof.height;
    const bmr = prof.gender === 'Male'
      ? Math.round(10 * currentW + 6.25 * h - 5 * age + 5)
      : Math.round(10 * currentW + 6.25 * h - 5 * age - 161);

    // Use sedentary TDEE — workouts are separate
    const newTdee = Math.round(bmr * 1.2);

    const remainingKg = Math.max(0, currentW - prof.goalWeight);

    // ── Strict calendar deadline ──
    // Use targetEndDate if available; fallback: createdAt + targetWeeks
    let endDate;
    if (prof.targetEndDate) {
      endDate = new Date(prof.targetEndDate);
    } else if (prof.createdAt && prof.targetWeeks) {
      endDate = new Date(new Date(prof.createdAt).getTime() + prof.targetWeeks * 7 * 86400000);
    } else {
      // absolute fallback — use targetWeeks as raw days
      endDate = new Date(Date.now() + (prof.targetWeeks || 1) * 7 * 86400000);
    }
    const now = new Date();
    const daysLeft = Math.max(1, Math.ceil((endDate - now) / 86400000));
    const weeksLeft = Math.floor(daysLeft / 7);
    const daysRemainder = daysLeft % 7;
    const timeLeftLabel = `${weeksLeft}w ${daysRemainder}d`;

    let newDeficit = remainingKg > 0
      ? Math.round((remainingKg * 7700) / daysLeft)
      : 0;

    let warningMsg = null;

    if (newDeficit > 750) {
      warningMsg = `heads up — your deficit is ${Math.round(newDeficit)} kcal/day, which is quite aggressive. listen to your body`;
    }
    if (newDeficit < 100 && remainingKg > 0) newDeficit = 100;

    // Workout daily burn
    const workoutBurn = prof.weeklyWorkoutCalories
      ? Math.round(prof.weeklyWorkoutCalories / 7)
      : 0;

    const foodDeficit = Math.max(0, newDeficit - workoutBurn);
    const newDailyCalories = Math.round(newTdee - foodDeficit);

    const startW = prof.weight;
    const goalW = prof.goalWeight;
    const totalToLose = startW - goalW;
    const lostSoFar = startW - currentW;
    const progressPct = totalToLose > 0
      ? Math.max(0, Math.min(100, Math.round((lostSoFar / totalToLose) * 100)))
      : 0;

    // Trend vs previous log
    const lastLog = history.length > 0 ? history[history.length - 1].weight : startW;
    const delta = currentW - lastLog;

    return {
      currentW, bmr, newTdee, newDeficit, newDailyCalories,
      foodDeficit, workoutBurn, daysLeft, weeksLeft, daysRemainder, timeLeftLabel, warningMsg,
      remainingKg: remainingKg.toFixed(1),
      progressPct,
      delta: Math.round(delta * 10) / 10,
      goalW,
    };
  }, [history]);

  // Live recalculation as user types
  useEffect(() => {
    const w = parseFloat(newWeight);
    if (!w || !profile || w <= 0 || w > 300) { setPreview(null); return; }
    setPreview(recalculate(w, profile));
  }, [newWeight, profile, recalculate]);

  const handleSave = async () => {
    const w = parseFloat(newWeight);
    if (!w || w <= 0) return;
    if (!preview) return;
    setSaving(true);
    try {
      const userId = auth.currentUser.uid;

      // Log to history
      await addDoc(collection(db, 'users', userId, 'weightHistory'), {
        weight: w,
        loggedAt: new Date().toISOString(),
        deficit: preview.newDeficit,
        calories: preview.newDailyCalories,
      });

      // Update profile
      let updatedProfile = {
        ...profile,
        currentWeight: w,
        bmr: preview.bmr,
        tdee: preview.newTdee,
        sedentaryTDEE: preview.newTdee,
        dailyDeficit: preview.newDeficit,
        totalDailyDeficit: preview.newDeficit,
        dailyCalorieTarget: preview.newDailyCalories,
        foodDeficit: preview.foodDeficit,
        lastWeightLog: new Date().toISOString(),
      };

      // 1. Auto-sync Deficit Cycling
      if (updatedProfile.deficitCycling && updatedProfile.deficitCycling.active) {
        const fullTdee = preview.newTdee + preview.workoutBurn;
        const newDeficitCal = Math.round(fullTdee - preview.newDeficit);
        updatedProfile.deficitCycling = {
          ...updatedProfile.deficitCycling,
          currentWeight: w,
          bmr: preview.bmr,
          sedentaryTDEE: preview.newTdee,
          tdee: fullTdee,
          dailyWkBurn: preview.workoutBurn,
          deficit: preview.newDeficit,
          deficitCalories: newDeficitCal,
          maintCalories: Math.round(fullTdee)
        };
        // Re-establish correct dailyCalorieTarget override based on current cycle phase
        const start = new Date(updatedProfile.deficitCycling.startedAt);
        const now = new Date();
        const cycleLen = updatedProfile.deficitCycling.deficitWeeks + updatedProfile.deficitCycling.maintWeeks;
        const currentWeek = Math.ceil(Math.max(1, Math.ceil((now - start) / 86400000)) / 7);
        const isDeficitPhase = ((currentWeek - 1) % cycleLen) < updatedProfile.deficitCycling.deficitWeeks;
        updatedProfile.dailyCalorieTarget = isDeficitPhase ? newDeficitCal : Math.round(fullTdee);
      }

      // 2. Auto-sync Thermic Engine
      if (updatedProfile.thermicEngine && updatedProfile.thermicEngine.active) {
        const te = updatedProfile.thermicEngine;
        const ds = preview.newDailyCalories; // new calculated diet target
        updatedProfile.thermicEngine = {
          ...te,
          currentWeight: w,
          bmr: preview.bmr,
          sedentaryTDEE: preview.newTdee,
          dailyWorkoutBurn: preview.workoutBurn,
          fullTDEE: preview.newTdee + preview.workoutBurn,
          dailyDeficit: preview.newDeficit,
          foodDeficit: preview.foodDeficit,
          dailyCalories: ds,
          proteinG: Math.round((ds * te.proteinPct / 100) / 4),
          carbsG: Math.round((ds * te.carbsPct / 100) / 4),
          fatG: Math.round((ds * te.fatPct / 100) / 9),
        };
        updatedProfile.dailyCalorieTarget = ds;
      }

      // 3. Auto-sync Load Management
      if (updatedProfile.loadManagement && updatedProfile.loadManagement.active) {
        updatedProfile.loadManagement = {
          ...updatedProfile.loadManagement,
          currentWeight: w,
          bmr: preview.bmr,
          sedentaryTDEE: preview.newTdee,
          tdee: preview.newTdee + preview.workoutBurn,
          dailyWkBurn: preview.workoutBurn,
        };
        // Load management targets BMR
        updatedProfile.dailyCalorieTarget = preview.bmr;
      }

      await setDoc(doc(db, 'users', userId, 'profile', 'data'), updatedProfile);
      setProfile(updatedProfile);

      setSavedPlan(preview);
      setSaved(true);
      setNewWeight('');

      // Check if goal weight achieved
      const goalW = profile?.goalWeight ?? 0;
      if (goalW > 0 && w <= goalW) {
        setGoalAchieved(true);
      }

      Animated.parallel([
        Animated.timing(resultAnim, { toValue: 0, duration: 450, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        Animated.timing(resultOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();

    }  catch (e) {
      console.error("FIREBASE ERROR:", e);
      alert(`Save failed: ${e.message}`); // This will force an alert on your screen
    
    } finally {
      setSaving(false);
    }
  };

  const handleSetNewGoal = async () => {
    const gw = parseFloat(newGoalW);
    const weeks = parseInt(newGoalWeeks);
    if (!gw || gw <= 0 || gw >= (profile?.currentWeight ?? 999)) {
      alert('new goal must be lower than your current weight'); return;
    }
    if (!weeks || weeks < 1) { alert('enter valid number of weeks'); return; }
    setSaving(true);
    try {
      const userId = auth.currentUser.uid;
      const w = profile.currentWeight;
      const remainKg = w - gw;
      const daysLeft = weeks * 7;
      const deficit = Math.round((remainKg * 7700) / daysLeft);
      const bmr = profile.bmr;
      const tdee = profile.sedentaryTDEE || Math.round(bmr * 1.2);
      const workoutBurn = profile.weeklyWorkoutCalories ? Math.round(profile.weeklyWorkoutCalories / 7) : 0;
      const foodDeficit = Math.max(0, deficit - workoutBurn);
      const dailyCal = Math.round(tdee - foodDeficit);
      const newEndDate = new Date(Date.now() + daysLeft * 86400000);
      await setDoc(doc(db, 'users', userId, 'profile', 'data'), {
        ...profile,
        weight: w,
        goalWeight: gw,
        targetWeeks: weeks,
        targetEndDate: newEndDate.toISOString(),
        dailyDeficit: deficit,
        totalDailyDeficit: deficit,
        foodDeficit,
        dailyCalorieTarget: dailyCal,
      });
      router.replace('/(tabs)');
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleMaintain = async () => {
    setSaving(true);
    try {
      const userId = auth.currentUser.uid;
      const w = profile.currentWeight;
      const tdee = profile.sedentaryTDEE || Math.round(profile.bmr * 1.2);
      await setDoc(doc(db, 'users', userId, 'profile', 'data'), {
        ...profile,
        goalWeight: w,
        dailyDeficit: 0,
        totalDailyDeficit: 0,
        foodDeficit: 0,
        dailyCalorieTarget: tdee,
        targetWeeks: 0,
        maintaining: true,
      });
      router.replace('/(tabs)');
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
        <Image source={require('../assets/images/quasar.png')} style={{ width: 240, height: 240 }} resizeMode="contain" />
        <ActivityIndicator size="large" color="#ff4030" style={{ marginTop: 40 }} />
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 20, fontSize: 13 }}>loading your stats…</Text>
      </View>
    );
  }

  const currentDisplayW = profile?.currentWeight || profile?.weight || 0;
  const startW = profile?.weight || 0;
  const goalW = profile?.goalWeight || 0;
  const todayKey = getLocalDateKey();
  const cheatCompensationState = getCheatCompensationState(profile?.cheatCompensation, todayKey);
  const todayTarget = getEffectiveCalorieTarget(
    profile?.dailyCalorieTarget || 0,
    profile?.cheatCompensation,
    todayKey
  );
  const previewCompensationDateKey = cheatCompensationState.isActive
    ? todayKey
    : cheatCompensationState.compensation?.startDateKey || todayKey;
  const previewEffectiveTarget = preview
    ? getEffectiveCalorieTarget(
      preview.newDailyCalories,
      profile?.cheatCompensation,
      previewCompensationDateKey
    )
    : 0;
  const savedEffectiveTarget = savedPlan
    ? getEffectiveCalorieTarget(
      savedPlan.newDailyCalories,
      profile?.cheatCompensation,
      previewCompensationDateKey
    )
    : 0;
  const totalToLose = startW - goalW;
  const lostSoFar = startW - currentDisplayW;
  const progressPct = totalToLose > 0
    ? Math.max(0, Math.min(100, Math.round((lostSoFar / totalToLose) * 100)))
    : 0;

  const chartHistory = history.length > 0
    ? [{ weight: startW, loggedAt: profile?.createdAt }, ...history]
    : [];

  return (
    <LinearGradient colors={['#000000', '#050101', '#0a0202']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Weight Log</Text>
            <Text style={styles.headerSub}>log anytime · plan auto-adjusts</Text>
          </View>
          <View style={styles.headerBadge}>
            <MaterialCommunityIcons name="scale-bathroom" size={18} color="#ff4030" />
          </View>
        </View>

        {/* ── Current weight hero ── */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={['rgba(255,60,30,0.18)', 'rgba(255,60,30,0.04)']}
            style={styles.heroGradient}
          >
            <View style={styles.heroRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>STARTED</Text>
                <Text style={styles.heroStatVal}>{startW}<Text style={styles.heroUnit}> kg</Text></Text>
              </View>
              <View style={styles.heroCenterBlock}>
                <Text style={styles.heroCenterLabel}>CURRENT</Text>
                <AnimatedWeight value={currentDisplayW} />
                <Text style={styles.heroUnit2}>kg</Text>
                {lostSoFar > 0 && (
                  <View style={styles.lostBadge}>
                    <MaterialCommunityIcons name="trending-down" size={12} color="#27ae60" />
                    <Text style={styles.lostBadgeText}> −{lostSoFar.toFixed(1)} kg</Text>
                  </View>
                )}
                {lostSoFar < 0 && (
                  <View style={[styles.lostBadge, { backgroundColor: 'rgba(231,76,60,0.15)' }]}>
                    <MaterialCommunityIcons name="trending-up" size={12} color="#ff4030" />
                    <Text style={[styles.lostBadgeText, { color: '#ff4030' }]}> +{Math.abs(lostSoFar).toFixed(1)} kg</Text>
                  </View>
                )}
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>GOAL</Text>
                <Text style={[styles.heroStatVal, { color: '#27ae60' }]}>{goalW}<Text style={styles.heroUnit}> kg</Text></Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={styles.progressSection}>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                {progressPct > 0 && progressPct < 100 && (
                  <View style={[styles.progressThumb, { left: `${progressPct}%` }]} />
                )}
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressLabelTxt}>{startW} kg</Text>
                <Text style={styles.progressPct}>{progressPct}% done</Text>
                <Text style={styles.progressLabelTxt}>{goalW} kg</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── Weight chart ── */}
        {chartHistory.length >= 2 && (
          <View style={styles.chartCard}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="chart-line-variant" size={16} color="#ff4030" />
              <Text style={styles.sectionTitle}> Weight History</Text>
            </View>
            <View style={{ marginTop: 12 }}>
              <WeightChart history={chartHistory} goalWeight={goalW} />
            </View>
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#ff4030' }]} />
                <Text style={styles.legendTxt}>actual weight</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#27ae60' }]} />
                <Text style={styles.legendTxt}>goal</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Current plan ── */}
        <View style={styles.planCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="lightning-bolt" size={16} color="#f39c12" />
            <Text style={styles.sectionTitle}> Current Plan</Text>
          </View>
          {cheatCompensationState.isBlocked && (
            <View style={styles.planNote}>
              <Text style={styles.planNoteText}>
                {cheatCompensationState.isCheatDay
                  ? `Cheat day live: today runs ${todayTarget} kcal, then recovery starts tomorrow.`
                  : cheatCompensationState.isActive
                    ? `Recovery live: today's target is ${todayTarget} kcal instead of ${profile?.dailyCalorieTarget ?? '--'}.`
                    : `Recovery starts tomorrow and will trim the next ${cheatCompensationState.compensation?.compensationDays ?? 0} days.`}
              </Text>
            </View>
          )}
          <View style={styles.planGrid}>
            <View style={styles.planCell}>
              <Text style={styles.planCellVal}>{profile?.dailyCalorieTarget ?? '—'}</Text>
              <Text style={styles.planCellLabel}>kcal / day</Text>
            </View>
            <View style={styles.planCellDivider} />
            <View style={styles.planCell}>
              <Text style={[styles.planCellVal, { color: '#2980b9' }]}>{profile?.dailyDeficit ?? profile?.totalDailyDeficit ?? '—'}</Text>
              <Text style={styles.planCellLabel}>deficit</Text>
            </View>
            <View style={styles.planCellDivider} />
            <View style={styles.planCell}>
              <Text style={[styles.planCellVal, { color: '#27ae60' }]}>{getTimeLeft(profile).label}</Text>
              <Text style={styles.planCellLabel}>time left</Text>
            </View>
          </View>
        </View>

        {/* ── Log new weight ── */}
        {!saved && (
          <View style={styles.inputCard}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="pencil-plus" size={16} color="#ff4030" />
              <Text style={styles.sectionTitle}> Log Today&apos;s Weight</Text>
            </View>
            <Text style={styles.inputHint}>first thing in the morning for best accuracy</Text>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.weightInput}
                placeholder={`${currentDisplayW}`}
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={newWeight}
                onChangeText={setNewWeight}
                keyboardType="decimal-pad"
              />
              <Text style={styles.inputUnit}>kg</Text>
            </View>

            {/* ── Live preview ── */}
            {preview && (
              <View style={styles.previewBox}>
                {/* Delta badge */}
                <View style={styles.previewDeltaRow}>
                  {preview.delta !== 0 && (
                    <View style={[
                      styles.deltaBadge,
                      { backgroundColor: preview.delta < 0 ? 'rgba(39,174,96,0.15)' : 'rgba(231,76,60,0.15)' }
                    ]}>
                      <MaterialCommunityIcons
                        name={preview.delta < 0 ? 'trending-down' : 'trending-up'}
                        size={14}
                        color={preview.delta < 0 ? '#27ae60' : '#ff4030'}
                      />
                      <Text style={[styles.deltaTxt, { color: preview.delta < 0 ? '#27ae60' : '#ff4030' }]}>
                        {' '}{preview.delta > 0 ? '+' : ''}{preview.delta} kg since last log
                      </Text>
                    </View>
                  )}
                  <Text style={styles.previewTitle}>plan will update to:</Text>
                </View>

                <View style={styles.previewGrid}>
                  <View style={styles.previewCell}>
                    <MaterialCommunityIcons name="fire" size={18} color="#ff4030" />
                    <Text style={styles.previewVal}>{preview.newDailyCalories}</Text>
                    <Text style={styles.previewLabel}>kcal/day</Text>
                  </View>
                  <View style={styles.previewCell}>
                    <MaterialCommunityIcons name="trending-down" size={18} color="#2980b9" />
                    <Text style={styles.previewVal}>{preview.newDeficit}</Text>
                    <Text style={styles.previewLabel}>deficit</Text>
                  </View>
                  <View style={styles.previewCell}>
                    <MaterialCommunityIcons name="calendar-check" size={18} color="#27ae60" />
                    <Text style={styles.previewVal}>{preview.cappedWeeks}</Text>
                    <Text style={styles.previewLabel}>wks left</Text>
                  </View>
                  <View style={styles.previewCell}>
                    <MaterialCommunityIcons name="weight-kilogram" size={18} color="#8e44ad" />
                    <Text style={styles.previewVal}>{preview.remainingKg}</Text>
                    <Text style={styles.previewLabel}>kg to go</Text>
                  </View>
                </View>

                {cheatCompensationState.isBlocked && (
                  <View style={styles.previewCompensationNote}>
                    <MaterialCommunityIcons name="shield-alert-outline" size={14} color="#ffb4b0" />
                    <Text style={styles.previewCompensationText}>
                      {cheatCompensationState.isCheatDay
                        ? `Cheat day is live, so today's working target after save would be ${getEffectiveCalorieTarget(preview.newDailyCalories, profile?.cheatCompensation, todayKey)} kcal.`
                        : cheatCompensationState.isActive
                          ? `Recovery still trims today, so your live target after save would be ${previewEffectiveTarget} kcal.`
                          : `Recovery starts tomorrow, so tomorrow's live target after save would be ${previewEffectiveTarget} kcal.`}
                    </Text>
                  </View>
                )}

                {/* Deficit equation */}
                {preview.workoutBurn > 0 && (
                  <View style={styles.equationRow}>
                    <Text style={styles.eqPart}>{preview.newDeficit} deficit</Text>
                    <Text style={styles.eqOp}>−</Text>
                    <Text style={[styles.eqPart, { color: '#e67e22' }]}>{preview.workoutBurn} workout burn</Text>
                    <Text style={styles.eqOp}>=</Text>
                    <Text style={[styles.eqPart, { color: '#ff4030', fontWeight: '800' }]}>{preview.foodDeficit} food cut</Text>
                  </View>
                )}

                {/* Progress change */}
                <View style={styles.progressPreviewRow}>
                  <View style={styles.progressPreviewTrack}>
                    <View style={[styles.progressPreviewFill, { width: `${preview.progressPct}%` }]} />
                  </View>
                  <Text style={styles.progressPreviewPct}>{preview.progressPct}%</Text>
                </View>

                {preview.warningMsg && (
                  <View style={styles.warningRow}>
                    <MaterialCommunityIcons name="alert" size={14} color="#f39c12" />
                    <Text style={styles.warningTxt}> {preview.warningMsg}</Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, (!preview || saving) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!preview || saving}
            >
              <LinearGradient
                colors={preview ? ['#ff4030', '#cc2020'] : ['#444', '#333']}
                style={styles.saveBtnGradient}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <MaterialCommunityIcons name="check-bold" size={18} color="#fff" />
                }
                <Text style={styles.saveBtnText}>
                  {saving ? 'saving…' : 'log this weight'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Success state ── */}
        {saved && savedPlan && (
          <Animated.View style={[styles.successCard, {
            opacity: resultOpacity,
            transform: [{ translateY: resultAnim }],
          }]}>
            <View style={styles.successIconRow}>
              <LinearGradient colors={goalAchieved ? ['#F59E0B', '#D97706'] : ['#27ae60', '#1e8449']} style={styles.successIconCircle}>
                <MaterialCommunityIcons name={goalAchieved ? 'trophy' : 'check-bold'} size={28} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.successTitle}>{goalAchieved ? 'goal weight reached!' : 'weight logged!'}</Text>
            <Text style={styles.successSub}>
              {goalAchieved
                ? `you've hit ${profile?.goalWeight} kg — incredible. now decide your next move.`
                : 'your plan has been recalibrated based on your progress'}
            </Text>

            <View style={styles.successGrid}>
              <View style={styles.successCell}>
                <Text style={styles.successVal}>{savedPlan.newDailyCalories}</Text>
                <Text style={styles.successLabel}>new daily kcal</Text>
              </View>
              <View style={styles.successCellDivider} />
              <View style={styles.successCell}>
                <Text style={[styles.successVal, { color: '#2980b9' }]}>{savedPlan.newDeficit}</Text>
                <Text style={styles.successLabel}>new deficit</Text>
              </View>
              <View style={styles.successCellDivider} />
              <View style={styles.successCell}>
                <Text style={[styles.successVal, { color: '#27ae60' }]}>{savedPlan.cappedWeeks}</Text>
                <Text style={styles.successLabel}>wks left</Text>
              </View>
            </View>

            {cheatCompensationState.isBlocked && (
              <View style={styles.previewCompensationNote}>
                <MaterialCommunityIcons name="shield-alert-outline" size={14} color="#ffb4b0" />
                <Text style={styles.previewCompensationText}>
                  {cheatCompensationState.isCheatDay
                    ? `Cheat day is live, so today's working target now sits at ${getEffectiveCalorieTarget(savedPlan.newDailyCalories, profile?.cheatCompensation, todayKey)} kcal.`
                    : cheatCompensationState.isActive
                      ? `Recovery still trims today, so your live target now sits at ${savedEffectiveTarget} kcal.`
                      : `Recovery starts tomorrow, so tomorrow's live target will land at ${savedEffectiveTarget} kcal.`}
                </Text>
              </View>
            )}

            <View style={styles.successProgressBar}>
              <View style={[styles.successProgressFill, { width: `${savedPlan.progressPct}%` }]} />
            </View>
            <Text style={styles.successProgressLabel}>{savedPlan.progressPct}% of the way to your goal</Text>

            {goalAchieved ? (
              <>
                {/* Goal achieved — choose next step */}
                {!goalChoice && (
                  <View style={styles.goalChoiceWrap}>
                    <TouchableOpacity
                      style={styles.goalChoiceBtn}
                      onPress={() => setGoalChoice('new')}
                    >
                      <MaterialCommunityIcons name="target" size={22} color="#ff4030" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.goalChoiceTitle}>set a new goal</Text>
                        <Text style={styles.goalChoiceSub}>keep going — pick a new target weight and timeline</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color="rgba(255,255,255,0.3)" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.goalChoiceBtn}
                      onPress={() => setGoalChoice('maintain')}
                    >
                      <MaterialCommunityIcons name="scale-balance" size={22} color="#27ae60" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.goalChoiceTitle}>maintain this weight</Text>
                        <Text style={styles.goalChoiceSub}>eat at maintenance — no deficit, no matador cycling</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color="rgba(255,255,255,0.3)" />
                    </TouchableOpacity>
                  </View>
                )}

                {goalChoice === 'new' && (
                  <View style={styles.goalFormWrap}>
                    <Text style={styles.goalFormLabel}>new goal weight (kg)</Text>
                    <TextInput
                      style={styles.goalFormInput}
                      value={newGoalW}
                      onChangeText={setNewGoalW}
                      keyboardType="decimal-pad"
                      placeholder={`less than ${profile?.currentWeight}`}
                      placeholderTextColor="rgba(255,255,255,0.25)"
                    />
                    <Text style={[styles.goalFormLabel, { marginTop: 12 }]}>target weeks</Text>
                    <TextInput
                      style={styles.goalFormInput}
                      value={newGoalWeeks}
                      onChangeText={setNewGoalWeeks}
                      keyboardType="number-pad"
                      placeholder="e.g. 12"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                    />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                      <TouchableOpacity style={styles.logAnotherBtn} onPress={() => setGoalChoice(null)}>
                        <Text style={styles.logAnotherTxt}>back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.dashBtn} onPress={handleSetNewGoal} disabled={saving}>
                        <LinearGradient colors={['#ff4030', '#cc2020']} style={styles.dashBtnGradient}>
                          <Text style={styles.dashBtnTxt}>{saving ? 'saving…' : 'start new journey'}</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {goalChoice === 'maintain' && (
                  <View style={styles.goalFormWrap}>
                    <View style={styles.maintainNote}>
                      <MaterialCommunityIcons name="information-outline" size={16} color="#F59E0B" />
                      <Text style={styles.maintainNoteText}>
                        your daily target will be set to maintenance calories (zero deficit). deficit cycling / matador will not be available while maintaining.
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                      <TouchableOpacity style={styles.logAnotherBtn} onPress={() => setGoalChoice(null)}>
                        <Text style={styles.logAnotherTxt}>back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.dashBtn} onPress={handleMaintain} disabled={saving}>
                        <LinearGradient colors={['#16A34A', '#065F46']} style={styles.dashBtnGradient}>
                          <Text style={styles.dashBtnTxt}>{saving ? 'saving…' : 'start maintaining'}</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.successBtns}>
                <TouchableOpacity style={styles.logAnotherBtn} onPress={() => {
                  setSaved(false); setSavedPlan(null); setGoalAchieved(false);
                  resultAnim.setValue(40); resultOpacity.setValue(0);
                }}>
                  <Text style={styles.logAnotherTxt}>log another</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dashBtn} onPress={() => router.replace('/(tabs)')}>
                  <LinearGradient colors={['#ff4030', '#cc2020']} style={styles.dashBtnGradient}>
                    <Text style={styles.dashBtnTxt}>dashboard →</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        )}

        {/* ── History list ── */}
        {history.length > 0 && (
          <View style={styles.historyCard}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="history" size={16} color="#8e44ad" />
              <Text style={styles.sectionTitle}> Log History</Text>
            </View>
            {[...history].reverse().slice(0, 10).map((entry, i) => {
              const date = new Date(entry.loggedAt);
              const label = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
              const prev = history[history.length - 1 - i - 1];
              const delta = prev ? Math.round((entry.weight - prev.weight) * 10) / 10 : null;
              return (
                <View key={i} style={[styles.historyRow, i === 0 && styles.historyRowFirst]}>
                  <View style={styles.historyDot} />
                  <Text style={styles.historyDate}>{label}</Text>
                  <Text style={styles.historyWeight}>{entry.weight} kg</Text>
                  {delta !== null && (
                    <Text style={[styles.historyDelta, { color: delta <= 0 ? '#27ae60' : '#ff4030' }]}>
                      {delta > 0 ? '+' : ''}{delta} kg
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 48 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  headerBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,60,30,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,60,30,0.3)' },

  // Hero card
  heroCard: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,60,30,0.2)', marginBottom: 14 },
  heroGradient: { padding: 20 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heroStat: { alignItems: 'center', flex: 1 },
  heroStatLabel: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontWeight: '700' },
  heroStatVal: { fontSize: 26, fontWeight: '800', color: '#fff' },
  heroUnit: { fontSize: 13, fontWeight: '400', color: 'rgba(255,255,255,0.5)' },
  heroCenterBlock: { alignItems: 'center', flex: 1.4 },
  heroCenterLabel: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(255,255,255,0.35)', marginBottom: 4, fontWeight: '700' },
  bigWeight: { fontSize: 52, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  heroUnit2: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: -4 },
  lostBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(39,174,96,0.15)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, borderWidth: 1, borderColor: 'rgba(39,174,96,0.25)' },
  lostBadgeText: { fontSize: 11, fontWeight: '700', color: '#27ae60' },

  // Progress
  progressSection: { gap: 8 },
  progressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'visible', position: 'relative' },
  progressFill: { height: '100%', backgroundColor: '#ff4030', borderRadius: 3 },
  progressThumb: { position: 'absolute', top: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', borderWidth: 2.5, borderColor: '#ff4030', marginLeft: -8 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabelTxt: { fontSize: 10, color: 'rgba(255,255,255,0.35)' },
  progressPct: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },

  // Chart card
  chartCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.3 },
  chartLegend: { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendTxt: { fontSize: 10, color: 'rgba(255,255,255,0.35)' },

  // Plan card
  planCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  planNote: { marginTop: 12, marginBottom: 2, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  planNoteText: { fontSize: 11, lineHeight: 17, color: 'rgba(255,255,255,0.62)' },
  planGrid: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  planCell: { flex: 1, alignItems: 'center' },
  planCellVal: { fontSize: 24, fontWeight: '800', color: '#fff' },
  planCellLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, letterSpacing: 0.5 },
  planCellDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.08)' },

  // Input card
  inputCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 24, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,60,30,0.25)' },
  inputHint: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8, marginBottom: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  weightInput: {
    flex: 1, height: 72, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,60,30,0.4)',
    fontSize: 36, fontWeight: '900', color: '#fff', textAlign: 'center',
    letterSpacing: -0.5,
  },
  inputUnit: { fontSize: 20, fontWeight: '700', color: 'rgba(255,255,255,0.35)' },

  // Preview box
  previewBox: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 16, padding: 14, marginTop: 14, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  previewDeltaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 },
  deltaBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  deltaTxt: { fontSize: 11, fontWeight: '700' },
  previewTitle: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  previewGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  previewCell: { alignItems: 'center', flex: 1, gap: 4 },
  previewVal: { fontSize: 18, fontWeight: '800', color: '#fff' },
  previewLabel: { fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5 },
  equationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  eqPart: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  eqOp: { fontSize: 13, color: 'rgba(255,255,255,0.25)', fontWeight: '700' },
  progressPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressPreviewTrack: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' },
  progressPreviewFill: { height: '100%', backgroundColor: '#ff4030', borderRadius: 2 },
  progressPreviewPct: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', minWidth: 32, textAlign: 'right' },
  previewCompensationNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10, padding: 10, borderRadius: 12, backgroundColor: 'rgba(231,76,60,0.1)', borderWidth: 1, borderColor: 'rgba(231,76,60,0.15)' },
  previewCompensationText: { flex: 1, fontSize: 11, lineHeight: 17, color: '#ffd3cf' },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, backgroundColor: 'rgba(243,156,18,0.1)', borderRadius: 8, padding: 8 },
  warningTxt: { fontSize: 11, color: '#f39c12', flex: 1, lineHeight: 16 },

  // Save button
  saveBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 14 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  // Success card
  successCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 24, padding: 24, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(39,174,96,0.25)' },
  successIconRow: { alignItems: 'center', marginBottom: 14 },
  successIconCircle: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  successTitle: { fontSize: 22, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 6 },
  successSub: { fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  successGrid: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  successCell: { flex: 1, alignItems: 'center' },
  successVal: { fontSize: 26, fontWeight: '900', color: '#fff' },
  successLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, letterSpacing: 0.4 },
  successCellDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.08)' },
  successProgressBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  successProgressFill: { height: '100%', backgroundColor: '#27ae60', borderRadius: 3 },
  successProgressLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 20 },
  successBtns: { flexDirection: 'row', gap: 10 },
  logAnotherBtn: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  logAnotherTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '700' },
  dashBtn: { flex: 1.5, borderRadius: 14, overflow: 'hidden' },
  dashBtnGradient: { paddingVertical: 14, alignItems: 'center' },
  dashBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // History card
  historyCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', gap: 10 },
  historyRowFirst: { borderBottomWidth: 0 },
  historyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(192,57,43,0.5)' },
  historyDate: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.45)' },
  historyWeight: { fontSize: 15, fontWeight: '800', color: '#fff' },
  historyDelta: { fontSize: 12, fontWeight: '700', minWidth: 52, textAlign: 'right' },

  // Goal achieved
  goalChoiceWrap: { gap: 10, marginTop: 16 },
  goalChoiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  goalChoiceTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  goalChoiceSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 16 },
  goalFormWrap: { marginTop: 16 },
  goalFormLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.5)', marginBottom: 6 },
  goalFormInput: {
    height: 50, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center',
  },
  maintainNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
  },
  maintainNoteText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 18 },
});
