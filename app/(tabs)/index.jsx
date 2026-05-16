import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, getDoc, collection, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebaseConfig';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import { getLocalDateKey } from '../../utils/date';
import {
  DietaryAdherenceClassifier,
  getContextKey,
  getRandomContextMessage,
} from '../../utils/naiveBayes';
import {
  PROTEIN_BADGES,
  getProteinGoal,
  getBadgeForScore,
  getNextBadge,
  processDailyStreak,
  getDefaultStreak,
} from '../../utils/proteinStreak';
import {
  writeNBRow,
  getTodayNBRow,
  getAllNBRows,
  backfillYesterdayIfMissing,
  deriveIsDeficitPhase,
  deriveIsHighStress,
} from '../../utils/nbTraining';
import { markNBAnswered, isNBAnsweredToday } from '../../utils/nbAnswered';
import { buildNBCheckInPrompt } from '../../utils/nbCheckInPrompt';
import {
  buildCheatCompensation,
  buildCompensationSchedule,
  formatDateKey,
  getCheatCompensationState,
  getCompensationReductionRange,
  getEffectiveCalorieTarget,
} from '../../utils/cheatCompensation';
import WorkoutEditor from '../../components/WorkoutEditor';
import { recalcProfileWithActivities } from '../../utils/recalcWorkout';
import { getTimeLeft } from '../../utils/timeLeft';
import AppAlertDialog from '../../components/ui/AppAlertDialog';
import useAppDialog from '../../hooks/useAppDialog';

const GREETINGS = [
  {
    title: 'yooo {name}, we so back',
    subtitle: 'lowkey proud of you for showing up again today',
  },
  {
    title: '{name}, this is giving discipline',
    subtitle: 'tiny wins today are gonna look elite later, no cap',
  },
  {
    title: 'bestie {name}, you are cooking',
    subtitle: 'just stay chill, track the basics, and let the plan do its thing',
  },
  {
    title: '{name}, main character arc is active',
    subtitle: 'we are not chasing perfect, we are stacking clean little wins',
  },
  {
    title: 'locked in, {name}',
    subtitle: 'your consistency is kinda iconic right now',
  },
  {
    title: '{name}, you are built different fr',
    subtitle: 'keep the streak alive and let today count',
  },
  {
    title: 'okayyy {name}, let’s get this',
    subtitle: 'one solid day can carry the whole vibe of the week',
  },
  {
    title: '{name}, we farming progress today',
    subtitle: 'nothing dramatic, just clean choices and good momentum',
  },
  {
    title: 'yo {name}, you the real quasar. you get it?',
    subtitle: 'shining bright and devouring goals today',
  },
  {
    title: 'entering the quasar orbit, {name}',
    subtitle: 'time to bend reality and crush those macros',
  },
  {
    title: 'we are in the quasar era, {name}',
    subtitle: 'unmatched gravity, pulling in all the wins today',
  },
  {
    title: 'yo {name}, quasar energy only today',
    subtitle: 'stay locked in, the glow up is real',
  },
];

const LOGOUT_QUOTES = [
  {
    title: 'Exiting the Quasar orbit?',
    subtitle: 'The dashboard will still be here when you come back locked in.',
    quote: 'Consistency still counts, even when today ends early.',
  },
  {
    title: 'Taking five from the grind?',
    subtitle: 'Small reset, then straight back to stacking clean days.',
    quote: 'A pause is not a setback. It is just space before the next rep.',
  },
  {
    title: 'Logging out of the Quasar?',
    subtitle: 'Consistency loves a comeback story. We will pick it up right here.',
    quote: 'Discipline gets louder when you keep coming back.',
  },
  {
    title: 'Ending the session?',
    subtitle: 'No stress. Your plan is saved and ready for the next round.',
    quote: 'Momentum is built by returns, not by never resting.',
  },
];

const CHEAT_BLOCK_QUOTES = [
  {
    title: 'Recovery plan still in motion',
    subtitle: 'One chaos coupon at a time. Let this one finish its work first.',
    quote: "alright dawg, finish the current compensation first before we run it back",
  },
  {
    title: 'Current cheat is already accounted for',
    subtitle: 'The app is trimming the next few days for you. Let that cycle land clean.',
    quote: 'stack the recovery first, then earn the next plot twist',
  },
  {
    title: 'Easy there, menace',
    subtitle: 'You already have a recovery block active. Close this loop before starting another one.',
    quote: 'discipline looks coolest when you finish what you already queued',
  },
];

const MAX_COMPENSATION_DAYS = 14;

const PERSPECTIVE_CHECKS = [
  { icon: 'pizza', text: "a slice of pizza is about 250 kcal. that's roughly 10% of your daily budget. you can eat it and still drop weight. relax." },
  { icon: 'rice', text: "carbs at night do not magically turn to fat. total daily intake is what matters. eat the rice, seriously." },
  { icon: 'scale-bathroom', text: "gaining 1 kg overnight is water weight and sodium, not fat. it takes 7,700 excess calories to store 1 kg of actual fat. you're fine." },
  { icon: 'cookie', text: "one cookie is about 150 kcal. that's a 15-minute walk. eating one doesn't undo a week of progress. perspective." },
  { icon: 'food-croissant', text: "a paratha with butter is ~300 kcal. that's not a disaster — it's literally just breakfast. plan around it." },
  { icon: 'cup', text: "your chai with sugar is about 80 kcal. four cups a day is 320 kcal. that's real — but it's also completely manageable." },
  { icon: 'ice-cream', text: "one scoop of ice cream is ~200 kcal. you can fit that into literally any calorie budget. stop punishing yourself." },
  { icon: 'fire', text: "your body burns 60-75% of calories just by existing — breathing, thinking, keeping organs running. you earn most of your food budget by being alive." },
  { icon: 'weight-lifter', text: "muscle weighs more than fat by volume. if the scale isn't moving but your clothes fit better, you're winning." },
  { icon: 'water', text: "drinking 500ml of water before meals can reduce intake by 75-90 kcal per meal. free calorie hack, zero effort." },
  { icon: 'food-apple', text: "fruit sugar is not the same as added sugar. an apple has fiber, water, and vitamins. eat the fruit." },
  { icon: 'sleep', text: "sleeping 7-8 hours can reduce next-day hunger by up to 24%. your best weight loss tool might be your pillow." },
  { icon: 'walk', text: "a 30-minute walk burns about 150 kcal. that's enough to wipe out a small snack. movement doesn't have to be extreme." },
  { icon: 'food-drumstick', text: "100g of chicken breast is just 165 kcal and 31g protein. it's the most efficient protein source you can eat." },
  { icon: 'egg', text: "two whole eggs are 155 kcal and 13g protein. the yolk has most of the nutrients. stop throwing it away." },
  { icon: 'noodles', text: "a plate of maggi is about 420 kcal. not ideal daily, but once in a while? your deficit can handle it." },
  { icon: 'heart-pulse', text: "a 500 kcal deficit means losing ~0.5 kg/week. that's 26 kg in a year. slow doesn't mean not working." },
  { icon: 'emoticon-happy', text: "one cheat meal in a week of clean eating is 1 out of 21 meals. that's 95% compliance. you're doing amazing." },
  { icon: 'beer', text: "a pint of beer is about 200 kcal. one drink at a social event won't break your plan. just account for it." },
  { icon: 'food', text: "a samosa is about 250 kcal. that's not 'ruining your diet' — that's lunch math. make it fit." },
  { icon: 'chart-line', text: "weight loss is never linear. you'll have weeks where the scale doesn't move, then suddenly drops 1.5 kg. trust the process." },
  { icon: 'dumbbell', text: "you don't need to 'earn' food through exercise. you need food to live. exercise is a bonus, not a punishment." },
  { icon: 'stomach', text: "feeling hungry for 20 minutes doesn't mean you're starving. it means ghrelin spiked. it passes. drink water and wait." },
  { icon: 'brain', text: "your brain uses 20% of your daily calories. eating enough isn't laziness — it's keeping your brain running." },
  { icon: 'leaf', text: "a salad isn't automatically healthy and a burger isn't automatically bad. calories and macros are what matter, not food labels." },
  { icon: 'silverware-fork-knife', text: "eating 3 meals vs 6 small meals makes zero difference for weight loss. total daily calories are identical. eat however suits you." },
  { icon: 'coffee', text: "black coffee is 2 kcal per cup and temporarily boosts metabolism by 3-11%. it's basically a free performance enhancer." },
  { icon: 'arm-flex', text: "protein doesn't just build muscle — it keeps you full longer than carbs or fat. front-load protein if hunger is your problem." },
  { icon: 'calendar-check', text: "you don't need a perfect week. 5 out of 7 good days is 71% compliance. that's still enough to lose weight consistently." },
  { icon: 'yoga', text: "stress increases cortisol which increases water retention which increases scale weight. a stressful week ≠ fat gain. breathe." },
];

const PERSPECTIVE_HEADINGS = [
  "it's all good {buddy}",
  "it ain't that deep {buddy}",
  "chill out, you're fine",
  "no panic, just perspective",
  "you're still winning {buddy}",
  "tiny wobble, still elite",
  "breathe, you're not cooked",
  "this is normal human stuff",
  "relax, the plan can handle it",
  "main character, minor plot twist",
];

const getPerspectiveBuddy = (gender) => {
  const normalized = String(gender || '').toLowerCase();
  if (normalized === 'male') return 'bro';
  if (normalized === 'female') return 'sis';
  return 'bestie';
};

const formatPerspectiveHeading = (heading, gender) =>
  heading.replace('{buddy}', getPerspectiveBuddy(gender));

const formatGreeting = (template, name) => template.replace('{name}', name?.split(' ')[0] || 'bestie');

