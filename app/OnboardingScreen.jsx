import { useState, useEffect } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import AppAlertDialog from '../components/ui/AppAlertDialog';
import useAppDialog from '../hooks/useAppDialog';

const ACTIVITY_DATA = {
  Weightlifting: { iconName: 'weight-lifter', color: '#ff4030', desc: 'Strength & muscle building', caloriesPerHour: 400, hasSubOptions: false },
  Running: { iconName: 'run-fast', color: '#e67e22', desc: 'Outdoor or treadmill', caloriesPerHour: 600, hasSubOptions: false },
  Walking: { iconName: 'walk', color: '#27ae60', desc: 'Casual or brisk walking', caloriesPerHour: 280, hasSubOptions: false },
  Cycling: { iconName: 'bike', color: '#2980b9', desc: 'Road, mountain or stationary', caloriesPerHour: 500, hasSubOptions: false },
  Yoga: { iconName: 'yoga', color: '#8e44ad', desc: 'Flexibility & mindfulness', caloriesPerHour: 250, hasSubOptions: false },
  HIIT: { iconName: 'fire', color: '#e74c3c', desc: 'High intensity intervals', caloriesPerHour: 650, hasSubOptions: false },
  Sports: {
    iconName: 'trophy-outline', color: '#16a085', desc: 'Pick your sport below', caloriesPerHour: 0, hasSubOptions: true,
    subOptions: [
      { name: 'Football/Soccer', iconName: 'soccer', caloriesPerHour: 600 },
      { name: 'Basketball', iconName: 'basketball', caloriesPerHour: 550 },
      { name: 'Boxing', iconName: 'boxing-glove', caloriesPerHour: 700 },
      { name: 'Swimming', iconName: 'swim', caloriesPerHour: 500 },
      { name: 'Tennis', iconName: 'tennis', caloriesPerHour: 450 },
      { name: 'Cricket', iconName: 'cricket', caloriesPerHour: 350 },
      { name: 'Badminton', iconName: 'badminton', caloriesPerHour: 400 },
      { name: 'Volleyball', iconName: 'volleyball', caloriesPerHour: 350 },
    ],
  },
};

const STEP_META = {
  1: {
    label: 'Profile',
    caption: 'Your baseline',
    title: 'Enter the Quasar',
    subtitle: 'Lock in the basics we need to estimate your metabolism and starting point.',
    icon: 'account-circle-outline',
  },
  2: {
    label: 'Goal',
    caption: 'Your target',
    title: 'Set the finish line',
    subtitle: 'Choose the weight and timeline you want, then we will check whether the pace makes sense.',
    icon: 'target',
  },
  3: {
    label: 'Activity',
    caption: 'Your plan',
    title: 'Shape the calorie plan',
    subtitle: 'Add your training so the final target matches how you actually live.',
    icon: 'arm-flex-outline',
  },
};