export default function DashboardScreen() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [caloriesConsumed, setCaloriesConsumed] = useState(0);
  const [proteinConsumed, setProteinConsumed] = useState(0);
  const [carbsConsumed, setCarbsConsumed] = useState(0);
  const [fatConsumed, setFatConsumed] = useState(0);
  const [greetingIndex, setGreetingIndex] = useState(() => Math.floor(Math.random() * GREETINGS.length));
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [logoutQuoteIndex, setLogoutQuoteIndex] = useState(() => Math.floor(Math.random() * LOGOUT_QUOTES.length));
  const [loggingOut, setLoggingOut] = useState(false);
  const [cheatVisible, setCheatVisible] = useState(false);
  const [cheatBlockedVisible, setCheatBlockedVisible] = useState(false);
  const [cheatBlockedQuoteIndex, setCheatBlockedQuoteIndex] = useState(() => Math.floor(Math.random() * CHEAT_BLOCK_QUOTES.length));
  const [perspectiveVisible, setPerspectiveVisible] = useState(true);
  const [perspectiveIdx] = useState(() => new Date().getDate() % PERSPECTIVE_CHECKS.length);
  const [cheatCalories, setCheatCalories] = useState('');
  const [cheatDays, setCheatDays] = useState('4');
  const [savingCheatDay, setSavingCheatDay] = useState(false);
  const [adherenceRisk, setAdherenceRisk] = useState(null);
  const [adherenceVisible, setAdherenceVisible] = useState(true);
  const [todayNBAnswered, setTodayNBAnswered] = useState(() => isNBAnsweredToday());
  const [proteinStreak, setProteinStreak] = useState(getDefaultStreak());
  const [badgeModalVisible, setBadgeModalVisible] = useState(false);
  const [workoutSaving, setWorkoutSaving] = useState(false);
  const router = useRouter();
  const { showDialog, dialogProps } = useAppDialog();

  const openLogoutDialog = () => {
    setLogoutQuoteIndex(Math.floor(Math.random() * LOGOUT_QUOTES.length));
    setLogoutVisible(true);
  };

  const closeLogoutDialog = () => {
    if (loggingOut) return;
    setLogoutVisible(false);
  };

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await signOut(auth);
      setLogoutVisible(false);
    } catch (error) {
      console.log('Logout error:', error.message);
    } finally {
      setLoggingOut(false);
    }
  };

  const resetCheatForm = () => {
    setCheatCalories('');
    setCheatDays('4');
  };

  const closeCheatDialog = () => {
    if (savingCheatDay) return;
    setCheatVisible(false);
  };

  const closeCheatBlockedDialog = () => {
    setCheatBlockedVisible(false);
  };

  const handleWorkoutSave = async (newSettings) => {
    if (!profile) return;
    setWorkoutSaving(true);
    try {
      const updates = recalcProfileWithActivities(profile, newSettings);
      const userId = auth.currentUser.uid;
      await updateDoc(doc(db, 'users', userId, 'profile', 'data'), updates);
      setProfile(prev => ({ ...prev, ...updates }));
    } catch (e) { console.log('Workout save error:', e.message); }
    finally { setWorkoutSaving(false); }
  };

  const handleNBAnswer = async (exceeded) => {
    try {
      const userId = auth.currentUser?.uid;
      if (!userId || !profile) return;
      await writeNBRow(userId, getLocalDateKey(), exceeded, 'user_explicit', profile);
      markNBAnswered();
      setTodayNBAnswered(true);
    } catch (e) {
      console.log('NB answer error:', e.message);
    }
  };

  const confirmNBAnswer = (exceeded) => {
    showDialog(buildNBCheckInPrompt(exceeded, () => handleNBAnswer(exceeded)));
  };

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        try {
          setLoading(true);
          setGreetingIndex(Math.floor(Math.random() * GREETINGS.length));
          const userId = auth.currentUser.uid;
          const profileRef = doc(db, 'users', userId, 'profile', 'data');
          const profileSnap = await getDoc(profileRef);

          if (profileSnap.exists()) {
            setProfile(profileSnap.data());
          }

          const today = getLocalDateKey();
          const mealsRef = collection(db, 'users', userId, 'logs', today, 'meals');
          const mealsSnap = await getDocs(mealsRef);

          let totalCal = 0;
          let totalProtein = 0;
          let totalCarbs = 0;
          let totalFat = 0;

          mealsSnap.docs.forEach((mealDoc) => {
            const data = mealDoc.data();
            totalCal += data.calories || 0;
            totalProtein += data.protein || 0;
            totalCarbs += data.carbs || 0;
            totalFat += data.fat || 0;
          });

          setCaloriesConsumed(totalCal);
          setProteinConsumed(Math.round(totalProtein * 10) / 10);
          setCarbsConsumed(Math.round(totalCarbs * 10) / 10);
          setFatConsumed(Math.round(totalFat * 10) / 10);

          // ── Naive Bayes: backfill yesterday → train on full history → predict today ──
          const profileData = profileSnap.data();

          // 1. Write yesterday's row if missing (meal-log-sum fallback)
          await backfillYesterdayIfMissing(userId, profileData);

          // 2. Check if user already explicitly answered today's prompt
          const todayRow = await getTodayNBRow(userId);
          const answered = isNBAnsweredToday() || todayRow?.source === 'user_explicit';
          if (todayRow?.source === 'user_explicit') markNBAnswered();
          setTodayNBAnswered(answered);

          // 3. Train on full history and predict
          const allRows = await getAllNBRows(userId);
          if (allRows.length >= 3) {
            const classifier = new DietaryAdherenceClassifier();
            classifier.train(allRows);

            const todayDow    = new Date().getDay();
            const todayContext = {
              isWeekend:      todayDow === 0 || todayDow === 6,
              isDeficitPhase: deriveIsDeficitPhase(profileData),
              isHighStress:   deriveIsHighStress(profileData),
            };

            const prediction = classifier.predict(todayContext);
            if (prediction?.riskLevel === 'HIGH_RISK') {
              const contextKey = getContextKey(todayContext);
              const message    = getRandomContextMessage(contextKey);
              setAdherenceRisk(message ? { ...prediction, contextKey, message } : null);
            } else {
              setAdherenceRisk(null);
            }
            setAdherenceVisible(true);
          }

          // ── Protein streak: process daily ──
          const rawStreak = profileData?.proteinStreak ?? getDefaultStreak();
          const yesterday2 = new Date(); yesterday2.setDate(yesterday2.getDate() - 1);
          const yesterdayKey2 = getLocalDateKey(yesterday2);
          const { updated, streak: newStreak } = processDailyStreak(
            rawStreak,
            totalProtein,
            profileData,
            getLocalDateKey(),
            yesterdayKey2,
          );
          setProteinStreak(newStreak);
          if (updated) {
            await updateDoc(doc(db, 'users', userId, 'profile', 'data'), {
              proteinStreak: newStreak,
            });
          }
        } catch (error) {
          console.log('Dashboard error:', error.message);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, [])
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
        <Image source={require('../../assets/images/quasar.png')} style={{ width: 240, height: 240 }} resizeMode="contain" />
        <ActivityIndicator size="large" color="#ff4030" style={{ marginTop: 40 }} />
        <Text style={[styles.loadingText, { marginTop: 20 }]}>loading your dashboard...</Text>
      </View>
    );
  }

  const todayKey = getLocalDateKey();
  const baseTarget = profile?.dailyCalorieTarget || 0;
  const cheatCompensationState = getCheatCompensationState(profile?.cheatCompensation, todayKey);
  const cheatCompensation = cheatCompensationState.compensation;
  const cheatSchedule = cheatCompensationState.schedule;
  const cheatRange = getCompensationReductionRange(cheatCompensation);
  const target = getEffectiveCalorieTarget(baseTarget, cheatCompensation, todayKey);
  const todayAllowance = Math.max(0, target - baseTarget);
  const todayReduction = Math.max(0, baseTarget - target);
  const remaining = target - caloriesConsumed;
  const isOverTarget = remaining < 0;
  const remainingAbs = Math.abs(remaining);
  const progress = target > 0 ? Math.min(caloriesConsumed / target, 1) : 0;
  const progressPercent = Math.round(progress * 100);
  const currentDateLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  const greeting = GREETINGS[greetingIndex];
  const logoutQuote = LOGOUT_QUOTES[logoutQuoteIndex];
  const cheatBlockedQuote = CHEAT_BLOCK_QUOTES[cheatBlockedQuoteIndex];
  const compensationWindowLabel = cheatCompensation
    ? `${formatDateKey(cheatCompensation.startDateKey, { day: 'numeric', month: 'short' })} - ${formatDateKey(cheatCompensation.endDateKey, { day: 'numeric', month: 'short' })}`
    : '';
  const compensationPreviewSchedule = cheatCompensationState.isBlocked
    ? cheatSchedule.slice(
      cheatCompensationState.completedDays,
      cheatCompensationState.completedDays + 4
    )
    : [];
  const hiddenCompensationDays = Math.max(
    0,
    cheatSchedule.length - (cheatCompensationState.completedDays + compensationPreviewSchedule.length)
  );

  const cheatCaloriesValue = Math.max(0, Math.round(Number(cheatCalories) || 0));
  const cheatDaysValue = cheatDays.trim()
    ? Math.min(MAX_COMPENSATION_DAYS, Math.max(1, Math.round(Number(cheatDays) || 0)))
    : 0;
  const cheatDraft = cheatCaloriesValue > 0 && cheatDaysValue > 0
    ? buildCheatCompensation({
      todayKey,
      excessCalories: cheatCaloriesValue,
      compensationDays: cheatDaysValue,
    })
    : null;
  const cheatDraftSchedule = buildCompensationSchedule(cheatDraft).slice(0, 4);
  const hiddenDraftDays = Math.max(
    0,
    (cheatDraft?.compensationDays ?? 0) - cheatDraftSchedule.length
  );
  const cheatDraftRange = getCompensationReductionRange(cheatDraft);
  const cheatDraftFirstTarget = cheatDraft?.startDateKey
    ? getEffectiveCalorieTarget(baseTarget, cheatDraft, cheatDraft.startDateKey)
    : baseTarget;
  const cheatDraftLowTarget = cheatDraftFirstTarget > 0 && cheatDraftFirstTarget < 1200;

  const ringRadius = 58;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progress);

  const startWeight = profile?.weight || 0;
  const goalWeight = profile?.goalWeight || 0;
  const currentWeight = profile?.currentWeight || startWeight;
  const totalToLose = startWeight - goalWeight;
  const lostSoFar = startWeight - currentWeight;
  const progressBarPercent = totalToLose > 0
    ? Math.max(0, Math.min(Math.round((lostSoFar / totalToLose) * 100), 100))
    : 0;
  const isGained = lostSoFar < 0;
  const weeklyDrop = ((profile?.totalDailyDeficit ?? profile?.dailyDeficit ?? 0) * 7 / 7700).toFixed(1);

  const calorieStatusText = isOverTarget
    ? `${remainingAbs} kcal over target today`
    : `${remainingAbs} kcal left for today`;

  const compensationTitle = !cheatCompensationState.isBlocked
    ? 'Need a strategic cheat day?'
    : cheatCompensationState.isCheatDay
      ? `Cheat day active: +${todayAllowance} kcal today`
      : cheatCompensationState.isActive
      ? `Compensation live: -${todayReduction} kcal today`
      : 'Cheat day locked in. Recovery starts tomorrow.';

  const compensationSubtitle = !cheatCompensationState.isBlocked
    ? 'Tell Quasar how hard we are going off-plan today and it will spread the damage across the next few days.'
    : cheatCompensationState.isCheatDay
      ? `${cheatCompensation?.excessCalories ?? 0} extra kcal is unlocked for today. Recovery still starts tomorrow and runs through ${compensationWindowLabel}.`
      : cheatCompensationState.isActive
      ? `${cheatCompensationState.daysRemaining} day${cheatCompensationState.daysRemaining === 1 ? '' : 's'} left in this recovery block. Window ${compensationWindowLabel}.`
      : `${cheatCompensation?.excessCalories ?? 0} kcal gets repaid across ${cheatCompensation?.compensationDays ?? 0} days. Window ${compensationWindowLabel}.`;

  const compensationButtonLabel = cheatCompensationState.isBlocked
    ? 'Mark today a cheat'
    : 'Set up cheat recovery';

  const openCheatDialog = () => {
    if (cheatCompensationState.isBlocked) {
      setCheatBlockedQuoteIndex(Math.floor(Math.random() * CHEAT_BLOCK_QUOTES.length));
      setCheatBlockedVisible(true);
      return;
    }

    resetCheatForm();
    setCheatVisible(true);
  };

  const handleSaveCheatDay = async () => {
    if (!cheatDraft || savingCheatDay || !auth.currentUser) return;

    try {
      setSavingCheatDay(true);
      const userId = auth.currentUser.uid;
      await setDoc(
        doc(db, 'users', userId, 'profile', 'data'),
        { cheatCompensation: cheatDraft },
        { merge: true }
      );

      // ── Auto-log NB "went over" — cheat day = exceeded target by definition ──
      if (!todayNBAnswered) {
        try {
          await writeNBRow(userId, getLocalDateKey(), true, 'user_explicit', profile);
          markNBAnswered();
          setTodayNBAnswered(true);
        } catch (nbErr) {
          console.log('Cheat day NB log error:', nbErr.message);
        }
      }

      setProfile((prev) => ({
        ...(prev || {}),
        cheatCompensation: cheatDraft,
      }));
      setCheatVisible(false);
      resetCheatForm();

      // ── Show confirmation dialog ──
      showDialog({
        title: 'cheat day locked in 🔥',
        message:
          "we've automatically logged today as 'went over' for your adherence data — no need to answer the prompt.\n\n" +
          "your warrior protocol streak is unaffected (protein is tracked separately), but today's adherence score won't count in your favour.\n\n" +
          "compensation starts tomorrow. enjoy the day, the math is handled.",
        variant: 'info',
        actions: [{ label: 'got it', onPress: () => {} }],
      });
    } catch (error) {
      console.log('Cheat day error:', error.message);
    } finally {
      setSavingCheatDay(false);
    }
  };

  const weightSummaryText = isGained
    ? `${Math.abs(lostSoFar).toFixed(1)} kg up from your start. Log again and let the plan adjust.`
    : lostSoFar > 0
      ? `${lostSoFar.toFixed(1)} kg down with ${Math.max(totalToLose - lostSoFar, 0).toFixed(1)} kg to go.`
      : `${totalToLose.toFixed(1)} kg between your start and goal.`;

  const quickStats = [
    { label: 'Target', value: target, icon: 'fire', color: '#f39c12' },
    { label: 'Eaten', value: caloriesConsumed, icon: 'food-apple', color: '#ff4030' },
    { label: isOverTarget ? 'Over' : 'Left', value: remainingAbs, icon: 'lightning-bolt', color: isOverTarget ? '#ff6b6b' : '#27ae60' },
  ];

  const planTiles = [
    { label: 'TDEE', value: profile?.tdee ?? profile?.sedentaryTDEE ?? '--', icon: 'speedometer', color: '#ff4030' },
    { label: 'Daily deficit', value: profile?.dailyDeficit ?? profile?.totalDailyDeficit ?? '--', icon: 'trending-down', color: '#3498db' },
    { label: 'Food cut', value: profile?.foodDeficit ?? 0, icon: 'silverware-fork-knife', color: '#f39c12' },
    { label: 'Weekly drop', value: `${weeklyDrop} kg`, icon: 'rocket-launch', color: '#9b59b6' },
  ];

  const profileItems = [
    { label: 'Name', value: profile?.name || '--', icon: 'account' },
    { label: 'Age', value: profile?.age ? `${profile.age} yrs` : '--', icon: 'cake-variant' },
    { label: 'Height', value: profile?.height ? `${profile.height} cm` : '--', icon: 'human-male-height' },
    { label: 'Current', value: `${currentWeight} kg`, icon: 'scale-bathroom' },
    { label: 'Goal', value: `${goalWeight} kg`, icon: 'target' },
    { label: 'Timeline', value: profile?.targetWeeks ? `${profile.targetWeeks} weeks` : '--', icon: 'calendar-clock' },
  ];

  return (
    <LinearGradient colors={['#000000', '#050101', '#0a0202']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{formatGreeting(greeting.title, profile?.name)}</Text>
            <Text style={styles.headerSub}>{greeting.subtitle}</Text>
          </View>

          <TouchableOpacity onPress={openLogoutDialog} style={styles.headerAction}>
            <MaterialCommunityIcons name="logout" size={20} color="rgba(255,255,255,0.78)" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <LinearGradient
            colors={['rgba(255,60,30,0.26)', 'rgba(10,2,2,0.92)']}
            style={styles.heroGradient}
          >
            <View style={styles.heroTopRow}>
              <View>
                <Text style={styles.heroEyebrow}>TODAY</Text>
                <Text style={styles.heroDate}>{currentDateLabel}</Text>
              </View>

              <View style={[styles.heroStatusChip, isOverTarget && styles.heroStatusChipAlert]}>
                <MaterialCommunityIcons
                  name={
                    cheatCompensationState.isCheatDay
                      ? 'party-popper'
                      : isOverTarget
                        ? 'alert-circle-outline'
                        : 'check-circle-outline'
                  }
                  size={14}
                  color={
                    cheatCompensationState.isCheatDay
                      ? '#ffd5a8'
                      : isOverTarget
                        ? '#ffb4b0'
                        : '#a7f0ba'
                  }
                />
                <Text
                  style={[
                    styles.heroStatusText,
                    cheatCompensationState.isCheatDay && styles.heroStatusTextCheat,
                    isOverTarget && styles.heroStatusTextAlert,
                  ]}
                >
                  {cheatCompensationState.isCheatDay
                    ? 'Cheat day'
                    : isOverTarget
                      ? 'Above target'
                      : 'On track'}
                </Text>
              </View>
            </View>

            <View style={styles.heroContent}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroValue}>{remainingAbs}</Text>
                <Text style={styles.heroValueUnit}>kcal {isOverTarget ? 'over' : 'left'}</Text>
                <Text style={styles.heroCaption}>{calorieStatusText}</Text>
                <Text style={styles.heroSecondary}>
                  {caloriesConsumed} eaten of {target} target
                  {todayReduction > 0 ? ` · base ${baseTarget}` : ''}
                  {todayAllowance > 0 ? ` · +${todayAllowance} unlocked` : ''}
                </Text>
                {cheatCompensationState.isBlocked && (
                  <View
                    style={[
                      styles.heroRecoveryPill,
                      cheatCompensationState.isActive && styles.heroRecoveryPillActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={cheatCompensationState.isActive ? 'shield-alert-outline' : 'calendar-arrow-right'}
                      size={13}
                      color={cheatCompensationState.isActive ? '#ffd3cf' : '#ffb6af'}
                    />
                    <Text style={styles.heroRecoveryText}>
                      {cheatCompensationState.isCheatDay
                        ? `cheat buffer added for today · recovery starts ${formatDateKey(cheatCompensation?.startDateKey, { day: 'numeric', month: 'short' })}`
                        : cheatCompensationState.isActive
                          ? `recovery trims ${todayReduction} kcal today`
                          : `recovery starts ${formatDateKey(cheatCompensation?.startDateKey, { day: 'numeric', month: 'short' })}`}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.ringWrap}>
                <Svg width={140} height={140}>
                  <Circle
                    cx={70}
                    cy={70}
                    r={ringRadius}
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth={12}
                    fill="none"
                  />
                  <Circle
                    cx={70}
                    cy={70}
                    r={ringRadius}
                    stroke={isOverTarget ? '#ff6b6b' : '#ff6b4a'}
                    strokeWidth={12}
                    fill="none"
                    strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                    strokeDashoffset={ringOffset}
                    strokeLinecap="round"
                    rotation="-90"
                    origin="70, 70"
                  />
                </Svg>

                <View style={styles.ringCenter}>
                  <Text style={styles.ringPercent}>{progressPercent}%</Text>
                  <Text style={styles.ringLabel}>used</Text>
                </View>
              </View>
            </View>

            {/* Daily NB Check-In */}
            {!todayNBAnswered && (
              <View style={styles.nbCheckCard}>
                <View style={styles.nbCheckRow}>
                  <MaterialCommunityIcons name="chart-timeline-variant" size={20} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.nbCheckText}>
                    {"not feeling like logging every meal today? that's okay - just let us know how you did overall and we'll use it to look out for you"}
                  </Text>
                </View>
                <View style={styles.nbCheckBtns}>
                  <TouchableOpacity
                    style={styles.nbCheckBtnGood}
                    onPress={() => confirmNBAnswer(false)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="check" size={16} color="#4ADE80" />
                    <Text style={styles.nbCheckBtnGoodText}>stayed within</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.nbCheckBtnOver}
                    onPress={() => confirmNBAnswer(true)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="trending-up" size={16} color="#FB923C" />
                    <Text style={styles.nbCheckBtnOverText}>went over</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={styles.quickStatsRow}>
              {quickStats.map((item) => (
                <View key={item.label} style={styles.quickStatCard}>
                  <MaterialCommunityIcons name={item.icon} size={18} color={item.color} />
                  <Text style={styles.quickStatValue}>{item.value}</Text>
                  <Text style={styles.quickStatLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* ── Nutrition Today ── */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="nutrition" size={16} color="#ff8a65" />
            <Text style={styles.sectionTitle}> Nutrition Today</Text>
          </View>
          <View style={styles.macroRow}>
            <View style={styles.macroCard}>
              <View style={[styles.macroIconCircle, { backgroundColor: 'rgba(255,60,30,0.15)' }]}>
                <MaterialCommunityIcons name="arm-flex" size={16} color="#ff4030" />
              </View>
              <Text style={styles.macroValue}>{proteinConsumed}g</Text>
              <Text style={styles.macroLabel}>Protein</Text>
            </View>
            <View style={styles.macroCard}>
              <View style={[styles.macroIconCircle, { backgroundColor: 'rgba(243,156,18,0.15)' }]}>
                <MaterialCommunityIcons name="grain" size={16} color="#f39c12" />
              </View>
              <Text style={styles.macroValue}>{carbsConsumed}g</Text>
              <Text style={styles.macroLabel}>Carbs</Text>
            </View>
            <View style={styles.macroCard}>
              <View style={[styles.macroIconCircle, { backgroundColor: 'rgba(52,152,219,0.15)' }]}>
                <MaterialCommunityIcons name="water-outline" size={16} color="#3498db" />
              </View>
              <Text style={styles.macroValue}>{fatConsumed}g</Text>
              <Text style={styles.macroLabel}>Fat</Text>
            </View>
          </View>
        </View>

        {/* ── Workout Editor ── */}
        {profile?.activitySettings && !profile?.loadManagement?.active && !profile?.activeInjury?.active && (
          <WorkoutEditor
            activitySettings={profile.activitySettings}
            onSave={handleWorkoutSave}
            accent="#ff4030"
            saving={workoutSaving}
            cardBorder="rgba(255,255,255,0.08)"
            dark
          />
        )}

        {/* ── Protein Warrior Badge Card ── */}
        {(() => {
          const badge     = getBadgeForScore(proteinStreak.badgeScore);
          const nextBadge = getNextBadge(proteinStreak.badgeScore);
          const proteinGoal = getProteinGoal(profile);
          const proteinPct  = proteinGoal > 0 ? Math.min(proteinConsumed / proteinGoal, 1) : 0;
          const scorePct    = nextBadge
            ? (proteinStreak.badgeScore - badge.minScore) / (nextBadge.minScore - badge.minScore)
            : 1;
          return (
            <TouchableOpacity
              style={[styles.badgeCard, { borderColor: badge.borderColor + '55' }]}
              onPress={() => setBadgeModalVisible(true)}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['rgba(15,2,3,0.96)', 'rgba(25,5,6,0.98)']}
                style={styles.badgeCardGrad}
              >
                {/* Header */}
                <View style={styles.badgeCardHeader}>
                  <MaterialCommunityIcons name="sword-cross" size={13} color={badge.color} />
                  <Text style={[styles.badgeCardEyebrow, { color: badge.color }]}>WARRIOR PROTOCOL</Text>
                  <MaterialCommunityIcons name="chevron-right" size={16} color="rgba(255,255,255,0.25)" />
                </View>

                {/* Badge + streak row */}
                <View style={styles.badgeMainRow}>
                  {/* Badge medallion */}
                  <View style={[styles.badgeMedallion, { borderColor: badge.borderColor, shadowColor: badge.glowColor }]}>
                    <LinearGradient colors={badge.gradColors} style={styles.badgeMedallionGrad}>
                      <Text style={styles.badgeMedallionEmoji}>{badge.emoji}</Text>
                    </LinearGradient>
                  </View>

                  {/* Info */}
                  <View style={styles.badgeInfo}>
                    <Text style={[styles.badgeName, { color: badge.color }]}>{badge.name}</Text>
                    <Text style={styles.badgeSubtitle}>{badge.subtitle}</Text>

                    {/* Streak + shields */}
                    <View style={styles.badgeStreakRow}>
                      <View style={styles.badgeStreakChip}>
                        <Text style={styles.badgeStreakEmoji}>🔥</Text>
                        <Text style={styles.badgeStreakVal}>{proteinStreak.currentStreak}</Text>
                        <Text style={styles.badgeStreakLbl}>day streak</Text>
                      </View>
                      {proteinStreak.shields > 0 && (
                        <View style={styles.badgeShieldChip}>
                          <Text style={styles.badgeStreakEmoji}>🛡️</Text>
                          <Text style={styles.badgeStreakVal}>{proteinStreak.shields}</Text>
                          <Text style={styles.badgeStreakLbl}>shields</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {/* Score progress */}
                <View style={styles.badgeProgressWrap}>
                  <View style={styles.badgeProgressLabelRow}>
                    <Text style={styles.badgeProgressLabel}>
                      {proteinStreak.badgeScore} pts
                    </Text>
                    <Text style={styles.badgeProgressLabel}>
                      {nextBadge ? `${nextBadge.minScore} → ${nextBadge.name}` : 'MAX RANK'}
                    </Text>
                  </View>
                  <View style={styles.badgeProgressBg}>
                    <LinearGradient
                      colors={[badge.borderColor, badge.color]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[styles.badgeProgressFill, { width: `${Math.round(scorePct * 100)}%` }]}
                    />
                  </View>
                </View>

                {/* Today's protein */}
                <View style={styles.badgeProteinWrap}>
                  <View style={styles.badgeProteinLabelRow}>
                    <Text style={styles.badgeProteinLabel}>today's protein</Text>
                    <Text style={[styles.badgeProteinVal, {
                      color: proteinConsumed >= proteinGoal ? '#4ADE80' : 'rgba(255,255,255,0.6)',
                    }]}>
                      {Math.round(proteinConsumed)}g / {proteinGoal}g
                    </Text>
                  </View>
                  <View style={styles.badgeProteinBg}>
                    <LinearGradient
                      colors={proteinConsumed >= proteinGoal ? ['#16A34A', '#4ADE80'] : ['#ff4030', '#ff6b4a']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[styles.badgeProteinFill, { width: `${Math.round(proteinPct * 100)}%` }]}
                    />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        })()}

        {/* ── Perspective Check ── */}
        {perspectiveVisible && (
          <View style={styles.perspectiveCard}>
            <LinearGradient
              colors={['rgba(139,92,246,0.12)', 'rgba(15,2,3,0.92)']}
              style={styles.perspectiveGradient}
            >
              <View style={styles.perspectiveHeader}>
                <View style={styles.perspectiveIconWrap}>
                  <MaterialCommunityIcons name={PERSPECTIVE_CHECKS[perspectiveIdx].icon} size={18} color="#A78BFA" />
                </View>
                <Text style={styles.perspectiveEyebrow}>
                  {formatPerspectiveHeading(
                    PERSPECTIVE_HEADINGS[perspectiveIdx % PERSPECTIVE_HEADINGS.length],
                    profile?.gender
                  )}
                </Text>
                <TouchableOpacity onPress={() => setPerspectiveVisible(false)} style={styles.perspectiveDismiss}>
                  <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </View>
              <Text style={styles.perspectiveText}>{PERSPECTIVE_CHECKS[perspectiveIdx].text}</Text>
            </LinearGradient>
          </View>
        )}

        {/* ── Adherence Insight (Naive Bayes ML) ── */}
        {adherenceRisk && adherenceVisible && (
          <View style={styles.adherenceCard}>
            <LinearGradient
              colors={['rgba(234,88,12,0.12)', 'rgba(15,2,3,0.94)']}
              style={styles.adherenceGradient}
            >
              <View style={styles.adherenceHeader}>
                <View style={styles.adherenceIconWrap}>
                  <MaterialCommunityIcons name="brain" size={18} color="#FB923C" />
                </View>
                <Text style={styles.adherenceEyebrow}>ADHERENCE INSIGHT</Text>
                <View style={styles.adherenceBadge}>
                  <Text style={styles.adherenceBadgeText}>{adherenceRisk.probabilityExceed}% risk</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setAdherenceVisible(false)}
                  style={styles.adherenceDismiss}
                >
                  <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              </View>
              <Text style={styles.adherenceText}>{adherenceRisk.message}</Text>
            </LinearGradient>
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionCardPrimary} onPress={() => router.push('/MealLogScreen')}>
            <LinearGradient colors={['#bd2c2c', '#8a1818']} style={styles.actionPrimaryGradient}>
              <View style={styles.actionIconBoxPrimary}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={20} color="#fff" />
              </View>
              <Text style={styles.actionTitlePrimary}>Log a Meal</Text>
              <Text style={styles.actionSubPrimary}>Add breakfast, lunch, dinner, or snacks.</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCardSecondary} onPress={() => router.push('/WeeklyCheckIn')}>
            <View style={styles.actionIconBoxSecondary}>
              <MaterialCommunityIcons name="scale-bathroom" size={20} color="#ff8f86" />
            </View>
            <Text style={styles.actionTitleSecondary}>Log Weight</Text>
            <Text style={styles.actionSubSecondary}>
              {currentWeight !== startWeight ? `Last logged: ${currentWeight} kg` : 'Update progress and recalibrate your plan.'}
            </Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="rgba(255,255,255,0.62)" />
          </TouchableOpacity>
        </View>

        {/* ── Injury Mode Button ── */}
        <TouchableOpacity
          style={styles.injuryModeBtn}
          onPress={() => router.push('/InjuryScreen')}
          activeOpacity={0.85}
        >
          <View style={styles.injuryModeBtnLeft}>
            <View style={styles.injuryModeIconBox}>
              <MaterialCommunityIcons name="hospital-box-outline" size={20} color="#16A34A" />
            </View>
            <View>
              <Text style={styles.injuryModeBtnTitle}>Injury / Illness Mode</Text>
              <Text style={styles.injuryModeBtnSub}>
                {profile?.activeInjury?.active
                  ? `Active: ${profile.activeInjury.conditionLabel}`
                  : 'hurt or sick? we\'ll adapt your plan'}
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons
            name={profile?.activeInjury?.active ? 'heart-pulse' : 'chevron-right'}
            size={18}
            color={profile?.activeInjury?.active ? '#16A34A' : 'rgba(255,255,255,0.4)'}
          />
        </TouchableOpacity>

        {/* ── Load Management Mode Button ── */}
        <TouchableOpacity
          style={styles.loadMgmtBtn}
          onPress={() => router.push('/LoadManagementScreen')}
          activeOpacity={0.85}
        >
          <View style={styles.loadMgmtBtnLeft}>
            <View style={styles.loadMgmtIconBox}>
              <MaterialCommunityIcons name="shield-sun-outline" size={20} color="#F59E0B" />
            </View>
            <View>
              <Text style={styles.loadMgmtBtnTitle}>Load Management Mode</Text>
              <Text style={styles.loadMgmtBtnSub}>
                {profile?.loadManagement?.active
                  ? `Active · Day ${Math.max(1, Math.ceil((new Date() - new Date(profile.loadManagement.startedAt)) / 86400000))}`
                  : 'exams, stress, or tough times? we adapt'}
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons
            name={profile?.loadManagement?.active ? 'shield-sun' : 'chevron-right'}
            size={18}
            color={profile?.loadManagement?.active ? '#F59E0B' : 'rgba(255,255,255,0.4)'}
          />
        </TouchableOpacity>

        {/* ── Deficit Cycling Mode Button ── */}
        <TouchableOpacity
          style={styles.deficitCyclingBtn}
          onPress={() => router.push('/DeficitCyclingScreen')}
          activeOpacity={0.85}
        >
          <View style={styles.deficitCyclingBtnLeft}>
            <View style={styles.deficitCyclingIconBox}>
              <MaterialCommunityIcons name="dna" size={20} color="#2563EB" />
            </View>
            <View>
              <Text style={styles.deficitCyclingBtnTitle}>Deficit Cycling</Text>
              <Text style={styles.deficitCyclingBtnSub}>
                {profile?.deficitCycling?.active
                  ? `Active · ${profile.deficitCycling.cycleLabel} cycle`
                  : 'outsmart metabolic adaptation with science'}
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons
            name={profile?.deficitCycling?.active ? 'swap-horizontal' : 'chevron-right'}
            size={18}
            color={profile?.deficitCycling?.active ? '#2563EB' : 'rgba(255,255,255,0.4)'}
          />
        </TouchableOpacity>

        {/* ── Thermic Engine Button ── */}
        <TouchableOpacity
          style={styles.thermicEngineBtn}
          onPress={() => router.push('/ThermicEngineScreen')}
          activeOpacity={0.85}
        >
          <View style={styles.thermicEngineBtnLeft}>
            <View style={styles.thermicEngineIconBox}>
              <MaterialCommunityIcons name="fire" size={20} color="#FF6D00" />
            </View>
            <View>
              <Text style={styles.thermicEngineBtnTitle}>Thermic Engine</Text>
              <Text style={styles.thermicEngineBtnSub}>
                {profile?.thermicEngine?.active
                  ? `Active · Day ${Math.max(1, Math.ceil((new Date() - new Date(profile.thermicEngine.startedAt)) / 86400000))}`
                  : 'earn calorie refunds from digestion'}
              </Text>
            </View>
          </View>
          <MaterialCommunityIcons
            name={profile?.thermicEngine?.active ? 'fire' : 'chevron-right'}
            size={18}
            color={profile?.thermicEngine?.active ? '#FF6D00' : 'rgba(255,255,255,0.4)'}
          />
        </TouchableOpacity>

        <View style={styles.recoveryCard}>
          <LinearGradient
            colors={
              cheatCompensationState.isBlocked
                ? ['rgba(255,60,30,0.22)', 'rgba(10,2,2,0.94)']
                : ['rgba(255,255,255,0.06)', 'rgba(15,2,3,0.96)']
            }
            style={styles.recoveryGradient}
          >
            <View style={styles.recoveryHeader}>
              <View style={styles.recoveryIconWrap}>
                <MaterialCommunityIcons
                  name={cheatCompensationState.isBlocked ? 'lightning-bolt-circle' : 'cards-heart-outline'}
                  size={20}
                  color="#ff8f86"
                />
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={openCheatDialog}
                style={styles.recoveryCta}
              >
                <Text style={styles.recoveryCtaText}>{compensationButtonLabel}</Text>
                <MaterialCommunityIcons name="arrow-right" size={14} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.recoveryTitle}>{compensationTitle}</Text>
            <Text style={styles.recoverySubtitle}>{compensationSubtitle}</Text>

            <View style={styles.recoveryStatsRow}>
              <View style={styles.recoveryStatCard}>
                <Text style={styles.recoveryStatValue}>
                  {cheatCompensation?.excessCalories ?? '—'}
                </Text>
                <Text style={styles.recoveryStatLabel}>extra kcal</Text>
              </View>
              <View style={styles.recoveryStatCard}>
                <Text style={styles.recoveryStatValue}>
                  {cheatCompensation?.compensationDays ?? '—'}
                </Text>
                <Text style={styles.recoveryStatLabel}>recovery days</Text>
              </View>
              <View style={styles.recoveryStatCard}>
                <Text style={styles.recoveryStatValue}>
                  {cheatCompensation
                    ? cheatRange.min === cheatRange.max
                      ? `-${cheatRange.max}`
                      : `-${cheatRange.min}-${cheatRange.max}`
                    : '—'}
                </Text>
                <Text style={styles.recoveryStatLabel}>daily cut</Text>
              </View>
            </View>

            {cheatCompensationState.isBlocked ? (
              <>
                <View style={styles.recoveryScheduleHeader}>
                  <Text style={styles.recoveryScheduleTitle}>
                    {cheatCompensationState.isActive ? 'Recovery days left' : 'Upcoming recovery days'}
                  </Text>
                  <Text style={styles.recoveryScheduleMeta}>{compensationWindowLabel}</Text>
                </View>

                <View style={styles.recoveryScheduleRow}>
                  {compensationPreviewSchedule.map((entry) => (
                    <View key={entry.dateKey} style={styles.recoveryDayChip}>
                      <Text style={styles.recoveryDayLabel}>
                        {formatDateKey(entry.dateKey, { weekday: 'short' })}
                      </Text>
                      <Text style={styles.recoveryDayDate}>
                        {formatDateKey(entry.dateKey, { day: 'numeric', month: 'short' })}
                      </Text>
                      <Text style={styles.recoveryDayValue}>-{entry.reduction}</Text>
                    </View>
                  ))}
                  {hiddenCompensationDays > 0 && (
                    <View style={[styles.recoveryDayChip, styles.recoveryDayChipMuted]}>
                      <Text style={styles.recoveryMoreDays}>+{hiddenCompensationDays} more</Text>
                    </View>
                  )}
                </View>
              </>
            ) : (
              <Text style={styles.recoveryHint}>
                Keep it honest: log how many calories you are going over today, then choose how many upcoming days should absorb the hit.
              </Text>
            )}
          </LinearGradient>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="chart-line-variant" size={16} color="#ff4030" />
            <Text style={styles.sectionTitle}> Weight Journey</Text>
          </View>

          <View style={styles.weightHero}>
            <View style={styles.weightStat}>
              <Text style={styles.weightStatLabel}>START</Text>
              <Text style={styles.weightStatValue}>{startWeight}</Text>
              <Text style={styles.weightStatUnit}>kg</Text>
            </View>

            <View style={styles.weightCenter}>
              <Text style={styles.weightStatLabel}>CURRENT</Text>
              <Text style={[styles.weightCurrentValue, isGained && { color: '#ff8585' }]}>
                {currentWeight}
              </Text>
              <Text style={styles.weightCurrentUnit}>kg</Text>
              {lostSoFar !== 0 && (
                <View style={[
                  styles.weightDeltaBadge,
                  {
                    backgroundColor: isGained ? 'rgba(255,60,30,0.15)' : 'rgba(39,174,96,0.15)',
                    borderColor: isGained ? 'rgba(255,60,30,0.28)' : 'rgba(39,174,96,0.28)',
                  },
                ]}>
                  <MaterialCommunityIcons
                    name={isGained ? 'trending-up' : 'trending-down'}
                    size={12}
                    color={isGained ? '#ff8585' : '#27ae60'}
                  />
                  <Text style={[styles.weightDeltaText, { color: isGained ? '#ffb1b1' : '#9cf0af' }]}>
                    {isGained ? '+' : '-'}{Math.abs(lostSoFar).toFixed(1)} kg
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.weightStat}>
              <Text style={styles.weightStatLabel}>GOAL</Text>
              <Text style={[styles.weightStatValue, { color: '#7be495' }]}>{goalWeight}</Text>
              <Text style={styles.weightStatUnit}>kg</Text>
            </View>
          </View>

          <View style={styles.weightTrack}>
            <View style={[styles.weightFill, { width: `${progressBarPercent}%`, backgroundColor: isGained ? '#ff6b6b' : '#27ae60' }]} />
            {progressBarPercent > 0 && progressBarPercent < 100 && (
              <View style={[styles.weightThumb, { left: `${progressBarPercent}%`, borderColor: isGained ? '#ff6b6b' : '#27ae60' }]} />
            )}
          </View>

          <View style={styles.weightLabels}>
            <Text style={styles.weightLabelText}>{startWeight} kg</Text>
            <Text style={[styles.weightLabelCenter, { color: isGained ? '#ffb4b0' : '#9cf0af' }]}>
              {progressBarPercent}% done
            </Text>
            <Text style={styles.weightLabelText}>{goalWeight} kg</Text>
          </View>

          <Text style={styles.weightSummaryText}>{weightSummaryText}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="lightning-bolt-outline" size={16} color="#f39c12" />
            <Text style={styles.sectionTitle}> Plan Snapshot</Text>
          </View>

          <View style={styles.planGrid}>
            {planTiles.map((item) => (
              <View key={item.label} style={styles.planTile}>
                <MaterialCommunityIcons name={item.icon} size={18} color={item.color} />
                <Text style={styles.planTileValue}>{item.value}</Text>
                <Text style={styles.planTileLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="account-circle-outline" size={16} color="#ff8f86" />
            <Text style={styles.sectionTitle}> Your Stats</Text>
          </View>

          <View style={styles.profileGrid}>
            {profileItems.map((item) => (
              <View key={item.label} style={styles.profileItem}>
                <MaterialCommunityIcons name={item.icon} size={16} color="#ff8a65" />
                <Text style={styles.profileValue}>{item.value}</Text>
                <Text style={styles.profileLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ══ Badge Hierarchy Modal ══ */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={badgeModalVisible}
        onRequestClose={() => setBadgeModalVisible(false)}
        statusBarTranslucent
      >
        <LinearGradient colors={['#0a0002', '#150104', '#200305']} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.bhHeader}>
              <TouchableOpacity onPress={() => setBadgeModalVisible(false)} style={styles.bhClose}>
                <MaterialCommunityIcons name="chevron-down" size={26} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
              <Text style={styles.bhTitle}>Warrior Protocol</Text>
              <Text style={styles.bhSub}>your path to immortality</Text>
            </View>

            {/* Current badge hero */}
            {(() => {
              const badge     = getBadgeForScore(proteinStreak.badgeScore);
              const nextBadge = getNextBadge(proteinStreak.badgeScore);
              const scorePct  = nextBadge
                ? (proteinStreak.badgeScore - badge.minScore) / (nextBadge.minScore - badge.minScore)
                : 1;
              return (
                <View style={styles.bhHero}>
                  <View style={[styles.bhHeroMedallion, { borderColor: badge.borderColor, shadowColor: badge.glowColor }]}>
                    <LinearGradient colors={badge.gradColors} style={styles.bhHeroMedallionGrad}>
                      <Text style={styles.bhHeroEmoji}>{badge.emoji}</Text>
                    </LinearGradient>
                  </View>
                  <Text style={[styles.bhHeroName, { color: badge.color }]}>{badge.name}</Text>
                  <Text style={styles.bhHeroSubtitle}>{badge.subtitle}</Text>

                  {/* Stats row */}
                  <View style={styles.bhStatsRow}>
                    <View style={styles.bhStatChip}>
                      <Text style={styles.bhStatEmoji}>🔥</Text>
                      <Text style={styles.bhStatVal}>{proteinStreak.currentStreak}</Text>
                      <Text style={styles.bhStatLbl}>day streak</Text>
                    </View>
                    <View style={styles.bhStatChip}>
                      <Text style={styles.bhStatEmoji}>⚡</Text>
                      <Text style={styles.bhStatVal}>{proteinStreak.badgeScore}</Text>
                      <Text style={styles.bhStatLbl}>badge score</Text>
                    </View>
                    <View style={styles.bhStatChip}>
                      <Text style={styles.bhStatEmoji}>🛡️</Text>
                      <Text style={styles.bhStatVal}>{proteinStreak.shields}</Text>
                      <Text style={styles.bhStatLbl}>shields</Text>
                    </View>
                    <View style={styles.bhStatChip}>
                      <Text style={styles.bhStatEmoji}>🏹</Text>
                      <Text style={styles.bhStatVal}>{proteinStreak.totalCompletions}</Text>
                      <Text style={styles.bhStatLbl}>victories</Text>
                    </View>
                  </View>

                  {/* Progress to next */}
                  {nextBadge && (
                    <View style={styles.bhHeroProgress}>
                      <View style={styles.bhProgressLabelRow}>
                        <Text style={styles.bhProgressLabel}>{proteinStreak.badgeScore} pts</Text>
                        <Text style={styles.bhProgressLabel}>{nextBadge.minScore} pts → {nextBadge.name}</Text>
                      </View>
                      <View style={styles.bhProgressBg}>
                        <LinearGradient
                          colors={[badge.borderColor, badge.color]}
                          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                          style={[styles.bhProgressFill, { width: `${Math.round(scorePct * 100)}%` }]}
                        />
                      </View>
                      <Text style={styles.bhProgressNote}>
                        {Math.ceil((nextBadge.minScore - proteinStreak.badgeScore) / 10)} protein days to {nextBadge.name}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Divider */}
            <View style={styles.bhDividerRow}>
              <View style={styles.bhDividerLine} />
              <Text style={styles.bhDividerLabel}>ALL RANKS</Text>
              <View style={styles.bhDividerLine} />
            </View>

            {/* Badge list */}
            <View style={{ paddingHorizontal: 20, gap: 12 }}>
              {PROTEIN_BADGES.map((b) => {
                const isAchieved = proteinStreak.badgeScore >= b.minScore;
                const isCurrent  = getBadgeForScore(proteinStreak.badgeScore).id === b.id;
                return (
                  <View
                    key={b.id}
                    style={[
                      styles.bhBadgeRow,
                      { borderColor: isCurrent ? b.borderColor : 'rgba(255,255,255,0.06)' },
                      isCurrent && { backgroundColor: b.borderColor + '12' },
                    ]}
                  >
                    {/* Medallion */}
                    <View style={[
                      styles.bhRowMedallion,
                      { borderColor: isAchieved ? b.borderColor : 'rgba(255,255,255,0.1)', opacity: isAchieved ? 1 : 0.4 },
                    ]}>
                      <LinearGradient
                        colors={isAchieved ? b.gradColors : ['#1a1a1a', '#0a0a0a']}
                        style={styles.bhRowMedallionGrad}
                      >
                        <Text style={[styles.bhRowEmoji, { opacity: isAchieved ? 1 : 0.5 }]}>{b.emoji}</Text>
                      </LinearGradient>
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.bhRowName, { color: isAchieved ? b.color : 'rgba(255,255,255,0.3)' }]}>
                          {b.name}
                        </Text>
                        {isCurrent && (
                          <View style={[styles.bhCurrentPill, { backgroundColor: b.borderColor + '22', borderColor: b.borderColor + '55' }]}>
                            <Text style={[styles.bhCurrentPillText, { color: b.color }]}>CURRENT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.bhRowSubtitle, { color: isAchieved ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)' }]}>
                        {b.subtitle}
                      </Text>
                    </View>

                    {/* Score */}
                    <View style={{ alignItems: 'flex-end' }}>
                      {isAchieved
                        ? <MaterialCommunityIcons name="check-circle" size={18} color={b.color} />
                        : <MaterialCommunityIcons name="lock-outline" size={16} color="rgba(255,255,255,0.2)" />
                      }
                      <Text style={[styles.bhRowScore, { color: isAchieved ? b.color : 'rgba(255,255,255,0.2)' }]}>
                        {b.minScore} pts
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Shield info */}
            <View style={styles.bhShieldInfo}>
              <Text style={styles.bhShieldEmoji}>🛡️</Text>
              <Text style={styles.bhShieldText}>
                you earn a <Text style={{ color: '#FCD34D', fontWeight: '700' }}>shield</Text> every 5th protein victory. shields automatically protect your streak if you miss a day.
              </Text>
            </View>
          </ScrollView>
        </LinearGradient>
      </Modal>

      <AppAlertDialog {...dialogProps} />

      <Modal
        animationType="fade"
        transparent
        visible={logoutVisible}
        onRequestClose={closeLogoutDialog}
      >
        <View style={styles.logoutOverlay}>
          <View style={styles.logoutCard}>
            <View style={styles.logoutIconWrap}>
              <MaterialCommunityIcons name="logout-variant" size={24} color="#ff8f86" />
            </View>

            <Text style={styles.logoutTitle}>{logoutQuote.title}</Text>
            <Text style={styles.logoutSubtitle}>{logoutQuote.subtitle}</Text>

            <View style={styles.logoutQuoteBox}>
              <Text style={styles.logoutQuoteEyebrow}>Before You Bounce</Text>
              <Text style={styles.logoutQuoteText}>
                &quot;{logoutQuote.quote}&quot;
              </Text>
            </View>

            <View style={styles.logoutActions}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={closeLogoutDialog}
                style={styles.logoutSecondaryBtn}
              >
                <Text style={styles.logoutSecondaryText}>Stay in</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                disabled={loggingOut}
                onPress={handleLogout}
                style={styles.logoutPrimaryBtn}
              >
                <LinearGradient colors={['#ff4030', '#cc2020']} style={styles.logoutPrimaryGradient}>
                  {loggingOut ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.logoutPrimaryText}>Log out</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={cheatVisible}
        onRequestClose={closeCheatDialog}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.cheatOverlay}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.cheatOverlayScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.cheatCard}>
            <View style={styles.cheatIconWrap}>
              <MaterialCommunityIcons name="fire-alert" size={24} color="#ff8f86" />
            </View>

            <Text style={styles.cheatTitle}>Mark today a cheat</Text>
            <Text style={styles.cheatSubtitle}>
              Tell Quasar how hard we are going off-plan today and how many days should quietly pay it back starting tomorrow.
            </Text>

            <View style={styles.cheatInputRow}>
              <View style={styles.cheatInputBlock}>
                <Text style={styles.cheatInputLabel}>Going over by</Text>
                <TextInput
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={(value) => setCheatCalories(value.replace(/[^0-9]/g, ''))}
                  placeholder="800"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  style={styles.cheatInput}
                  value={cheatCalories}
                />
                <Text style={styles.cheatInputUnit}>kcal today</Text>
              </View>

              <View style={styles.cheatInputBlock}>
                <Text style={styles.cheatInputLabel}>Compensate over</Text>
                <TextInput
                  keyboardType="number-pad"
                  maxLength={2}
                  onChangeText={(value) => setCheatDays(value.replace(/[^0-9]/g, ''))}
                  placeholder="4"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  style={styles.cheatInput}
                  value={cheatDays}
                />
                <Text style={styles.cheatInputUnit}>days max {MAX_COMPENSATION_DAYS}</Text>
              </View>
            </View>

            <View style={styles.cheatPreviewCard}>
              <View style={styles.cheatPreviewHeader}>
                <Text style={styles.cheatPreviewEyebrow}>Recovery Preview</Text>
                <Text style={styles.cheatPreviewMeta}>
                  starts {cheatDraft?.startDateKey
                    ? formatDateKey(cheatDraft.startDateKey, { day: 'numeric', month: 'short' })
                    : 'tomorrow'}
                </Text>
              </View>

              {cheatDraft ? (
                <>
                  <View style={styles.cheatPreviewStatsRow}>
                    <View style={styles.cheatPreviewStat}>
                      <Text style={styles.cheatPreviewValue}>{cheatDraft.excessCalories}</Text>
                      <Text style={styles.cheatPreviewLabel}>extra kcal</Text>
                    </View>
                    <View style={styles.cheatPreviewStat}>
                      <Text style={styles.cheatPreviewValue}>{cheatDraft.compensationDays}</Text>
                      <Text style={styles.cheatPreviewLabel}>days</Text>
                    </View>
                    <View style={styles.cheatPreviewStat}>
                      <Text style={styles.cheatPreviewValue}>
                        {cheatDraftRange.min === cheatDraftRange.max
                          ? `-${cheatDraftRange.max}`
                          : `-${cheatDraftRange.min}-${cheatDraftRange.max}`}
                      </Text>
                      <Text style={styles.cheatPreviewLabel}>daily cut</Text>
                    </View>
                    <View style={styles.cheatPreviewStat}>
                      <Text style={styles.cheatPreviewValue}>{cheatDraftFirstTarget}</Text>
                      <Text style={styles.cheatPreviewLabel}>tomorrow target</Text>
                    </View>
                  </View>

                  <View style={styles.cheatScheduleRow}>
                    {cheatDraftSchedule.map((entry) => (
                      <View key={entry.dateKey} style={styles.cheatScheduleChip}>
                        <Text style={styles.cheatScheduleDay}>
                          {formatDateKey(entry.dateKey, { weekday: 'short' })}
                        </Text>
                        <Text style={styles.cheatScheduleDate}>
                          {formatDateKey(entry.dateKey, { day: 'numeric', month: 'short' })}
                        </Text>
                        <Text style={styles.cheatScheduleValue}>-{entry.reduction}</Text>
                      </View>
                    ))}
                    {hiddenDraftDays > 0 && (
                      <View style={[styles.cheatScheduleChip, styles.cheatScheduleChipMuted]}>
                        <Text style={styles.cheatScheduleMore}>+{hiddenDraftDays} more</Text>
                      </View>
                    )}
                  </View>

                  {cheatDraftLowTarget && (
                    <View style={styles.cheatWarningBox}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#ffb4b0" />
                      <Text style={styles.cheatWarningText}>
                        This recovery gets pretty aggressive. You can still do it, but spreading it over more days will feel less brutal.
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.cheatPreviewPlaceholder}>
                  Enter the extra calories and the recovery window to preview how Quasar will trim the next few days.
                </Text>
              )}
            </View>

            <View style={styles.cheatActions}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={closeCheatDialog}
                style={styles.cheatSecondaryBtn}
              >
                <Text style={styles.cheatSecondaryText}>Not today</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                disabled={!cheatDraft || savingCheatDay}
                onPress={handleSaveCheatDay}
                style={[styles.cheatPrimaryBtn, (!cheatDraft || savingCheatDay) && styles.cheatPrimaryBtnDisabled]}
              >
                <LinearGradient colors={['#ff4030', '#cc2020']} style={styles.cheatPrimaryGradient}>
                  {savingCheatDay ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.cheatPrimaryText}>Lock recovery</Text>
                      <MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={cheatBlockedVisible}
        onRequestClose={closeCheatBlockedDialog}
      >
        <View style={styles.logoutOverlay}>
          <View style={styles.logoutCard}>
            <View style={styles.logoutIconWrap}>
              <MaterialCommunityIcons name="shield-lock-outline" size={24} color="#ff8f86" />
            </View>

            <Text style={styles.logoutTitle}>{cheatBlockedQuote.title}</Text>
            <Text style={styles.logoutSubtitle}>{cheatBlockedQuote.subtitle}</Text>

            <View style={styles.logoutQuoteBox}>
              <Text style={styles.logoutQuoteEyebrow}>Coach Voice</Text>
              <Text style={styles.logoutQuoteText}>
                &quot;{cheatBlockedQuote.quote}&quot;
              </Text>
            </View>

            {cheatCompensation && (
              <View style={styles.blockedStatsBox}>
                <View style={styles.blockedStat}>
                  <Text style={styles.blockedStatValue}>
                    {cheatCompensationState.isActive
                      ? `${cheatCompensationState.daysRemaining}`
                      : `${cheatCompensation.compensationDays}`}
                  </Text>
                  <Text style={styles.blockedStatLabel}>
                    {cheatCompensationState.isActive ? 'days left' : 'days queued'}
                  </Text>
                </View>
                <View style={styles.blockedStatDivider} />
                <View style={styles.blockedStat}>
                  <Text style={styles.blockedStatValue}>
                    -{cheatCompensationState.isActive ? todayReduction : cheatCompensationState.nextReduction}
                  </Text>
                  <Text style={styles.blockedStatLabel}>
                    {cheatCompensationState.isActive ? 'today cut' : 'first cut'}
                  </Text>
                </View>
                <View style={styles.blockedStatDivider} />
                <View style={styles.blockedStat}>
                  <Text style={styles.blockedStatValue}>{compensationWindowLabel}</Text>
                  <Text style={styles.blockedStatLabel}>window</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={closeCheatBlockedDialog}
              style={styles.blockedDismissBtn}
            >
              <Text style={styles.blockedDismissText}>bet, finish this one first</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.42)',
    marginTop: 3,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  injuryModeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(22,163,74,0.08)',
    borderWidth: 1, borderColor: 'rgba(22,163,74,0.25)',
    borderRadius: 16, padding: 14, marginBottom: 12,
  },
  injuryModeBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  injuryModeIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(22,163,74,0.15)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(22,163,74,0.25)',
  },
  injuryModeBtnTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
  injuryModeBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  loadMgmtBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 16, padding: 14, marginBottom: 12,
  },
  loadMgmtBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  loadMgmtIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.15)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
  },
  loadMgmtBtnTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
  loadMgmtBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  deficitCyclingBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(37,99,235,0.08)',
    borderWidth: 1, borderColor: 'rgba(37,99,235,0.25)',
    borderRadius: 16, padding: 14, marginBottom: 12,
  },
  deficitCyclingBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  deficitCyclingIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(37,99,235,0.15)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(37,99,235,0.25)',
  },
  deficitCyclingBtnTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
  deficitCyclingBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  thermicEngineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,109,0,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,109,0,0.25)',
    borderRadius: 16, padding: 14, marginBottom: 12,
  },
  thermicEngineBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  thermicEngineIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,109,0,0.15)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,109,0,0.25)',
  },
  thermicEngineBtnTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
  thermicEngineBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  perspectiveCard: {
    borderRadius: 20, overflow: 'hidden', borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)', marginBottom: 14,
  },
  perspectiveGradient: { padding: 16 },
  perspectiveHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
  },
  perspectiveIconWrap: {
    width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(139,92,246,0.15)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)',
    marginRight: 10,
  },
  perspectiveEyebrow: {
    flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 0.2, color: '#C4B5FD',
  },
  perspectiveDismiss: {
    width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  perspectiveText: {
    fontSize: 13, lineHeight: 20, color: 'rgba(255,255,255,0.72)', fontWeight: '500',
  },
  cheatOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8,0,0,0.82)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  cheatOverlayScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 24,
  },
  cheatCard: {
    borderRadius: 30,
    padding: 22,
    backgroundColor: '#120204',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cheatIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,60,30,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,60,30,0.22)',
    marginBottom: 16,
  },
  cheatTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 6,
  },
  cheatSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.62)',
    marginBottom: 18,
  },
  cheatInputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  cheatInputBlock: {
    flex: 1,
  },
  cheatInputLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.48)',
    marginBottom: 8,
    fontWeight: '700',
  },
  cheatInput: {
    height: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  cheatInputUnit: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.34)',
    marginTop: 8,
    textAlign: 'center',
  },
  cheatPreviewCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 18,
  },
  cheatPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cheatPreviewEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#ff8f86',
  },
  cheatPreviewMeta: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '700',
  },
  cheatPreviewStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 12,
  },
  cheatPreviewStat: {
    width: '48%',
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cheatPreviewValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
  },
  cheatPreviewLabel: {
    marginTop: 4,
    fontSize: 10,
    color: 'rgba(255,255,255,0.36)',
    letterSpacing: 0.5,
  },
  cheatPreviewPlaceholder: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.42)',
  },
  cheatScheduleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  cheatScheduleChip: {
    minWidth: '22%',
    flexGrow: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,60,30,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,60,30,0.16)',
  },
  cheatScheduleChipMuted: {
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cheatScheduleDay: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  cheatScheduleDate: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.38)',
    marginTop: 3,
  },
  cheatScheduleValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '900',
    color: '#ffb4b0',
  },
  cheatScheduleMore: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '800',
  },
  cheatWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,60,30,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,60,30,0.18)',
  },
  cheatWarningText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: '#ffd3cf',
  },
  cheatActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cheatSecondaryBtn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cheatSecondaryText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '800',
  },
  cheatPrimaryBtn: {
    flex: 1.2,
    borderRadius: 18,
    overflow: 'hidden',
  },
  cheatPrimaryBtnDisabled: {
    opacity: 0.45,
  },
  cheatPrimaryGradient: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  cheatPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  logoutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8,0,0,0.76)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  logoutCard: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: '#160204',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  logoutIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,60,30,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,60,30,0.22)',
    marginBottom: 16,
  },
  logoutTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 6,
  },
  logoutSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.62)',
    marginBottom: 16,
  },
  logoutQuoteBox: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 18,
  },
  logoutQuoteEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#ff8f86',
    marginBottom: 8,
  },
  logoutQuoteText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#fff',
    fontWeight: '700',
  },
  logoutActions: {
    flexDirection: 'row',
    gap: 10,
  },
  logoutSecondaryBtn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  logoutSecondaryText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '800',
  },
  logoutPrimaryBtn: {
    flex: 1.1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  logoutPrimaryGradient: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  blockedStatsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    borderRadius: 20,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  blockedStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  blockedStatValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
  },
  blockedStatLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.36)',
    textAlign: 'center',
  },
  blockedStatDivider: {
    width: 1,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  blockedDismissBtn: {
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,60,30,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,60,30,0.2)',
  },
  blockedDismissText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  heroCard: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,60,30,0.18)',
    marginBottom: 14,
  },
  heroGradient: {
    padding: 20,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  heroEyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.38)',
    fontWeight: '700',
  },
  heroDate: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
    marginTop: 6,
  },
  heroStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(39,174,96,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(39,174,96,0.2)',
  },
  heroStatusChipAlert: {
    backgroundColor: 'rgba(255,60,30,0.14)',
    borderColor: 'rgba(255,60,30,0.22)',
  },
  heroStatusText: {
    color: '#a7f0ba',
    fontSize: 11,
    fontWeight: '700',
  },
  heroStatusTextCheat: {
    color: '#ffd5a8',
  },
  heroStatusTextAlert: {
    color: '#ffb4b0',
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  heroCopy: {
    flex: 1,
    paddingRight: 10,
  },
  heroValue: {
    fontSize: 54,
    lineHeight: 58,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1.4,
  },
  heroValueUnit: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.74)',
    fontWeight: '700',
    marginTop: 4,
  },
  heroCaption: {
    marginTop: 12,
    fontSize: 12,
    color: 'rgba(255,255,255,0.68)',
    lineHeight: 18,
  },
  heroSecondary: {
    marginTop: 4,
    fontSize: 11,
    color: 'rgba(255,255,255,0.42)',
  },
  heroRecoveryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,60,30,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,60,30,0.18)',
  },
  heroRecoveryPillActive: {
    backgroundColor: 'rgba(255,60,30,0.18)',
  },
  heroRecoveryText: {
    color: '#ffd3cf',
    fontSize: 11,
    fontWeight: '700',
  },
  ringWrap: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringPercent: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
  },
  ringLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  quickStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickStatCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  quickStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  quickStatLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.36)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  recoveryCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 14,
  },
  recoveryGradient: {
    padding: 18,
  },
  recoveryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  recoveryIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,60,30,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,60,30,0.18)',
  },
  recoveryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  recoveryCtaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  recoveryTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 8,
  },
  recoverySubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 16,
  },
  recoveryStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  recoveryStatCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  recoveryStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  recoveryStatLabel: {
    marginTop: 4,
    fontSize: 10,
    color: 'rgba(255,255,255,0.36)',
    letterSpacing: 0.5,
  },
  recoveryScheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recoveryScheduleTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  recoveryScheduleMeta: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
  },
  recoveryScheduleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recoveryDayChip: {
    minWidth: '22%',
    flexGrow: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  recoveryDayChipMuted: {
    justifyContent: 'center',
  },
  recoveryDayLabel: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '800',
  },
  recoveryDayDate: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.36)',
    marginTop: 3,
  },
  recoveryDayValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '900',
    color: '#ffb4b0',
  },
  recoveryMoreDays: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.58)',
    fontWeight: '800',
  },
  recoveryHint: {
    fontSize: 12,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.46)',
  },
  actionCardPrimary: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  actionPrimaryGradient: {
    minHeight: 150,
    padding: 18,
    justifyContent: 'space-between',
  },
  actionIconBoxPrimary: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  actionTitlePrimary: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  actionSubPrimary: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    lineHeight: 18,
  },
  actionCardSecondary: {
    flex: 1,
    minHeight: 150,
    borderRadius: 22,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'space-between',
  },
  actionIconBoxSecondary: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,60,30,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,60,30,0.18)',
  },
  actionTitleSecondary: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  actionSubSecondary: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 12,
    lineHeight: 18,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: 0.3,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 10,
  },
  macroCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 8,
  },
  macroIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  macroLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
  },
  weightHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  weightStat: {
    flex: 1,
    alignItems: 'center',
  },
  weightStatLabel: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 6,
    fontWeight: '700',
  },
  weightStatValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  weightStatUnit: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.44)',
  },
  weightCenter: {
    flex: 1.35,
    alignItems: 'center',
  },
  weightCurrentValue: {
    fontSize: 46,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
  },
  weightCurrentUnit: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: -4,
  },
  weightDeltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
  },
  weightDeltaText: {
    fontSize: 11,
    fontWeight: '700',
  },
  weightTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    marginBottom: 8,
  },
  weightFill: {
    height: '100%',
    borderRadius: 3,
  },
  weightThumb: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 2.5,
    marginLeft: -8,
  },
  weightLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weightLabelText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
  weightLabelCenter: {
    fontSize: 11,
    fontWeight: '700',
  },
  weightSummaryText: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.48)',
    textAlign: 'center',
  },
  planGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  planTile: {
    width: '48%',
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 6,
  },
  planTileValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  planTileLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 0.4,
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  profileItem: {
    width: '48%',
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 6,
  },
  profileValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  profileLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: 0.4,
  },
  adherenceCard: {
    borderRadius: 20, overflow: 'hidden', borderWidth: 1,
    borderColor: 'rgba(251,146,60,0.2)', marginBottom: 14,
  },
  adherenceGradient: { padding: 16 },
  adherenceHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8,
  },
  adherenceIconWrap: {
    width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(251,146,60,0.15)', borderWidth: 1, borderColor: 'rgba(251,146,60,0.25)',
  },
  adherenceEyebrow: {
    flex: 1, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, color: '#FB923C',
  },
  adherenceBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: 'rgba(251,146,60,0.15)', borderWidth: 1, borderColor: 'rgba(251,146,60,0.25)',
  },
  adherenceBadgeText: {
    fontSize: 10, fontWeight: '700', color: '#FB923C',
  },
  adherenceDismiss: {
    width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  adherenceText: {
    fontSize: 13, lineHeight: 20, color: 'rgba(255,255,255,0.72)', fontWeight: '500',
  },
  // ── Protein Badge Card ──────────────────────────────────────────────────────
  badgeCard: {
    borderRadius: 20, overflow: 'hidden', borderWidth: 1, marginBottom: 14,
  },
  badgeCardGrad: { padding: 16 },
  badgeCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14,
  },
  badgeCardEyebrow: { flex: 1, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  badgeMainRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  badgeMedallion: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 2.5,
    overflow: 'hidden',
    shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  badgeMedallionGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  badgeMedallionEmoji: { fontSize: 28 },
  badgeInfo: { flex: 1 },
  badgeName: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  badgeSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 16 },
  badgeStreakRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  badgeStreakChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  badgeShieldChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(252,211,77,0.08)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(252,211,77,0.2)',
  },
  badgeStreakEmoji: { fontSize: 13 },
  badgeStreakVal: { fontSize: 13, fontWeight: '800', color: '#fff' },
  badgeStreakLbl: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  badgeProgressWrap: { marginBottom: 10 },
  badgeProgressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  badgeProgressLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: '600' },
  badgeProgressBg: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  badgeProgressFill: { height: '100%', borderRadius: 3 },
  badgeProteinWrap: {},
  badgeProteinLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  badgeProteinLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: '600' },
  badgeProteinVal: { fontSize: 10, fontWeight: '700' },
  badgeProteinBg: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  badgeProteinFill: { height: '100%', borderRadius: 3 },

  // ── Badge Hierarchy Modal ────────────────────────────────────────────────────
  bhHeader: { alignItems: 'center', paddingTop: 56, paddingBottom: 8, paddingHorizontal: 24 },
  bhClose: {
    position: 'absolute', top: 52, left: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center',
  },
  bhTitle: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  bhSub: { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4, letterSpacing: 1 },
  bhHero: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  bhHeroMedallion: {
    width: 110, height: 110, borderRadius: 55, borderWidth: 3,
    overflow: 'hidden', marginBottom: 14,
    shadowOpacity: 0.9, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 16,
  },
  bhHeroMedallionGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bhHeroEmoji: { fontSize: 48 },
  bhHeroName: { fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  bhHeroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4, textAlign: 'center' },
  bhStatsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  bhStatChip: {
    flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  bhStatEmoji: { fontSize: 18, marginBottom: 4 },
  bhStatVal: { fontSize: 16, fontWeight: '900', color: '#fff' },
  bhStatLbl: { fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  bhHeroProgress: { width: '100%', marginTop: 20 },
  bhProgressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  bhProgressLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  bhProgressBg: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)' },
  bhProgressFill: { height: '100%', borderRadius: 4 },
  bhProgressNote: { fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 8 },
  bhDividerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginVertical: 16,
  },
  bhDividerLine: { flex: 1, height: 0.8, backgroundColor: 'rgba(255,255,255,0.08)' },
  bhDividerLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2, color: 'rgba(255,255,255,0.2)' },
  bhBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 18, borderWidth: 1, padding: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  bhRowMedallion: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 2, overflow: 'hidden',
  },
  bhRowMedallionGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bhRowEmoji: { fontSize: 22 },
  bhRowName: { fontSize: 15, fontWeight: '800' },
  bhCurrentPill: {
    borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2,
  },
  bhCurrentPillText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  bhRowSubtitle: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  bhRowScore: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  bhShieldInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginHorizontal: 20, marginTop: 20,
    backgroundColor: 'rgba(252,211,77,0.06)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(252,211,77,0.15)',
  },
  bhShieldEmoji: { fontSize: 20 },
  bhShieldText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 18 },

  nbCheckCard: {
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 16, marginBottom: 16, gap: 14,
  },
  nbCheckRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  nbCheckText: {
    flex: 1, fontSize: 13, lineHeight: 18,
    color: 'rgba(255,255,255,0.6)', fontWeight: '500',
  },
  nbCheckBtns: {
    flexDirection: 'row', gap: 10,
  },
  nbCheckBtnGood: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: 'rgba(74,222,128,0.15)',
    borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)',
  },
  nbCheckBtnGoodText: {
    color: '#4ADE80', fontSize: 13, fontWeight: '800', letterSpacing: 0.5,
  },
  nbCheckBtnOver: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: 'rgba(251,146,60,0.15)',
    borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(251,146,60,0.3)',
  },
  nbCheckBtnOverText: {
    fontSize: 14, fontWeight: '700', color: '#FB923C',
  },
});