const formatDisplayDate = (value) => value.toLocaleDateString('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export default function OnboardingScreen() {
  const [step, setStep] = useState(1);
  const { showDialog, dialogProps } = useAppDialog();

  const [name, setName] = useState('');
  const [dob, setDob] = useState(new Date(2000, 0, 1));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');

  const [goalWeight, setGoalWeight] = useState('');
  const [targetWeeks, setTargetWeeks] = useState('');
  const [deficitWarning, setDeficitWarning] = useState('');
  const [suggestedWeeks, setSuggestedWeeks] = useState('');
  const [planChecked, setPlanChecked] = useState(false);

  const [expandedActivity, setExpandedActivity] = useState(null);
  const [activitySettings, setActivitySettings] = useState({});
  const [showPlanSummary, setShowPlanSummary] = useState(false);
  const [planSummary, setPlanSummary] = useState(null);
  // when deficit > 500, show an inline choice card instead of Alert
  const [showDeficitChoice, setShowDeficitChoice] = useState(false);
  const [pendingDeficitData, setPendingDeficitData] = useState(null);

  // When user returns to Step 2 from Step 3, auto-refresh the deficit display
  // so workout calories are immediately reflected without re-tapping "check my plan"
  useEffect(() => {
    if (step !== 2 || !planChecked || !goalWeight || !targetWeeks || !weight) return;
    const current = parseFloat(weight);
    const goal = parseFloat(goalWeight);
    const weeks = parseFloat(targetWeeks);
    if (!current || !goal || !weeks || goal >= current) return;

    const excessKg = current - goal;
    const rawDailyDeficit = (excessKg * 7700) / (weeks * 7);

    // calculateWorkoutCalories is defined later but JS hoisting handles this at runtime
    let dailyAvg = 0;
    let weeklyTotal = 0;
    Object.entries(activitySettings).forEach(([actName, settings]) => {
      const actData = ACTIVITY_DATA[actName];
      if (!actData) return;
      let cph = actData.caloriesPerHour;
      if (actData.hasSubOptions && settings.selectedSport) {
        const sport = actData.subOptions.find(s => s.name === settings.selectedSport);
        if (sport) cph = sport.caloriesPerHour;
      }
      weeklyTotal += Math.round(cph * (settings.hoursPerDay || 1) * (settings.daysPerWeek || 3));
    });
    dailyAvg = Math.round(weeklyTotal / 7);

    const hasWorkouts = Object.keys(activitySettings).length > 0;
    const effectiveDietDeficit = Math.max(0, rawDailyDeficit - dailyAvg);

    if (rawDailyDeficit > 500) {
      const safeWeeks = Math.ceil((excessKg * 7700) / (500 * 7));
      setDeficitWarning(`This timeline needs about ${Math.round(rawDailyDeficit)} kcal/day of total deficit, which is more aggressive than we recommend.`);
      setSuggestedWeeks(
        hasWorkouts
          ? `Your workouts cover about ${dailyAvg} kcal/day, so food only needs to handle ${Math.round(effectiveDietDeficit)} kcal/day. A safer no-workout pace would land closer to ${safeWeeks} weeks.`
          : `A safer pace would be around ${safeWeeks} weeks if you keep the deficit near 500 kcal/day.`
      );
    } else {
      setDeficitWarning('');
      setSuggestedWeeks(
        hasWorkouts
          ? `The pace looks reasonable. Your workouts cover about ${dailyAvg} kcal/day, so your food cut only needs to be ${Math.round(effectiveDietDeficit)} kcal/day.`
          : `The pace looks reasonable at about ${Math.round(rawDailyDeficit)} kcal/day of total deficit.`
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, activitySettings]);

  const toggleActivity = (activityName) => {
    setExpandedActivity(expandedActivity === activityName ? null : activityName);
    if (!activitySettings[activityName]) {
      setActivitySettings(prev => ({ ...prev, [activityName]: { daysPerWeek: 3, hoursPerDay: 1, selectedSport: null } }));
    }
  };

  const updateSetting = (activityName, key, value) => {
    setActivitySettings(prev => ({ ...prev, [activityName]: { ...prev[activityName], [key]: value } }));
    // Reset plan summary when settings change
    setShowPlanSummary(false);
    setPlanSummary(null);
  };

  const isActivitySelected = (name) => !!activitySettings[name];

  const removeActivity = (name) => {
    const updated = { ...activitySettings };
    delete updated[name];
    setActivitySettings(updated);
    if (expandedActivity === name) setExpandedActivity(null);
    setShowPlanSummary(false);
    setPlanSummary(null);
  };

  const calculateAge = (dob) => {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  };

  const calculateDeficit = () => {
    const current = parseFloat(weight);
    const goal = parseFloat(goalWeight);
    const weeks = parseFloat(targetWeeks);
    if (!current || !goal || !weeks) {
      showDialog({
        title: 'Almost there',
        message: 'Fill in your current weight, goal weight, and target weeks first.',
        variant: 'warning',
      });
      return;
    }
    if (goal >= current) {
      showDialog({
        title: 'Update goal weight',
        message: 'Goal weight needs to be lower than your current weight.',
        variant: 'warning',
      });
      return;
    }

    const excessKg = current - goal;
    const rawDailyDeficit = (excessKg * 7700) / (weeks * 7);

    // If workouts already selected (came back from Step 3), factor them in
    const { dailyAverageFromWorkouts } = calculateWorkoutCalories();
    const hasWorkouts = Object.keys(activitySettings).length > 0;

    // Effective diet deficit = how much food restriction is actually needed
    // (workout burn covers part of the total deficit)
    const effectiveDietDeficit = Math.max(0, rawDailyDeficit - dailyAverageFromWorkouts);

    setPlanChecked(true);

    if (rawDailyDeficit > 500) {
      const safeWeeks = Math.ceil((excessKg * 7700) / (500 * 7));
      setDeficitWarning(`This timeline needs about ${Math.round(rawDailyDeficit)} kcal/day of total deficit, which is more aggressive than we recommend.`);
      if (hasWorkouts) {
        setSuggestedWeeks(
          `Your workouts cover about ${dailyAverageFromWorkouts} kcal/day, so food only needs to handle ${Math.round(effectiveDietDeficit)} kcal/day. A safer no-workout pace would land closer to ${safeWeeks} weeks.`
        );
      } else {
        setSuggestedWeeks(`A safer pace would be around ${safeWeeks} weeks if you keep the deficit near 500 kcal/day.`);
      }
    } else {
      setDeficitWarning('');
      if (hasWorkouts) {
        setSuggestedWeeks(
          `The pace looks reasonable. Your workouts cover about ${dailyAverageFromWorkouts} kcal/day, so your food cut only needs to be ${Math.round(effectiveDietDeficit)} kcal/day.`
        );
      } else {
        setSuggestedWeeks(`The pace looks reasonable at about ${Math.round(rawDailyDeficit)} kcal/day of total deficit.`);
      }
    }
  };

  /**
   * Calculate total weekly calories burned from all selected workouts.
   * Returns { weeklyCaloriesBurned, dailyAverageFromWorkouts, breakdown[] }
   */
  const calculateWorkoutCalories = () => {
    let weeklyTotal = 0;
    const breakdown = [];

    Object.entries(activitySettings).forEach(([actName, settings]) => {
      const actData = ACTIVITY_DATA[actName];
      if (!actData) return;

      let cph = actData.caloriesPerHour;
      if (actData.hasSubOptions && settings.selectedSport) {
        const sport = actData.subOptions.find(s => s.name === settings.selectedSport);
        if (sport) cph = sport.caloriesPerHour;
      }

      const days = settings.daysPerWeek || 3;
      const hours = settings.hoursPerDay || 1;
      const weeklyBurned = Math.round(cph * hours * days);
      weeklyTotal += weeklyBurned;

      breakdown.push({
        name: settings.selectedSport ? `${actName} (${settings.selectedSport})` : actName,
        days,
        hours,
        weeklyBurned,
        color: actData.color,
      });
    });

    return {
      weeklyCaloriesBurned: weeklyTotal,
      dailyAverageFromWorkouts: Math.round(weeklyTotal / 7),
      breakdown,
    };
  };

  /**
   * Step 3 "View Plan"
   *
   * Correct deficit math:
   *   totalDeficit   = (excessKg × 7700) / (weeks × 7)          ← what must happen per day
   *   workoutBurn    = daily average from selected activities
   *   foodDeficit    = totalDeficit − workoutBurn                ← how much to cut from eating
   *   dailyCalTarget = sedentaryTDEE − foodDeficit               ← what to eat each day
   *
   * If totalDeficit > 500 kcal/day we show an inline choice card (no Alert).
   */
  const handleViewPlan = () => {
    const age = calculateAge(dob);
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const gw = parseFloat(goalWeight);
    const weeks = parseFloat(targetWeeks);

    const bmr = gender === 'Male'
      ? Math.round(10 * w + 6.25 * h - 5 * age + 5)
      : Math.round(10 * w + 6.25 * h - 5 * age - 161);

    const sedentaryTDEE = Math.round(bmr * 1.2);
    const excessKg = w - gw;
    const rawDailyDeficit = Math.round((excessKg * 7700) / (weeks * 7));

    const { weeklyCaloriesBurned, dailyAverageFromWorkouts, breakdown } = calculateWorkoutCalories();

    // foodDeficit = how much you actually need to eat less (workouts cover the rest)
    const foodDeficit = Math.max(0, rawDailyDeficit - dailyAverageFromWorkouts);
    const dailyCalTarget = Math.round(sedentaryTDEE - foodDeficit);

    const safeWeeks = Math.ceil((excessKg * 7700) / (500 * 7));

    const base = {
      bmr, sedentaryTDEE, w, gw, excessKg,
      dailyAverageFromWorkouts,
      weeklyCaloriesBurned,
      workoutBreakdown: breakdown,
      hasWorkouts: breakdown.length > 0,
    };

    if (rawDailyDeficit > 500) {
      // Don't show plan yet — show inline choice card
      setShowDeficitChoice(true);
      setShowPlanSummary(false);
      setPendingDeficitData({
        ...base,
        rawDailyDeficit,
        safeWeeks,
        weeks,
        // pre-compute both options
        safe: {
          totalDeficit: 500,
          foodDeficit: Math.max(0, 500 - dailyAverageFromWorkouts),
          dailyCalTarget: Math.round(sedentaryTDEE - Math.max(0, 500 - dailyAverageFromWorkouts)),
          targetWeeks: safeWeeks,
        },
        hard: {
          totalDeficit: rawDailyDeficit,
          foodDeficit,
          dailyCalTarget,
          targetWeeks: weeks,
        },
      });
    } else {
      setShowDeficitChoice(false);
      setPlanSummary({
        ...base,
        totalDeficit: rawDailyDeficit,
        foodDeficit,
        dailyCalTarget,
        targetWeeks: weeks,
      });
      setShowPlanSummary(true);
    }
  };

  const confirmDeficitChoice = (option) => {
    const d = pendingDeficitData;
    const chosen = option === 'safe' ? d.safe : d.hard;
    setPlanSummary({
      bmr: d.bmr, sedentaryTDEE: d.sedentaryTDEE,
      w: d.w, gw: d.gw, excessKg: d.excessKg,
      dailyAverageFromWorkouts: d.dailyAverageFromWorkouts,
      weeklyCaloriesBurned: d.weeklyCaloriesBurned,
      workoutBreakdown: d.workoutBreakdown,
      hasWorkouts: d.hasWorkouts,
      totalDeficit: chosen.totalDeficit,
      foodDeficit: chosen.foodDeficit,
      dailyCalTarget: chosen.dailyCalTarget,
      targetWeeks: chosen.targetWeeks,
    });
    setShowDeficitChoice(false);
    setShowPlanSummary(true);
  };

  const handleFinish = async () => {
    if (!planSummary) return;
    const age = calculateAge(dob);
    try {
      const userId = auth.currentUser.uid;
      const now = new Date();
      const endDate = new Date(now.getTime() + planSummary.targetWeeks * 7 * 86400000);
      await setDoc(doc(db, 'users', userId, 'profile', 'data'), {
        name, dob: dob.toISOString(), age, gender,
        height: parseFloat(height),
        weight: planSummary.w,
        goalWeight: planSummary.gw,
        targetWeeks: planSummary.targetWeeks,
        targetEndDate: endDate.toISOString(),
        activitySettings,
        bmr: planSummary.bmr,
        tdee: planSummary.sedentaryTDEE,           
        sedentaryTDEE: planSummary.sedentaryTDEE,
        dailyCalorieTarget: planSummary.dailyCalTarget,
        foodDeficit: planSummary.foodDeficit,
        dailyDeficit: planSummary.totalDeficit,    
        totalDailyDeficit: planSummary.totalDeficit,
        weeklyWorkoutCalories: planSummary.weeklyCaloriesBurned,
        onboardingComplete: true,
        createdAt: now.toISOString(),
      });
      // REMOVED router.replace('/(tabs)')
      // _layout.jsx will instantly detect onboardingComplete: true
      // and automatically transport you to tabs!
    } catch (error) {
      showDialog({
        title: 'Could not save onboarding',
        message: error.message,
        variant: 'error',
      });
    }
  };

  const currentWeightValue = parseFloat(weight);
  const goalWeightValue = parseFloat(goalWeight);
  const targetWeeksValue = parseFloat(targetWeeks);
  const goalGap = Number.isFinite(currentWeightValue) && Number.isFinite(goalWeightValue)
    ? Math.max(currentWeightValue - goalWeightValue, 0)
    : 0;
  const weeklyGoalRate = goalGap > 0 && Number.isFinite(targetWeeksValue) && targetWeeksValue > 0
    ? (goalGap / targetWeeksValue).toFixed(1)
    : null;
  const workoutPreview = calculateWorkoutCalories();
  const selectedActivityCount = Object.keys(activitySettings).length;
  const currentStepMeta = STEP_META[step];

  const renderStepIntro = (iconName, eyebrow, title, subtitle) => (
    <View style={styles.stepIntro}>
      <View style={styles.stepIntroIcon}>
        <MaterialCommunityIcons name={iconName} size={22} color="#ff6b5f" />
      </View>
      <View style={styles.stepIntroCopy}>
        <Text style={styles.stepEyebrow}>{eyebrow}</Text>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepSub}>{subtitle}</Text>
      </View>
    </View>
  );

  const renderSectionHeader = (iconName, title, subtitle) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderIcon}>
        <MaterialCommunityIcons name={iconName} size={18} color="#ff6b5f" />
      </View>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionHeaderTitle}>{title}</Text>
        <Text style={styles.sectionHeaderSub}>{subtitle}</Text>
      </View>
    </View>
  );

  // ─── Step Renders ───────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <View>
      {renderStepIntro(
        'account-heart-outline',
        'PROFILE',
        'Tell us about yourself',
        'These basics help us estimate your baseline calories and keep the plan personal.'
      )}

      <View style={styles.formSection}>
        {renderSectionHeader(
          'badge-account-horizontal-outline',
          'Identity',
          'The details we will use across the app'
        )}

        <Text style={styles.label}>Full Name</Text>
        <TextInput
          autoCapitalize="words"
          style={styles.input}
          placeholder="Your Name"
          placeholderTextColor="rgba(255,190,175,0.38)"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Date of Birth</Text>
        <TouchableOpacity style={styles.inputButton} onPress={() => setShowDatePicker(true)}>
          <View style={styles.inputButtonRow}>
            <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#cc2020" />
            <Text style={styles.inputButtonText}>{formatDisplayDate(dob)}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker value={dob} mode="date" maximumDate={new Date()}
          onChange={(event, date) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (date) setDob(date);
          }} />
      )}

      <View style={styles.formSection}>
        {renderSectionHeader(
          'human-male-height-variant',
          'Body Stats',
          'A few details so your target starts from the right baseline'
        )}

        <Text style={styles.label}>Gender</Text>
        <View style={styles.genderRow}>
          {['Male', 'Female', 'Other'].map((g) => (
            <TouchableOpacity key={g}
              style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
              onPress={() => setGender(g)}>
              <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>
                {g}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricField}>
            <Text style={styles.label}>Height</Text>
            <View style={styles.metricInputWrap}>
              <TextInput
                style={styles.metricInput}
                placeholder="175"
                placeholderTextColor="rgba(255,190,175,0.38)"
                value={height}
                onChangeText={setHeight}
                keyboardType="numeric"
              />
              <Text style={styles.metricUnit}>cm</Text>
            </View>
          </View>

          <View style={styles.metricField}>
            <Text style={styles.label}>Weight</Text>
            <View style={styles.metricInputWrap}>
              <TextInput
                style={styles.metricInput}
                placeholder="75"
                placeholderTextColor="rgba(255,190,175,0.38)"
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
              />
              <Text style={styles.metricUnit}>kg</Text>
            </View>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.button} onPress={() => {
        if (!name || !gender || !height || !weight) {
          showDialog({
            title: 'Complete your profile',
            message: 'Fill in your name, gender, height, and current weight first.',
            variant: 'warning',
          });
          return;
        }
        setStep(2);
      }}>
        <LinearGradient colors={['#ff6b5f', '#e3342b', '#8f1418']} style={styles.buttonGradient}>
          <View style={styles.buttonContent}>
            <Text style={styles.buttonText}>Continue to goal</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View>
      {renderStepIntro(
        'target',
        'GOAL',
        'Set the finish line',
        'Choose the weight and timeline you want, then we will check whether the pace makes sense.'
      )}

      <LinearGradient colors={['#210305', '#451016', '#9e1f23']} style={styles.goalHero}>
        <View style={styles.goalHeroTop}>
          <View style={styles.goalStat}>
            <Text style={styles.goalStatLabel}>Current</Text>
            <Text style={styles.goalStatValue}>
              {Number.isFinite(currentWeightValue) ? `${currentWeightValue} kg` : '--'}
            </Text>
          </View>

          <MaterialCommunityIcons name="arrow-right-thin" size={36} color="rgba(255,255,255,0.72)" />

          <View style={styles.goalStat}>
            <Text style={styles.goalStatLabel}>Goal</Text>
            <Text style={styles.goalStatValue}>
              {Number.isFinite(goalWeightValue) ? `${goalWeightValue} kg` : '--'}
            </Text>
          </View>
        </View>

        <View style={styles.goalHeroMetaRow}>
          <View style={styles.goalHeroPill}>
            <Text style={styles.goalHeroPillText}>
              {goalGap > 0 ? `${goalGap.toFixed(1)} kg to lose` : 'Set a goal weight to see the journey'}
            </Text>
          </View>

          {weeklyGoalRate ? (
            <View style={styles.goalHeroPill}>
              <Text style={styles.goalHeroPillText}>About {weeklyGoalRate} kg/week</Text>
            </View>
          ) : null}
        </View>
      
      </LinearGradient>
      

      <View style={styles.formSection}>
        {renderSectionHeader(
          'calendar-range',
          'Target Details',
          'The app turns this into a daily calorie target'
        )}

        <View style={styles.metricRow}>
          <View style={styles.metricField}>
            <Text style={styles.label}>Goal Weight</Text>
            <View style={styles.metricInputWrap}>
              <TextInput
                style={styles.metricInput}
                placeholder="65"
                placeholderTextColor="rgba(255,190,175,0.38)"
                value={goalWeight}
                onChangeText={(v) => { setGoalWeight(v); setPlanChecked(false); setDeficitWarning(''); setSuggestedWeeks(''); }}
                keyboardType="numeric"
              />
              <Text style={styles.metricUnit}>kg</Text>
            </View>
          </View>

          <View style={styles.metricField}>
            <Text style={styles.label}>Timeline</Text>
            <View style={styles.metricInputWrap}>
              <TextInput
                style={styles.metricInput}
                placeholder="12"
                placeholderTextColor="rgba(255,190,175,0.38)"
                value={targetWeeks}
                onChangeText={(v) => { setTargetWeeks(v); setPlanChecked(false); setDeficitWarning(''); setSuggestedWeeks(''); }}
                keyboardType="numeric"
              />
              <Text style={styles.metricUnit}>wks</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.checkButton} onPress={calculateDeficit}>
          <MaterialCommunityIcons name="calculator-variant-outline" size={18} color="#cc2020" />
          <Text style={styles.checkButtonText}>Check my plan</Text>
        </TouchableOpacity>
      </View>

      {deficitWarning ? (
        <View style={[styles.warningBox, styles.warningBoxAlert]}>
          <View style={styles.feedbackHeader}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#b23a30" />
            <Text style={styles.feedbackTitle}>Timeline needs a second look</Text>
          </View>
          <Text style={styles.warningText}>{deficitWarning}</Text>
          <Text style={styles.suggestionText}>{suggestedWeeks}</Text>
        </View>
      ) : suggestedWeeks ? (
        <View style={[styles.warningBox, styles.warningBoxSuccess]}>
          <View style={styles.feedbackHeader}>
            <MaterialCommunityIcons name="check-circle-outline" size={18} color="#1f7a43" />
            <Text style={styles.feedbackTitle}>This pace looks solid</Text>
          </View>
          <Text style={styles.suggestionText}>{suggestedWeeks}</Text>
        </View>
      ) : null}

      {planChecked && (
        <View style={styles.infoNote}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={16} color="#1565C0" />
          <Text style={styles.infoNoteText}>
            Step 3 adds your workouts and reveals the final calorie target you should follow each day.
          </Text>
        </View>
      )}

      <View style={styles.rowButtons}>
        <TouchableOpacity style={styles.backButton} onPress={() => setStep(1)}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={() => {
          if (!goalWeight || !targetWeeks) {
            showDialog({
              title: 'Complete your goal',
              message: 'Fill in goal weight and target weeks first.',
              variant: 'warning',
            });
            return;
          }
          if (parseFloat(goalWeight) >= parseFloat(weight)) {
            showDialog({
              title: 'Update goal weight',
              message: 'Goal weight needs to be lower than your current weight.',
              variant: 'warning',
            });
            return;
          }
          if (!planChecked) {
            showDialog({
              title: 'Check the pace first',
              message: 'Use "Check my plan" once so we can validate the deficit before you continue.',
              variant: 'warning',
            });
            return;
          }
          setStep(3);
        }}>
          <LinearGradient colors={['#ff6b5f', '#e3342b', '#8f1418']} style={styles.buttonGradient}>
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>Continue to activity</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View>
      {renderStepIntro(
        'arm-flex-outline',
        'ACTIVITY',
        'Add your weekly training',
        'A little activity can meaningfully reduce how much of the deficit has to come from food.'
      )}

      <View style={styles.activitySummaryCard}>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryStatValue}>{selectedActivityCount}</Text>
          <Text style={styles.summaryStatLabel}>Selected</Text>
        </View>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryStatValue}>{workoutPreview.dailyAverageFromWorkouts}</Text>
          <Text style={styles.summaryStatLabel}>Avg kcal/day</Text>
        </View>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryStatValue}>{workoutPreview.weeklyCaloriesBurned}</Text>
          <Text style={styles.summaryStatLabel}>Kcal/week</Text>
        </View>
      </View>

      {Object.entries(ACTIVITY_DATA).map(([actName, actData]) => {
        const isSelected = isActivitySelected(actName);
        const isExpanded = expandedActivity === actName;
        const settings = activitySettings[actName] || {};
        const selectedSport = actData.hasSubOptions && settings.selectedSport
          ? actData.subOptions.find((sport) => sport.name === settings.selectedSport)
          : null;
        const caloriesPerHour = selectedSport?.caloriesPerHour || actData.caloriesPerHour || 400;
        const estimatedWeeklyBurn = Math.round(
          caloriesPerHour * (settings.hoursPerDay || 1) * (settings.daysPerWeek || 3)
        );

        return (
          <View key={actName} style={[styles.activityCard, isSelected && styles.activityCardSelected]}>
            <TouchableOpacity
              style={styles.activityHeader}
              activeOpacity={0.92}
              onPress={() => isSelected ? setExpandedActivity(isExpanded ? null : actName) : toggleActivity(actName)}
            >
              <View style={[styles.activityIconBox, { backgroundColor: actData.color + '22' }]}>
                <MaterialCommunityIcons name={actData.iconName} size={26} color={actData.color} />
              </View>
              <View style={styles.activityCopy}>
                <View style={styles.activityTitleRow}>
                  <Text style={styles.activityName}>{actName}</Text>
                  {isSelected ? (
                    <View style={[styles.statusPill, { backgroundColor: actData.color + '14', borderColor: actData.color + '35' }]}>
                      <Text style={[styles.statusPillText, { color: actData.color }]}>Added</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.activityDesc}>
                  {isSelected
                    ? `${actData.hasSubOptions && settings.selectedSport ? `${settings.selectedSport}  |  ` : ''}${settings.daysPerWeek}x/week  |  ${settings.hoursPerDay}h/session`
                    : actData.desc}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={isSelected ? (isExpanded ? 'chevron-up' : 'chevron-down') : 'plus'}
                size={22}
                color={isSelected ? actData.color : '#cc2020'}
              />
            </TouchableOpacity>

            {isSelected && isExpanded && (
              <View style={styles.activityExpanded}>
                <View style={styles.divider} />
                <Text style={styles.settingLabel}>Days per week</Text>
                <View style={styles.sliderRow}>
                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                    <TouchableOpacity key={d}
                      style={[styles.dayBtn, settings.daysPerWeek === d && { backgroundColor: actData.color }]}
                      onPress={() => updateSetting(actName, 'daysPerWeek', d)}>
                      <Text style={[styles.dayBtnText, settings.daysPerWeek === d && { color: '#fff' }]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.settingLabel}>Hours per session</Text>
                <View style={styles.sliderRow}>
                  {[0.5, 1, 1.5, 2, 2.5, 3].map(h => (
                    <TouchableOpacity key={h}
                      style={[styles.dayBtn, settings.hoursPerDay === h && { backgroundColor: actData.color }]}
                      onPress={() => updateSetting(actName, 'hoursPerDay', h)}>
                      <Text style={[styles.dayBtnText, settings.hoursPerDay === h && { color: '#fff' }]}>{h}h</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {actData.hasSubOptions && (
                  <>
                    <Text style={styles.settingLabel}>Select your sport</Text>
                    <View style={styles.sportsGrid}>
                      {actData.subOptions.map(sport => (
                        <TouchableOpacity key={sport.name}
                          style={[styles.sportChip, settings.selectedSport === sport.name && { backgroundColor: actData.color, borderColor: actData.color }]}
                          onPress={() => updateSetting(actName, 'selectedSport', sport.name)}>
                          <MaterialCommunityIcons name={sport.iconName} size={18} color={settings.selectedSport === sport.name ? '#fff' : 'rgba(255,210,200,0.62)'} />
                          <Text style={[styles.sportName, settings.selectedSport === sport.name && { color: '#fff' }]}>{sport.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                <View style={[styles.caloriePreview, { backgroundColor: actData.color + '12', borderColor: actData.color + '30' }]}>
                  <MaterialCommunityIcons name="fire" size={18} color={actData.color} />
                  <View style={styles.caloriePreviewCopy}>
                    <Text style={styles.caloriePreviewLabel}>Estimated weekly burn</Text>
                    <Text style={[styles.caloriePreviewValue, { color: actData.color }]}>
                      {estimatedWeeklyBurn} kcal
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => removeActivity(actName)} style={styles.removeActivityButton}>
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color="#b23a30" />
                  <Text style={styles.removeActivityText}>Remove activity</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}

      {Object.keys(activitySettings).length === 0 && (
        <View style={styles.noActivityHint}>
          <Text style={styles.noActivityTitle}>No activity added yet</Text>
          <Text style={styles.noActivityText}>
            Tap any activity above to include it in your calorie plan. Even a few weekly sessions can reduce how much of the deficit has to come from food.
          </Text>
        </View>
      )}

      {/* ── Deficit Choice Card (replaces Alert when deficit > 500) ────── */}
      {showDeficitChoice && pendingDeficitData && (
        <View style={styles.choiceCard}>
          <View style={styles.choiceCardHeader}>
            <MaterialCommunityIcons name="alert-circle" size={22} color="#ff4030" />
            <Text style={styles.choiceCardTitle}>  This timeline is pretty aggressive</Text>
          </View>

          {/* math breakdown */}
          <View style={styles.choiceMathRow}>
            <View style={styles.choiceMathItem}>
              <Text style={styles.choiceMathVal}>{pendingDeficitData.rawDailyDeficit}</Text>
              <Text style={styles.choiceMathLabel}>total deficit{'\n'}needed/day</Text>
            </View>
            <MaterialCommunityIcons name="minus" size={18} color="#aaa" style={{ marginTop: 8 }} />
            <View style={styles.choiceMathItem}>
              <Text style={[styles.choiceMathVal, { color: '#e67e22' }]}>{pendingDeficitData.dailyAverageFromWorkouts}</Text>
              <Text style={styles.choiceMathLabel}>workout burn{'\n'}avg/day</Text>
            </View>
            <MaterialCommunityIcons name="equal" size={18} color="#aaa" style={{ marginTop: 8 }} />
            <View style={styles.choiceMathItem}>
              <Text style={[styles.choiceMathVal, { color: '#ff4030' }]}>{pendingDeficitData.hard.foodDeficit}</Text>
              <Text style={styles.choiceMathLabel}>food cut{'\n'}needed/day</Text>
            </View>
          </View>

          <Text style={styles.choiceSubtext}>
            Even with your workouts, you would still need to cut {pendingDeficitData.hard.foodDeficit} kcal/day from food. Pick the pace that feels right for you:
          </Text>

          <View style={styles.choiceOptions}>
            {/* Safe option */}
            <TouchableOpacity style={styles.choiceOptionSafe} onPress={() => confirmDeficitChoice('safe')}>
              <Text style={styles.choiceOptionEmoji}>Safe</Text>
              <Text style={styles.choiceOptionTitle}>Stretch the timeline</Text>
              <Text style={styles.choiceOptionWeeks}>{pendingDeficitData.safeWeeks} weeks</Text>
              <View style={styles.choiceOptionCalBox}>
                <Text style={styles.choiceOptionCal}>{pendingDeficitData.safe.dailyCalTarget}</Text>
                <Text style={styles.choiceOptionCalUnit}>kcal/day</Text>
              </View>
              <Text style={styles.choiceOptionFormula}>
                500 deficit - {pendingDeficitData.dailyAverageFromWorkouts} workout = {pendingDeficitData.safe.foodDeficit} food cut
              </Text>
            </TouchableOpacity>

            {/* Hard option */}
            <TouchableOpacity style={styles.choiceOptionHard} onPress={() => confirmDeficitChoice('hard')}>
              <Text style={styles.choiceOptionEmoji}>Fast</Text>
              <Text style={[styles.choiceOptionTitle, { color: '#ff4030' }]}>Keep the faster pace</Text>
              <Text style={[styles.choiceOptionWeeks, { color: '#ff4030' }]}>{Math.round(pendingDeficitData.weeks)} weeks</Text>
              <View style={[styles.choiceOptionCalBox, { backgroundColor: 'rgba(255,64,48,0.10)' }]}>
                <Text style={[styles.choiceOptionCal, { color: '#ff4030' }]}>{pendingDeficitData.hard.dailyCalTarget}</Text>
                <Text style={styles.choiceOptionCalUnit}>kcal/day</Text>
              </View>
              <Text style={styles.choiceOptionFormula}>
                {pendingDeficitData.rawDailyDeficit} deficit - {pendingDeficitData.dailyAverageFromWorkouts} workout = {pendingDeficitData.hard.foodDeficit} food cut
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => setShowDeficitChoice(false)} style={styles.choiceCancelBtn}>
            <Text style={styles.choiceCancelText}>Go back and edit my target</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Plan Summary ─────────────────────────────────────────────────── */}
      {showPlanSummary && planSummary && (
        <View style={styles.planSummaryBox}>
          <Text style={styles.planSummaryTitle}>Your calorie plan</Text>

          {/* ── Top stats row ── */}
          <View style={styles.planSummaryRow}>
            <View style={styles.planSummaryItem}>
              <MaterialCommunityIcons name="heart-pulse" size={20} color="#ff4030" />
              <Text style={styles.planSummaryValue}>{planSummary.bmr}</Text>
              <Text style={styles.planSummaryLabel}>BMR</Text>
            </View>
            <View style={styles.planSummaryItem}>
              <MaterialCommunityIcons name="speedometer" size={20} color="#8e44ad" />
              <Text style={styles.planSummaryValue}>{planSummary.sedentaryTDEE}</Text>
              <Text style={styles.planSummaryLabel}>Sedentary{'\n'}TDEE</Text>
            </View>
            <View style={styles.planSummaryItem}>
              <MaterialCommunityIcons name="fire" size={20} color="#e67e22" />
              <Text style={styles.planSummaryValue}>{planSummary.dailyAverageFromWorkouts}</Text>
              <Text style={styles.planSummaryLabel}>Workout{'\n'}avg/day</Text>
            </View>
            <View style={styles.planSummaryItem}>
              <MaterialCommunityIcons name="calendar" size={20} color="#27ae60" />
              <Text style={styles.planSummaryValue}>{planSummary.targetWeeks}</Text>
              <Text style={styles.planSummaryLabel}>Weeks</Text>
            </View>
          </View>

          <View style={styles.planDivider} />

          {/* ── Deficit equation ── */}
          <View style={styles.equationRow}>
            <View style={styles.equationItem}>
              <Text style={styles.equationVal}>{planSummary.totalDeficit}</Text>
              <Text style={styles.equationLabel}>total deficit{'\n'}needed/day</Text>
            </View>
            <Text style={styles.equationOp}>−</Text>
            <View style={styles.equationItem}>
              <Text style={[styles.equationVal, { color: '#e67e22' }]}>{planSummary.dailyAverageFromWorkouts}</Text>
              <Text style={styles.equationLabel}>workout{'\n'}burn avg</Text>
            </View>
            <Text style={styles.equationOp}>=</Text>
            <View style={[styles.equationItem, styles.equationItemHighlight]}>
              <Text style={[styles.equationVal, { color: '#cc2020' }]}>{planSummary.foodDeficit}</Text>
              <Text style={[styles.equationLabel, { color: '#cc2020' }]}>food cut{'\n'}per day</Text>
            </View>
          </View>

          <View style={styles.planDivider} />

          {/* ── Workout breakdown ── */}
          {planSummary.hasWorkouts && (
            <>
              <View style={styles.planBlock}>
                <View style={styles.planBlockHeader}>
                  <MaterialCommunityIcons name="fire" size={16} color="#e67e22" />
                  <Text style={[styles.planBlockLabel, { color: '#e67e22' }]}>  workout burn breakdown</Text>
                </View>
                {planSummary.workoutBreakdown.map((item, i) => (
                  <View key={i} style={styles.breakdownRow}>
                    <Text style={styles.breakdownName}>• {item.name}</Text>
                    <Text style={styles.breakdownCal}>{item.weeklyBurned} kcal/wk ({item.days}d × {item.hours}h)</Text>
                  </View>
                ))}
                <View style={styles.breakdownTotalRow}>
                  <Text style={styles.breakdownTotalLabel}>weekly total</Text>
                  <Text style={styles.breakdownTotalVal}>{planSummary.weeklyCaloriesBurned} kcal</Text>
                </View>
              </View>
              <View style={styles.planDivider} />
            </>
          )}

          {/* ── Final calorie target ── */}
          <View style={[styles.planBlock, styles.planBlockHighlight]}>
            <View style={styles.planBlockHeader}>
              <MaterialCommunityIcons name="check-decagram" size={18} color="#27ae60" />
              <Text style={[styles.planBlockLabel, { color: '#27ae60' }]}>  your daily calorie target</Text>
            </View>
            <Text style={styles.planBlockSub}>
              {planSummary.hasWorkouts
                ? `Your workouts burn ${planSummary.dailyAverageFromWorkouts} kcal/day on average, so you only need to cut ${planSummary.foodDeficit} kcal from food.`
                : 'No workouts selected, so the full deficit comes from diet alone.'}
            </Text>
            <View style={styles.planBlockCalRow}>
              <Text style={[styles.planBlockCalValue, { color: '#27ae60' }]}>{planSummary.dailyCalTarget}</Text>
              <Text style={styles.planBlockCalUnit}> kcal/day</Text>
            </View>
            <Text style={styles.planBlockFormula}>
              {planSummary.sedentaryTDEE} TDEE - {planSummary.foodDeficit} food cut
            </Text>
          </View>

          {!planSummary.hasWorkouts && (
            <>
              <View style={styles.planDivider} />
              <View style={styles.noWorkoutNote}>
                <Text style={styles.noWorkoutNoteText}>
                  Add workouts above if you want the app to reduce how much of the deficit has to come from food.
                </Text>
              </View>
            </>
          )}
        </View>
      )}

      <View style={[styles.rowButtons, { marginTop: 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => {
          setShowPlanSummary(false); setPlanSummary(null);
          setShowDeficitChoice(false); setPendingDeficitData(null);
          setStep(2);
        }}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        {!showPlanSummary ? (
          <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleViewPlan}>
            <LinearGradient colors={['#ff6b5f', '#e3342b', '#8f1418']} style={styles.buttonGradient}>
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>View calorie plan</Text>
                <MaterialCommunityIcons name="file-chart-outline" size={18} color="#fff" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={handleFinish}>
            <LinearGradient colors={['#47d18c', '#1f8f55', '#0b3d29']} style={styles.buttonGradient}>
              <View style={styles.buttonContent}>
                <Text style={styles.buttonText}>Finish onboarding</Text>
                <MaterialCommunityIcons name="check" size={18} color="#fff" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <LinearGradient colors={['#030000', '#0b0102', '#170306', '#2a070a']} style={styles.gradient}>
      <View style={styles.backgroundOrbTop} />
      <View style={styles.backgroundOrbBottom} />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroShell}>
          <View style={styles.setupBadge}>
            <MaterialCommunityIcons name="tune-variant" size={16} color="#ffd3d0" />
            <Text style={styles.setupBadgeText}>Quasar setup</Text>
          </View>

          <Text style={styles.heroTitle}>{currentStepMeta.title}</Text>
          <Text style={styles.heroSubtitle}>{currentStepMeta.subtitle}</Text>

          <View style={styles.progressRow}>
            {[1, 2, 3].map((s) => {
              const meta = STEP_META[s];
              const isActive = step === s;
              const isComplete = step > s;

              return (
                <View
                  key={s}
                  style={[
                    styles.progressStep,
                    isActive && styles.progressStepActive,
                    isComplete && styles.progressStepComplete,
                  ]}
                >
                  <View
                    style={[
                      styles.progressIconWrap,
                      isActive && styles.progressIconWrapActive,
                      isComplete && styles.progressIconWrapComplete,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={isComplete ? 'check' : meta.icon}
                      size={16}
                      color="#fff"
                    />
                  </View>
                  <Text style={[styles.progressLabel, (isActive || isComplete) && styles.progressLabelActive]}>
                    {meta.label}
                  </Text>
                  <Text style={[styles.progressCaption, (isActive || isComplete) && styles.progressCaptionActive]}>
                    {meta.caption}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </View>
      </ScrollView>

      <AppAlertDialog {...dialogProps} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  backgroundOrbTop: {
    position: 'absolute',
    top: -80,
    right: -70,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,64,48,0.16)',
  },
  backgroundOrbBottom: {
    position: 'absolute',
    left: -100,
    bottom: 80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(120,18,20,0.26)',
  },
  container: { paddingHorizontal: 18, paddingTop: 28, paddingBottom: 42 },
  heroShell: {
    borderRadius: 32,
    padding: 18,
    backgroundColor: 'rgba(18,4,5,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,87,75,0.16)',
    marginBottom: 16,
    shadowColor: '#ff4030',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 26,
    elevation: 8,
  },
  setupBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,64,48,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(255,92,74,0.22)',
    marginBottom: 16,
  },
  setupBadgeText: {
    color: '#ffd3d0',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#fff7f5',
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,224,216,0.68)',
    marginBottom: 18,
  },
  progressRow: { flexDirection: 'row', gap: 10 },
  progressStep: {
    flex: 1,
    borderRadius: 20,
    padding: 11,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  progressStepActive: {
    backgroundColor: 'rgba(255,64,48,0.13)',
    borderColor: 'rgba(255,92,74,0.30)',
  },
  progressStepComplete: {
    backgroundColor: 'rgba(71,209,140,0.11)',
    borderColor: 'rgba(71,209,140,0.24)',
  },
  progressIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  progressIconWrapActive: { backgroundColor: '#ff4030' },
  progressIconWrapComplete: { backgroundColor: 'rgba(71,209,140,0.78)' },
  progressLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,230,224,0.68)',
    marginBottom: 3,
  },
  progressLabelActive: { color: '#fff7f5' },
  progressCaption: {
    fontSize: 10,
    color: 'rgba(255,216,208,0.42)',
    lineHeight: 14,
  },
  progressCaptionActive: { color: 'rgba(255,232,226,0.68)' },
  card: {
    backgroundColor: 'rgba(12,3,4,0.94)',
    borderRadius: 30,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,92,74,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 12,
  },
  stepIntro: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  stepIntroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,64,48,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,92,74,0.18)',
    marginRight: 14,
  },
  stepIntroCopy: { flex: 1 },
  stepEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#ff8a7d',
    marginBottom: 4,
  },
  stepTitle: { fontSize: 24, fontWeight: '900', color: '#fff7f5', marginBottom: 4, letterSpacing: -0.2 },
  stepSub: { fontSize: 13, color: 'rgba(255,224,216,0.58)', lineHeight: 20, marginBottom: 0 },
  formSection: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,64,48,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,92,74,0.15)',
    marginRight: 10,
  },
  sectionHeaderCopy: { flex: 1 },
  sectionHeaderTitle: { fontSize: 14, fontWeight: '800', color: '#fff1ee', marginBottom: 2 },
  sectionHeaderSub: { fontSize: 12, lineHeight: 18, color: 'rgba(255,224,216,0.50)' },
  label: { fontSize: 12, fontWeight: '800', color: 'rgba(255,214,206,0.70)', marginBottom: 7 },
  input: {
    height: 54,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#fff7f5',
    backgroundColor: 'rgba(0,0,0,0.26)',
    marginBottom: 16,
    justifyContent: 'center',
  },
  inputButton: {
    height: 54,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 16,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.26)',
  },
  inputButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputButtonText: { fontSize: 15, fontWeight: '700', color: '#fff7f5' },
  row: { flexDirection: 'row' },
  genderRow: { flexDirection: 'row', marginBottom: 4, gap: 8 },
  genderBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  genderBtnActive: { backgroundColor: 'rgba(255,64,48,0.20)', borderColor: '#ff4030' },
  genderText: { color: 'rgba(255,224,216,0.58)', fontWeight: '800', fontSize: 13 },
  genderTextActive: { color: '#fff' },
  metricRow: { flexDirection: 'row', gap: 12 },
  metricField: { flex: 1 },
  metricInputWrap: { position: 'relative' },
  metricInput: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(0,0,0,0.26)',
    paddingLeft: 16,
    paddingRight: 52,
    fontSize: 15,
    color: '#fff7f5',
  },
  metricUnit: {
    position: 'absolute',
    right: 14,
    top: 17,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,190,175,0.54)',
  },
  button: { borderRadius: 18, overflow: 'hidden', marginTop: 8 },
  buttonGradient: { padding: 16, alignItems: 'center', borderRadius: 18 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  checkButton: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,64,48,0.36)',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255,64,48,0.09)',
  },
  checkButtonText: { color: '#ff8a7d', fontWeight: '800', fontSize: 14 },
  goalHero: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,118,98,0.18)',
  },
  goalHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  goalStat: { flex: 1 },
  goalStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  goalStatValue: { fontSize: 22, fontWeight: '900', color: '#fff7f5' },
  goalHeroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goalHeroPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  goalHeroPillText: { fontSize: 11, fontWeight: '800', color: '#ffe4df' },
  warningBox: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  warningBoxAlert: { backgroundColor: 'rgba(255,91,70,0.10)', borderColor: 'rgba(255,126,106,0.24)' },
  warningBoxSuccess: { backgroundColor: 'rgba(71,209,140,0.09)', borderColor: 'rgba(71,209,140,0.22)' },
  feedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  feedbackTitle: { fontSize: 14, fontWeight: '800', color: '#fff1ee' },
  warningText: { color: 'rgba(255,216,208,0.70)', fontSize: 13, marginBottom: 8, lineHeight: 20 },
  suggestionText: { color: 'rgba(218,255,232,0.76)', fontSize: 13, fontWeight: '700', lineHeight: 20 },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(59,130,246,0.09)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.22)',
  },
  infoNoteText: { flex: 1, color: 'rgba(210,229,255,0.76)', fontSize: 12, lineHeight: 18 },
  rowButtons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  backButton: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  backButtonText: { color: '#ff9a90', fontWeight: '800', fontSize: 14 },
  activitySummaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryStatValue: { fontSize: 22, fontWeight: '900', color: '#fff7f5', marginBottom: 4 },
  summaryStatLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,224,216,0.52)', textAlign: 'center' },
  activityCard: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 22, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.035)', overflow: 'hidden' },
  activityCardSelected: { borderColor: 'rgba(255,92,74,0.28)', backgroundColor: 'rgba(255,64,48,0.045)' },
  activityHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  activityIconBox: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  activityCopy: { flex: 1 },
  activityTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  activityName: { fontSize: 16, fontWeight: '800', color: '#fff3f0' },
  activityDesc: { fontSize: 12, color: 'rgba(255,224,216,0.52)', marginTop: 2, lineHeight: 18 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  statusPillText: { fontSize: 10, fontWeight: '800' },
  activityExpanded: { paddingHorizontal: 16, paddingBottom: 16 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 14 },
  settingLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(255,224,216,0.70)', marginBottom: 8 },
  sliderRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  dayBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.22)', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.09)' },
  dayBtnText: { fontSize: 12, fontWeight: '800', color: 'rgba(255,224,216,0.68)' },
  sportsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  sportChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.22)' },
  sportName: { fontSize: 12, fontWeight: '700', color: 'rgba(255,224,216,0.70)' },
  caloriePreview: {
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  caloriePreviewCopy: { flex: 1 },
  caloriePreviewLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,224,216,0.56)', marginBottom: 2 },
  caloriePreviewValue: { fontSize: 18, fontWeight: '900' },
  removeActivityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,126,106,0.22)',
    backgroundColor: 'rgba(255,64,48,0.07)',
    paddingVertical: 12,
  },
  removeActivityText: { fontSize: 12, fontWeight: '800', color: '#ff9a90' },
  noActivityHint: { backgroundColor: 'rgba(255,188,103,0.08)', borderRadius: 18, padding: 16, marginTop: 4, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,188,103,0.18)' },
  noActivityTitle: { color: '#ffd09a', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  noActivityText: { color: 'rgba(255,226,194,0.68)', fontSize: 12, lineHeight: 19 },

  // ── Deficit Choice Card ─────────────────────────────────────────────────────
  choiceCard: { backgroundColor: 'rgba(255,64,48,0.07)', borderRadius: 24, padding: 16, marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,126,106,0.22)' },
  choiceCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  choiceCardTitle: { fontSize: 16, fontWeight: '900', color: '#fff1ee' },
  choiceMathRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 18, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  choiceMathItem: { alignItems: 'center', minWidth: 64 },
  choiceMathVal: { fontSize: 22, fontWeight: '900', color: '#fff7f5' },
  choiceMathLabel: { fontSize: 10, color: 'rgba(255,224,216,0.52)', textAlign: 'center', marginTop: 2 },
  choiceSubtext: { fontSize: 12, color: 'rgba(255,224,216,0.64)', marginBottom: 14, lineHeight: 18 },
  choiceOptions: { gap: 10, marginBottom: 12 },
  choiceOptionSafe: { backgroundColor: 'rgba(71,209,140,0.08)', borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: 'rgba(71,209,140,0.25)', alignItems: 'center' },
  choiceOptionHard: { backgroundColor: 'rgba(255,64,48,0.07)', borderRadius: 18, padding: 14, borderWidth: 1.5, borderColor: 'rgba(255,126,106,0.24)', alignItems: 'center' },
  choiceOptionEmoji: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6, color: 'rgba(255,224,216,0.68)' },
  choiceOptionTitle: { fontSize: 15, fontWeight: '800', color: '#fff1ee', marginBottom: 4, textAlign: 'center' },
  choiceOptionWeeks: { fontSize: 12, color: 'rgba(255,224,216,0.58)', marginBottom: 10, fontWeight: '700' },
  choiceOptionCalBox: { backgroundColor: 'rgba(71,209,140,0.10)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, alignItems: 'center', minWidth: 120 },
  choiceOptionCal: { fontSize: 28, fontWeight: '900', color: '#27ae60' },
  choiceOptionCalUnit: { fontSize: 10, color: 'rgba(255,224,216,0.54)', textTransform: 'uppercase' },
  choiceOptionFormula: { fontSize: 10, color: 'rgba(255,224,216,0.54)', textAlign: 'center', lineHeight: 15 },
  choiceCancelBtn: { alignItems: 'center', paddingVertical: 8 },
  choiceCancelText: { color: 'rgba(255,224,216,0.58)', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },

  // ── Equation Row ─────────────────────────────────────────────────────────────
  equationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 18, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  equationItem: { alignItems: 'center', minWidth: 60 },
  equationItemHighlight: { backgroundColor: 'rgba(255,64,48,0.10)', borderRadius: 14, padding: 8 },
  equationVal: { fontSize: 20, fontWeight: '900', color: '#fff7f5' },
  equationLabel: { fontSize: 9, color: 'rgba(255,224,216,0.52)', textAlign: 'center', marginTop: 2 },
  equationOp: { fontSize: 20, fontWeight: '700', color: 'rgba(255,224,216,0.32)', marginBottom: 12 },
  planSummaryBox: { backgroundColor: 'rgba(255,255,255,0.045)', borderRadius: 22, padding: 16, marginTop: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  planSummaryTitle: { fontSize: 16, fontWeight: '900', color: '#fff1ee', marginBottom: 14, textAlign: 'center' },
  planSummaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  planSummaryItem: { alignItems: 'center', gap: 4 },
  planSummaryValue: { fontSize: 18, fontWeight: '900', color: '#fff7f5' },
  planSummaryLabel: { fontSize: 10, color: 'rgba(255,224,216,0.52)', textAlign: 'center' },
  planDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 14 },

  planBlock: { borderRadius: 18, padding: 14, backgroundColor: 'rgba(0,0,0,0.20)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  planBlockHighlight: { backgroundColor: 'rgba(71,209,140,0.08)', borderWidth: 1, borderColor: 'rgba(71,209,140,0.24)' },
  planBlockHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  planBlockLabel: { fontSize: 13, fontWeight: '800', color: 'rgba(255,224,216,0.66)' },
  planBlockSub: { fontSize: 12, color: 'rgba(255,224,216,0.62)', marginBottom: 10, lineHeight: 18 },
  planBlockCalRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  planBlockCalValue: { fontSize: 36, fontWeight: '900', color: '#fff7f5' },
  planBlockCalUnit: { fontSize: 15, color: 'rgba(255,224,216,0.62)', marginBottom: 5, fontWeight: '700' },
  planBlockFormula: { fontSize: 11, color: 'rgba(255,224,216,0.48)' },

  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  breakdownName: { fontSize: 12, color: 'rgba(255,224,216,0.64)', flex: 1, lineHeight: 18 },
  breakdownCal: { fontSize: 12, color: '#e67e22', fontWeight: '600' },
  breakdownTotalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', marginTop: 6, paddingTop: 6 },
  breakdownTotalLabel: { fontSize: 13, fontWeight: '700', color: '#fff1ee' },
  breakdownTotalVal: { fontSize: 13, fontWeight: '700', color: '#e67e22' },

  noWorkoutNote: { backgroundColor: 'rgba(255,188,103,0.08)', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: 'rgba(255,188,103,0.18)' },
  noWorkoutNoteText: { color: 'rgba(255,226,194,0.70)', fontSize: 12, lineHeight: 19 },
});
