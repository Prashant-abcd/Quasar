import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, ActivityIndicator, Animated, Easing, Dimensions, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getLocalDateKey } from '../utils/date';
import { writeNBRow, getTodayNBRow, backfillYesterdayIfMissing } from '../utils/nbTraining';
import { markNBAnswered, isNBAnsweredToday } from '../utils/nbAnswered';
import { buildNBCheckInPrompt } from '../utils/nbCheckInPrompt';
import { processDailyStreak, getDefaultStreak } from '../utils/proteinStreak';
import ProteinWarriorCard from '../components/ProteinWarriorCard';
import * as Haptics from 'expo-haptics';
import {
  CONDITIONS, CONDITION_CATEGORIES, SEVERITY,
  RECOVERY_ACTIVITY_DATA, calcInjuryTDEE, calcMacros,
  calcWeeklyBurn, calcTotalWeeklyBurn,
} from '../utils/injuryData';

const { width: SCREEN_W } = Dimensions.get('window');
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ── Severity-aware palettes ─────────────────────────────────────────────────
const PALETTES = {
  MILD: {
    bg1: '#F0FDF4', bg2: '#DCFCE7', bg3: '#BBF7D0',
    accent: '#16A34A', accentDark: '#14532D', accentLight: '#4ADE80',
    card: '#FFFFFF', cardBorder: '#BBF7D0', softBg: '#DCFCE7',
    text: '#14532D', textSoft: '#4B7C5E', textGray: '#6B7280',
    glow: 'rgba(74,222,128,0.35)', ringBg: '#DCFCE7',
  },
  MODERATE: {
    bg1: '#FFFBEB', bg2: '#FEF3C7', bg3: '#FDE68A',
    accent: '#D97706', accentDark: '#92400E', accentLight: '#FBBF24',
    card: '#FFFFFF', cardBorder: '#FDE68A', softBg: '#FEF3C7',
    text: '#92400E', textSoft: '#A16207', textGray: '#6B7280',
    glow: 'rgba(251,191,36,0.35)', ringBg: '#FEF3C7',
  },
  SERIOUS: {
    bg1: '#FFF1F2', bg2: '#FFE4E6', bg3: '#FECDD3',
    accent: '#E11D48', accentDark: '#881337', accentLight: '#FB7185',
    card: '#FFFFFF', cardBorder: '#FECDD3', softBg: '#FFE4E6',
    text: '#881337', textSoft: '#9F1239', textGray: '#6B7280',
    glow: 'rgba(251,113,133,0.35)', ringBg: '#FFE4E6',
  },
  CRITICAL: {
    bg1: '#FEF2F2', bg2: '#FEE2E2', bg3: '#FECACA',
    accent: '#DC2626', accentDark: '#7F1D1D', accentLight: '#F87171',
    card: '#FFFFFF', cardBorder: '#FECACA', softBg: '#FEE2E2',
    text: '#7F1D1D', textSoft: '#991B1B', textGray: '#6B7280',
    glow: 'rgba(248,113,113,0.40)', ringBg: '#FEE2E2',
  },
};
const DEFAULT_PAL = PALETTES.MILD;

// ── Themed dialog ──────────────────────────────────────────────────────────
function InjuryDialog({ visible, variant = 'info', title, message, actions, onClose }) {
  if (!visible) return null;
  const iconMap = { info: 'information-outline', warning: 'alert-circle-outline', success: 'check-circle-outline', error: 'close-circle-outline' };
  const colorMap = { info: '#16A34A', warning: '#D97706', success: '#16A34A', error: '#DC2626' };
  const bgMap = { info: '#F0FDF4', warning: '#FFFBEB', success: '#F0FDF4', error: '#FEF2F2' };
  const ic = colorMap[variant];
  return (
    <View style={dlg.overlay}>
      <View style={[dlg.card, { backgroundColor: bgMap[variant], borderColor: ic + '40' }]}>
        <View style={[dlg.iconCircle, { backgroundColor: ic + '18' }]}>
          <MaterialCommunityIcons name={iconMap[variant]} size={28} color={ic} />
        </View>
        <Text style={[dlg.title, { color: '#14532D' }]}>{title}</Text>
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

// ── Animated number counter ────────────────────────────────────────────────
function AnimatedNum({ value, style, duration = 800 }) {
  const animVal = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const id = animVal.addListener(({ value: v }) => setDisplay(Math.round(v)));
    Animated.timing(animVal, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => animVal.removeListener(id);
  }, [animVal, duration, value]);
  return <Text style={style}>{display}</Text>;
}

// ── Breathing glow pulse ───────────────────────────────────────────────────
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

// ── SVG Donut Calorie Ring ─────────────────────────────────────────────────
function CalorieRing({ consumed, target, pal, accentColor }) {
  const SIZE = 200;
  const STROKE = 14;
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
      Animated.timing(animOffset, {
        toValue: targetOffset, duration: 1400,
        easing: Easing.out(Easing.cubic), useNativeDriver: false,
      }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [CIRC, animOffset, opacityAnim, progress, scaleAnim]);

  return (
    <Animated.View style={{ alignItems: 'center', opacity: opacityAnim, transform: [{ scale: scaleAnim }] }}>
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <BreathingGlow color={pal.glow} size={SIZE + 40} />
        <Svg width={SIZE} height={SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Defs>
            <SvgGrad id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={accentColor} />
              <Stop offset="100%" stopColor={pal.accentLight} />
            </SvgGrad>
          </Defs>
          {/* Background track */}
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
            stroke={pal.ringBg} strokeWidth={STROKE} />
          {/* Progress arc */}
          <AnimatedCircle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
            stroke={overTarget ? '#EF4444' : 'url(#ringGrad)'}
            strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={`${CIRC}`}
            strokeDashoffset={animOffset} />
        </Svg>
        {/* Center content */}
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <AnimatedNum value={remaining} style={{
            fontSize: 38, fontWeight: '900', color: overTarget ? '#EF4444' : pal.accentDark,
            letterSpacing: -1,
          }} />
          <Text style={{ fontSize: 11, color: pal.textSoft, marginTop: 2, fontWeight: '600' }}>
            kcal remaining
          </Text>
          <Text style={{ fontSize: 10, color: pal.textGray, marginTop: 1 }}>
            of {target} target
          </Text>
        </View>
      </View>
      {/* Progress percentage pill */}
      <View style={{
        marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: pal.softBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
        borderWidth: 1, borderColor: pal.cardBorder,
      }}>
        <View style={{
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: overTarget ? '#EF4444' : accentColor,
        }} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: overTarget ? '#EF4444' : pal.accentDark }}>
          {Math.round(progress * 100)}% consumed
        </Text>
      </View>
    </Animated.View>
  );
}

// ── Animated macro bar ─────────────────────────────────────────────────────
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
        <Animated.View style={{
          height: '100%', borderRadius: 3, backgroundColor: color,
          width: widthInterp,
        }} />
      </View>
    </Animated.View>
  );
}

// ── Staggered fade-in card ─────────────────────────────────────────────────
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

// ── Recovery day badge ─────────────────────────────────────────────────────
function RecoveryDayBadge({ startDate, pal }) {
  const start = new Date(startDate);
  const now = new Date();
  const days = Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: pal.softBg, borderRadius: 20,
      paddingHorizontal: 14, paddingVertical: 8,
      borderWidth: 1, borderColor: pal.cardBorder, alignSelf: 'center', marginBottom: 16,
    }}>
      <MaterialCommunityIcons name="calendar-heart" size={16} color={pal.accent} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: pal.accentDark }}>
        Day {days} of recovery
      </Text>
      <Text style={{ fontSize: 11, color: pal.textGray }}>
        {days === 1 ? 'just started' : days < 7 ? 'early days' : days < 14 ? 'hang in there' : 'you are incredible'}
      </Text>
    </View>
  );
}

// ── Pulse dot ──────────────────────────────────────────────────────────────
function PulseDot({ color = '#16A34A' }) {
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

// ── Activity summary bar ───────────────────────────────────────────────────
function ActivitySummaryBar({ activitySettings, pal = DEFAULT_PAL }) {
  const count = Object.keys(activitySettings).length;
  const weekly = calcTotalWeeklyBurn(activitySettings);
  const daily = Math.round(weekly / 7);
  return (
    <View style={[s.summaryBar, { borderColor: pal.cardBorder }]}>
      <View style={s.summaryCell}>
        <AnimatedNum value={count} style={[s.summaryVal, { color: pal.text }]} />
        <Text style={s.summaryLbl}>Selected</Text>
      </View>
      <View style={[s.summaryDivider, { backgroundColor: pal.cardBorder }]} />
      <View style={s.summaryCell}>
        <AnimatedNum value={daily} style={[s.summaryVal, { color: pal.text }]} />
        <Text style={s.summaryLbl}>Avg kcal/day</Text>
      </View>
      <View style={[s.summaryDivider, { backgroundColor: pal.cardBorder }]} />
      <View style={s.summaryCell}>
        <AnimatedNum value={weekly} style={[s.summaryVal, { color: pal.text }]} />
        <Text style={s.summaryLbl}>Kcal/week</Text>
      </View>
    </View>
  );
}

// ── Full activity picker ───────────────────────────────────────────────────
function ActivityPicker({ activitySettings, onChange, accentColor = '#16A34A', pal = DEFAULT_PAL }) {
  const [expandedActivity, setExpandedActivity] = useState(null);

  const isSelected = (name) => !!activitySettings[name];
  const getSetting = (name) => activitySettings[name] || {};

  const toggle = (name) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const actData = RECOVERY_ACTIVITY_DATA[name];
    if (isSelected(name)) {
      setExpandedActivity(expandedActivity === name ? null : name);
    } else {
      const defaults = actData.recoveryOnly
        ? { daysPerWeek: 7, hoursPerDay: 1 }
        : { daysPerWeek: 3, hoursPerDay: 1 };
      onChange({ ...activitySettings, [name]: defaults });
      setExpandedActivity(name);
    }
  };

  const updateSetting = (name, key, val) => {
    Haptics.selectionAsync();
    onChange({ ...activitySettings, [name]: { ...activitySettings[name], [key]: val } });
  };

  const remove = (name) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const next = { ...activitySettings };
    delete next[name];
    onChange(next);
    if (expandedActivity === name) setExpandedActivity(null);
  };

  const recoveryOnlyEntries = Object.entries(RECOVERY_ACTIVITY_DATA).filter(([, d]) => d.recoveryOnly);
  const standardEntries = Object.entries(RECOVERY_ACTIVITY_DATA).filter(([, d]) => !d.recoveryOnly);

  const renderActivity = ([actName, actData]) => {
    const sel = isSelected(actName);
    const expanded = expandedActivity === actName;
    const settings = getSetting(actName);
    const selSport = actData.hasSubOptions && settings.selectedSport
      ? actData.subOptions?.find(sp => sp.name === settings.selectedSport)
      : null;
    const cph = selSport?.caloriesPerHour || actData.caloriesPerHour || 0;
    const days = settings.daysPerWeek ?? (actData.recoveryOnly ? 7 : 3);
    const hrs = settings.hoursPerDay ?? 1;
    const weeklyBurn = Math.round(cph * days * hrs);
    const ac = actData.color;

    return (
      <View key={actName} style={[s.actCard, { borderColor: sel ? ac : pal.cardBorder }, sel && { borderWidth: 1.5 }]}>
        <TouchableOpacity style={s.actHeader} activeOpacity={0.88} onPress={() => toggle(actName)}>
          <View style={[s.actIconBox, { backgroundColor: ac + '22' }]}>
            <MaterialCommunityIcons name={actData.iconName} size={24} color={ac} />
          </View>
          <View style={s.actCopy}>
            <View style={s.actTitleRow}>
              <Text style={[s.actName, { color: pal.text }]}>{actName}</Text>
              {sel && (
                <View style={[s.addedPill, { backgroundColor: ac + '18', borderColor: ac + '35' }]}>
                  <Text style={[s.addedPillText, { color: ac }]}>Added</Text>
                </View>
              )}
            </View>
            <Text style={s.actDesc}>
              {sel
                ? `${actData.hasSubOptions && settings.selectedSport ? settings.selectedSport + '  ·  ' : ''}${days}x/week  ·  ${hrs}h/session`
                : actData.desc}
            </Text>
          </View>
          <MaterialCommunityIcons
            name={sel ? (expanded ? 'chevron-up' : 'chevron-down') : 'plus'}
            size={22} color={sel ? ac : pal.accent}
          />
        </TouchableOpacity>

        {sel && expanded && (
          <View style={s.actExpanded}>
            <View style={[s.actDivider, { backgroundColor: pal.softBg }]} />

            <Text style={s.settingLabel}>
              {actData.recoveryOnly ? 'Days active per week' : 'Days per week'}
            </Text>
            <View style={s.btnRow}>
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <TouchableOpacity key={d}
                  style={[s.numBtn, { borderColor: pal.cardBorder, backgroundColor: pal.softBg },
                    days === d && { backgroundColor: ac, borderColor: ac }]}
                  onPress={() => updateSetting(actName, 'daysPerWeek', d)}
                >
                  <Text style={[s.numBtnText, { color: pal.text }, days === d && { color: '#fff' }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.settingLabel}>Hours per session</Text>
            <View style={s.btnRow}>
              {[0.5, 1, 1.5, 2, 2.5, 3].map(h => (
                <TouchableOpacity key={h}
                  style={[s.numBtn, { borderColor: pal.cardBorder, backgroundColor: pal.softBg },
                    hrs === h && { backgroundColor: ac, borderColor: ac }]}
                  onPress={() => updateSetting(actName, 'hoursPerDay', h)}
                >
                  <Text style={[s.numBtnText, { color: pal.text }, hrs === h && { color: '#fff' }]}>{h}h</Text>
                </TouchableOpacity>
              ))}
            </View>

            {actData.hasSubOptions && actData.subOptions && (
              <>
                <Text style={s.settingLabel}>Select your sport</Text>
                <View style={s.sportsGrid}>
                  {actData.subOptions.map(sport => {
                    const active = settings.selectedSport === sport.name;
                    return (
                      <TouchableOpacity key={sport.name}
                        style={[s.sportChip, { borderColor: pal.cardBorder },
                          active && { backgroundColor: ac, borderColor: ac }]}
                        onPress={() => updateSetting(actName, 'selectedSport', sport.name)}
                      >
                        <MaterialCommunityIcons name={sport.iconName} size={16} color={active ? '#fff' : '#555'} />
                        <Text style={[s.sportName, { color: pal.text }, active && { color: '#fff' }]}>{sport.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Calorie preview */}
            <View style={[s.calPreview, { backgroundColor: ac + '12', borderColor: ac + '30' }]}>
              <MaterialCommunityIcons name="fire" size={18} color={ac} />
              <View style={{ flex: 1 }}>
                <Text style={s.calPreviewLabel}>Estimated weekly burn</Text>
                <Text style={[s.calPreviewVal, { color: ac }]}>{weeklyBurn} kcal/week</Text>
              </View>
              <View style={s.calPerDayBox}>
                <Text style={[s.calPerDay, { color: ac }]}>{Math.round(weeklyBurn / 7)}</Text>
                <Text style={s.calPerDayLabel}>kcal/day avg</Text>
              </View>
            </View>

            <TouchableOpacity style={s.removeBtn} onPress={() => remove(actName)}>
              <MaterialCommunityIcons name="trash-can-outline" size={15} color="#B91C1C" />
              <Text style={s.removeBtnText}>Remove activity</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View>
      <Text style={s.actGroupLabel}>RECOVERY ACTIVITIES</Text>
      {recoveryOnlyEntries.map(renderActivity)}
      <Text style={[s.actGroupLabel, { marginTop: 8 }]}>STANDARD WORKOUTS</Text>
      {standardEntries.map(renderActivity)}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════════════
const STEP = { SELECT_CONDITION: 1, SELECT_ACTIVITY: 2, ACTIVE: 3 };

export default function InjuryScreen() {
  const router = useRouter();
  const [step, setStep] = useState(STEP.SELECT_CONDITION);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // dialog state
  const [dialog, setDialog] = useState({ visible: false });
  const showDialog = (opts) => setDialog({ visible: true, ...opts });
  const hideDialog = () => setDialog({ visible: false });

  // step 1
  const [selectedConditionKey, setSelectedConditionKey] = useState(null);

  // step 2 + active edit
  const [activitySettings, setActivitySettings] = useState({});

  // active injury
  const [injuryData, setInjuryData] = useState(null);
  const [caloriesConsumed, setCaloriesConsumed] = useState(0);
  const [proteinConsumed, setProteinConsumed] = useState(0);
  const [proteinStreak, setProteinStreak] = useState(getDefaultStreak());
  const [editingActivities, setEditingActivities] = useState(false);

  // NB check-in
  const [todayNBAnswered, setTodayNBAnswered] = useState(() => isNBAnsweredToday());

  // healed flow
  const [healedStep, setHealedStep] = useState(null);
  const [healedWeight, setHealedWeight] = useState('');
  const [newGoalWeight, setNewGoalWeight] = useState('');
  const [newTargetWeeks, setNewTargetWeeks] = useState('');

  // Screen entrance animation
  const screenFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [healedStep, screenFade, step]);

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
      if (p.activeInjury?.active) {
        setInjuryData(p.activeInjury);
        setActivitySettings(p.activeInjury.activitySettings || {});
        setStep(STEP.ACTIVE);
        const today = new Date().toISOString().split('T')[0];
        const mSnap = await getDocs(collection(db, 'users', uid, 'logs', today, 'meals'));
        let cal = 0, pro = 0;
        mSnap.docs.forEach(d => { const m = d.data(); cal += m.calories || 0; pro += m.protein || 0; });
        setCaloriesConsumed(cal);
        setProteinConsumed(pro);
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

  // ── Compute plan ──────────────────────────────────────────────────────────
  const computePlan = useCallback((condKey, actSettings, prof) => {
    const cond = CONDITIONS[condKey];
    const w = prof.currentWeight || prof.weight;
    const h = prof.height;
    const age = prof.age;
    const g = prof.gender;

    // Mifflin-St Jeor BMR
    const baseBmr = g === 'Male'
      ? Math.round(10 * w + 6.25 * h - 5 * age + 5)
      : Math.round(10 * w + 6.25 * h - 5 * age - 161);
    // Apply injury/illness multiplier
    const injuryBmr = Math.round(baseBmr * cond.bmrMultiplier);
    // TDEE = injury-adjusted BMR + daily activity burn
    const tdee = calcInjuryTDEE(injuryBmr, actSettings);
    // Recommended: at least TDEE, minimum 25 kcal/kg for healing
    const recCal = Math.max(tdee, Math.round(w * 25));
    // Macro split based on condition type
    const macros = calcMacros(recCal, cond.protein, cond.carbs, cond.fat);
    const weeklyBurn = calcTotalWeeklyBurn(actSettings);

    return {
      active: true,
      conditionKey: condKey,
      conditionLabel: cond.label,
      severity: cond.severity,
      warmMessage: cond.warmMessage,
      healingNotes: cond.healingNotes,
      activitySettings: actSettings,
      baseBmr, injuryBmr, tdee,
      recommendedCal: recCal,
      proteinPct: cond.protein, carbsPct: cond.carbs, fatPct: cond.fat,
      proteinG: macros.protein, carbsG: macros.carbs, fatG: macros.fat,
      weeklyBurn,
      dailyBurnAvg: Math.round(weeklyBurn / 7),
      startedAt: new Date().toISOString(),
    };
  }, []);

  // ── Step 1 -> 2 ──────────────────────────────────────────────────────────
  const handleConditionConfirm = () => {
    if (!selectedConditionKey) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const def = CONDITIONS[selectedConditionKey].defaultActivity;
    const defData = RECOVERY_ACTIVITY_DATA[def];
    setActivitySettings({
      [def]: defData.recoveryOnly
        ? { daysPerWeek: 7, hoursPerDay: 1 }
        : { daysPerWeek: 3, hoursPerDay: 1 },
    });
    screenFade.setValue(0);
    setStep(STEP.SELECT_ACTIVITY);
  };

  // ── Step 2 confirm ──────────────────────────────────────────────────────
  const handleActivitiesConfirm = () => {
    if (Object.keys(activitySettings).length === 0) {
      showDialog({ variant: 'warning', title: 'Select at least one', message: 'Even "Complete Bed Rest" counts! Pick what best describes your current situation.' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    showDialog({
      variant: 'info',
      title: 'warrior protocol — safe mode',
      message: 'your protein streak days will keep counting during recovery, but your badge score will stay frozen until you heal. no points lost — just paused.',
      actions: [{ label: 'got it, activate', onPress: () => activateInjury() }],
    });
  };
  const activateInjury = async () => {
    setSaving(true);
    try {
      const plan = computePlan(selectedConditionKey, activitySettings, profile);
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'profile', 'data'), {
        activeInjury: plan, injuryModeActive: true,
      });
      setInjuryData(plan);
      screenFade.setValue(0);
      setStep(STEP.ACTIVE);
      setTimeout(() => showDialog({
        variant: 'info',
        title: 'warrior protocol protected',
        message: 'your day streak will keep counting during recovery, but your badge score won\'t change. once you\'re healed and exit, the warrior protocol goes back to normal.',
      }), 400);
    } catch (e) {
      showDialog({ variant: 'error', title: 'Save failed', message: e.message });
    } finally { setSaving(false); }
  };

  // ── Update activities mid-recovery ────────────────────────────────────────
  const handleUpdateActivities = async () => {
    if (Object.keys(activitySettings).length === 0) {
      showDialog({ variant: 'warning', title: 'Select at least one', message: 'Pick at least one activity to recalculate your plan.' });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);
    try {
      const updated = computePlan(injuryData.conditionKey, activitySettings, profile);
      updated.startedAt = injuryData.startedAt;
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'profile', 'data'), { activeInjury: updated });
      setInjuryData(updated);
      setEditingActivities(false);
      showDialog({ variant: 'success', title: 'Plan recalibrated', message: `New daily target: ${updated.recommendedCal} kcal\nDaily burn avg: ${updated.dailyBurnAvg} kcal` });
    } catch (e) {
      showDialog({ variant: 'error', title: 'Save failed', message: e.message });
    } finally { setSaving(false); }
  };

  // ── Healed flow ───────────────────────────────────────────────────────────
  const handleHealedWeight = () => {
    const w = parseFloat(healedWeight);
    if (!w || w <= 0) {
      showDialog({ variant: 'warning', title: 'Enter your weight', message: "We need your current weight to recalculate your plan." });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    screenFade.setValue(0);
    setHealedStep('exercise');
    if (profile?.activitySettings) setActivitySettings(profile.activitySettings);
  };

  const handleHealedComplete = async () => {
    const w = parseFloat(healedWeight);
    const gw = parseFloat(newGoalWeight) || profile.goalWeight;
    const tw = parseInt(newTargetWeeks) || profile.targetWeeks;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSaving(true);
    try {
      const uid = auth.currentUser.uid;
      const g = profile.gender;
      const h = profile.height;
      const age = profile.age;

      // Mifflin-St Jeor BMR
      const bmr = g === 'Male'
        ? Math.round(10 * w + 6.25 * h - 5 * age + 5)
        : Math.round(10 * w + 6.25 * h - 5 * age - 161);
      const sedentaryTDEE = Math.round(bmr * 1.2);
      const excessKg = Math.max(0, w - gw);
      // Deficit needed to lose excessKg in tw weeks
      // 1 kg fat ~ 7700 kcal
      const rawDeficit = excessKg > 0 ? Math.round((excessKg * 7700) / (tw * 7)) : 0;
      const weeklyWkBurn = calcTotalWeeklyBurn(activitySettings);
      const workoutBurn = Math.round(weeklyWkBurn / 7);
      const foodDeficit = Math.max(0, rawDeficit - workoutBurn);
      const dailyCalTarget = Math.round(sedentaryTDEE - foodDeficit);
      const newEndDate = new Date(Date.now() + tw * 7 * 86400000);

      await addDoc(collection(db, 'users', uid, 'weightHistory'), {
        weight: w, loggedAt: new Date().toISOString(), note: 'Post-injury recovery weight',
      });
      await setDoc(doc(db, 'users', uid, 'profile', 'data'), {
        ...profile,
        currentWeight: w, goalWeight: gw, targetWeeks: tw,
        targetEndDate: newEndDate.toISOString(),
        bmr, sedentaryTDEE, tdee: sedentaryTDEE,
        dailyCalorieTarget: dailyCalTarget,
        dailyDeficit: rawDeficit, foodDeficit,
        weeklyWorkoutCalories: weeklyWkBurn,
        activitySettings,
        activeInjury: null, injuryModeActive: false,
        lastRecoveredAt: new Date().toISOString(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showDialog({
        variant: 'success',
        title: 'Welcome back!',
        message: `Plan updated!\n\nDaily target: ${dailyCalTarget} kcal\nDeficit: ${rawDeficit} kcal/day\n\nYou did it. Now let's finish what you started.`,
        actions: [{ label: "Let's go!", onPress: () => router.replace('/(tabs)') }],
      });
    } catch (e) {
      showDialog({ variant: 'error', title: 'Error', message: e.message });
    } finally { setSaving(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
        <Image source={require('../assets/images/quasar.png')} style={{ width: 240, height: 240 }} resizeMode="contain" />
        <ActivityIndicator size="large" color="#16A34A" style={{ marginTop: 40 }} />
        <Text style={{ marginTop: 20, color: '#16A34A', fontWeight: '600', fontSize: 13 }}>Preparing your recovery space...</Text>
      </View>
    );
  }

  // Resolve palette
  const activeSeverity = injuryData?.severity || (selectedConditionKey ? CONDITIONS[selectedConditionKey]?.severity : null);
  const pal = PALETTES[activeSeverity] || DEFAULT_PAL;

  // ── Step 1: Select condition ───────────────────────────────────────────────
  if (step === STEP.SELECT_CONDITION) {
    const selCond = selectedConditionKey ? CONDITIONS[selectedConditionKey] : null;
    const selPal = selCond ? (PALETTES[selCond.severity] || DEFAULT_PAL) : DEFAULT_PAL;

    return (
      <Animated.View style={{ flex: 1, backgroundColor: selPal.bg1, opacity: screenFade }}>
        <LinearGradient colors={[selPal.bg1, selPal.bg2, selPal.bg3]} style={StyleSheet.absoluteFill} />
        <InjuryDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: selPal.softBg, borderColor: selPal.cardBorder }]}
            onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={selPal.accent} />
          </TouchableOpacity>

          <FadeCard style={s.heroBox}>
            <Text style={s.heroEmoji}>🌿</Text>
            <Text style={[s.heroTitle, { color: selPal.text }]}>hey, what's going on?</Text>
            <Text style={[s.heroSub, { color: selPal.textSoft }]}>
              no judgment here — tell us what happened and we'll adjust your entire plan for recovery. your progress isn't lost, it's just paused
            </Text>
          </FadeCard>

          {CONDITION_CATEGORIES.map(cat => {
            const items = Object.entries(CONDITIONS).filter(([, v]) => v.category === cat);
            if (!items.length) return null;
            return (
              <View key={cat} style={s.catBlock}>
                <Text style={s.catLabel}>{cat.toUpperCase()}</Text>
                <View style={s.chipGrid}>
                  {items.map(([key, cond]) => {
                    const sev = SEVERITY[cond.severity];
                    const sel = selectedConditionKey === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[s.chip, { borderColor: selPal.cardBorder },
                          sel && { backgroundColor: sev.color, borderColor: sev.color }]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedConditionKey(sel ? null : key);
                        }}
                      >
                        <Text style={[s.chipText, { color: selPal.text }, sel && s.chipTextSelected]}>{cond.label}</Text>
                        {!sel && <View style={[s.sevDot, { backgroundColor: sev.color }]} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* Severity legend */}
          <View style={s.legendRow}>
            {Object.values(SEVERITY).map(sv => (
              <View key={sv.tag} style={s.legendItem}>
                <View style={[s.sevDot, { backgroundColor: sv.color }]} />
                <Text style={s.legendText}>{sv.label}</Text>
              </View>
            ))}
          </View>

          {/* Preview card */}
          {selCond && (
            <FadeCard style={[s.previewCard, { borderColor: SEVERITY[selCond.severity].color + '40' }]}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
              }}>
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: SEVERITY[selCond.severity].color + '18',
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <MaterialCommunityIcons name="heart-pulse" size={20} color={SEVERITY[selCond.severity].color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.previewTitle, { color: selPal.text }]}>{selCond.label}</Text>
                  <View style={[s.sevPill, {
                    backgroundColor: SEVERITY[selCond.severity].color + '18',
                    borderColor: SEVERITY[selCond.severity].color + '40',
                    alignSelf: 'flex-start',
                  }]}>
                    <View style={[s.sevDot, { backgroundColor: SEVERITY[selCond.severity].color }]} />
                    <Text style={[s.sevPillText, { color: SEVERITY[selCond.severity].color }]}>
                      {SEVERITY[selCond.severity].label} — BMR x{selCond.bmrMultiplier}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={[s.previewMsg, { color: selPal.textSoft }]}>{selCond.warmMessage}</Text>

              {/* Macro preview */}
              <View style={{
                flexDirection: 'row', gap: 8, marginBottom: 16, marginTop: 4,
              }}>
                {[
                  { label: 'Protein', val: selCond.protein, color: '#EF4444' },
                  { label: 'Carbs', val: selCond.carbs, color: '#F59E0B' },
                  { label: 'Fat', val: selCond.fat, color: '#3B82F6' },
                ].map(m => (
                  <View key={m.label} style={{
                    flex: 1, alignItems: 'center', backgroundColor: m.color + '10',
                    borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: m.color + '20',
                  }}>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: m.color }}>{m.val}%</Text>
                    <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{m.label}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[s.btnAccent, { backgroundColor: SEVERITY[selCond.severity].color }]}
                onPress={handleConditionConfirm}
              >
                <Text style={s.btnAccentText}>this is what happened</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>
            </FadeCard>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  // ── Step 2: Activity picker ────────────────────────────────────────────────
  if (step === STEP.SELECT_ACTIVITY) {
    return (
      <Animated.View style={{ flex: 1, backgroundColor: pal.bg1, opacity: screenFade }}>
        <LinearGradient colors={[pal.bg1, pal.bg2, pal.bg3]} style={StyleSheet.absoluteFill} />
        <InjuryDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: pal.softBg, borderColor: pal.cardBorder }]}
            onPress={() => { screenFade.setValue(0); setStep(STEP.SELECT_CONDITION); }}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={pal.accent} />
          </TouchableOpacity>

          <FadeCard style={s.heroBox}>
            <Text style={s.heroEmoji}>💪</Text>
            <Text style={[s.heroTitle, { color: pal.text }]}>what can you do right now?</Text>
            <Text style={[s.heroSub, { color: pal.textSoft }]}>
              be honest — we'll calculate exactly what your body needs. tap to add, set frequency and duration, then update anytime as you recover
            </Text>
          </FadeCard>

          <ActivitySummaryBar activitySettings={activitySettings} pal={pal} />
          <ActivityPicker activitySettings={activitySettings} onChange={setActivitySettings} accentColor={pal.accent} pal={pal} />

          <TouchableOpacity
            style={[s.btnAccent, {
              backgroundColor: pal.accent, marginTop: 20,
              opacity: Object.keys(activitySettings).length === 0 ? 0.4 : 1,
            }]}
            onPress={handleActivitiesConfirm}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                <Text style={s.btnAccentText}>set up my recovery plan</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
              </>
            }
          </TouchableOpacity>
          <View style={{ height: 48 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  // ── Healed flow: weight ──────────────────────────────────────────────────
  if (healedStep === 'weight') {
    return (
      <Animated.View style={{ flex: 1, backgroundColor: DEFAULT_PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[DEFAULT_PAL.bg1, DEFAULT_PAL.bg2]} style={StyleSheet.absoluteFill} />
        <InjuryDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={s.scroll}>
          <FadeCard style={s.heroBox}>
            <Text style={s.heroEmoji}>🎉</Text>
            <Text style={[s.heroTitle, { color: DEFAULT_PAL.text }]}>you made it back!</Text>
            <Text style={[s.heroSub, { color: DEFAULT_PAL.textSoft }]}>
              recovery is a real achievement — seriously proud of you. let's log your current weight and get everything updated
            </Text>
          </FadeCard>
          <Text style={s.settingLabel}>CURRENT WEIGHT (kg)</Text>
          <View style={s.weightRow}>
            <TextInput
              style={[s.weightInput, { borderColor: DEFAULT_PAL.cardBorder, color: DEFAULT_PAL.text }]}
              value={healedWeight}
              onChangeText={setHealedWeight}
              keyboardType="decimal-pad"
              placeholder={`${profile?.currentWeight || ''}`}
              placeholderTextColor="#9CA3AF"
            />
            <Text style={[s.weightUnit, { color: DEFAULT_PAL.textSoft }]}>kg</Text>
          </View>
          <TouchableOpacity style={[s.btnAccent, { backgroundColor: DEFAULT_PAL.accent }]} onPress={handleHealedWeight}>
            <Text style={s.btnAccentText}>next</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    );
  }

  // ── Healed flow: exercise ────────────────────────────────────────────────
  if (healedStep === 'exercise') {
    return (
      <Animated.View style={{ flex: 1, backgroundColor: DEFAULT_PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[DEFAULT_PAL.bg1, DEFAULT_PAL.bg2]} style={StyleSheet.absoluteFill} />
        <InjuryDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <FadeCard style={s.heroBox}>
            <Text style={s.heroEmoji}>🏋️</Text>
            <Text style={[s.heroTitle, { color: DEFAULT_PAL.text }]}>back to your workouts?</Text>
            <Text style={[s.heroSub, { color: DEFAULT_PAL.textSoft }]}>
              update what you'll be doing going forward — these will feed into your new calorie target
            </Text>
          </FadeCard>

          <ActivitySummaryBar activitySettings={activitySettings} />
          <ActivityPicker activitySettings={activitySettings} onChange={setActivitySettings} />

          <TouchableOpacity
            style={[s.btnAccent, { backgroundColor: DEFAULT_PAL.accent, marginTop: 20 }]}
            onPress={() => { screenFade.setValue(0); setHealedStep('goals'); }}
          >
            <Text style={s.btnAccentText}>confirm activities</Text>
            <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={{ height: 48 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  // ── Healed flow: goals ───────────────────────────────────────────────────
  if (healedStep === 'goals') {
    return (
      <Animated.View style={{ flex: 1, backgroundColor: DEFAULT_PAL.bg1, opacity: screenFade }}>
        <LinearGradient colors={[DEFAULT_PAL.bg1, DEFAULT_PAL.bg2]} style={StyleSheet.absoluteFill} />
        <InjuryDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={s.scroll}>
          <FadeCard style={s.heroBox}>
            <Text style={s.heroEmoji}>🎯</Text>
            <Text style={[s.heroTitle, { color: DEFAULT_PAL.text }]}>update your goal?</Text>
            <Text style={[s.heroSub, { color: DEFAULT_PAL.textSoft }]}>
              leave blank to keep your existing goal — or enter new targets if things have changed
            </Text>
          </FadeCard>
          <Text style={s.settingLabel}>NEW GOAL WEIGHT (kg) — optional</Text>
          <View style={s.weightRow}>
            <TextInput
              style={[s.weightInput, { borderColor: DEFAULT_PAL.cardBorder, color: DEFAULT_PAL.text }]}
              value={newGoalWeight}
              onChangeText={setNewGoalWeight}
              keyboardType="decimal-pad"
              placeholder={`${profile?.goalWeight}`}
              placeholderTextColor="#9CA3AF"
            />
            <Text style={[s.weightUnit, { color: DEFAULT_PAL.textSoft }]}>kg</Text>
          </View>
          <Text style={[s.settingLabel, { marginTop: 16 }]}>TARGET WEEKS — optional</Text>
          <View style={s.weightRow}>
            <TextInput
              style={[s.weightInput, { borderColor: DEFAULT_PAL.cardBorder, color: DEFAULT_PAL.text }]}
              value={newTargetWeeks}
              onChangeText={setNewTargetWeeks}
              keyboardType="numeric"
              placeholder={`${profile?.targetWeeks}`}
              placeholderTextColor="#9CA3AF"
            />
            <Text style={[s.weightUnit, { color: DEFAULT_PAL.textSoft }]}>wks</Text>
          </View>
          <TouchableOpacity
            style={[s.btnAccent, { backgroundColor: DEFAULT_PAL.accent, marginTop: 24 }]}
            onPress={handleHealedComplete}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                <Text style={s.btnAccentText}>update everything & go to dashboard</Text>
                <MaterialCommunityIcons name="rocket-launch" size={18} color="#fff" />
              </>
            }
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    );
  }

  // ── Step 3: Active injury dashboard ───────────────────────────────────────
  if (step === STEP.ACTIVE && injuryData) {
    const sev = SEVERITY[injuryData.severity];

    return (
      <Animated.View style={{ flex: 1, backgroundColor: pal.bg1, opacity: screenFade }}>
        <LinearGradient colors={[pal.bg1, pal.bg2, pal.bg3]} style={StyleSheet.absoluteFill} />
        <InjuryDialog {...dialog} onClose={hideDialog} />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* Header with pulse */}
          <FadeCard delay={0} style={s.activeHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <PulseDot color={pal.accent} />
              <Text style={[s.activeTitle, { color: pal.text }]}>Recovery Mode</Text>
            </View>
            <View style={[s.sevBadge, { backgroundColor: sev.color + '18', borderWidth: 1, borderColor: sev.color + '35' }]}>
              <View style={[s.sevDot, { backgroundColor: sev.color, marginRight: 5 }]} />
              <Text style={[s.sevBadgeText, { color: sev.color }]}>{sev.label}</Text>
            </View>
          </FadeCard>

          {/* Recovery day counter */}
          <RecoveryDayBadge startDate={injuryData.startedAt} pal={pal} />

          {/* Warm message card */}
          <FadeCard delay={100} style={[s.warmCard, { borderColor: pal.cardBorder }]}>
            <View style={{
              width: 48, height: 48, borderRadius: 24, backgroundColor: sev.color + '15',
              justifyContent: 'center', alignItems: 'center', marginBottom: 10,
            }}>
              <MaterialCommunityIcons name="heart-pulse" size={24} color={sev.color} />
            </View>
            <Text style={[s.warmTitle, { color: pal.text }]}>{injuryData.conditionLabel}</Text>
            <Text style={[s.warmMsg, { color: pal.textSoft }]}>{injuryData.warmMessage}</Text>
          </FadeCard>

          {/* SVG Calorie Ring */}
          <FadeCard delay={200} style={[s.ringCard, { borderColor: pal.cardBorder }]}>
            <CalorieRing
              consumed={caloriesConsumed}
              target={injuryData.recommendedCal}
              pal={pal}
              accentColor={pal.accent}
            />
            <Text style={[s.calNote, { color: pal.textGray }]}>
              no deficit during recovery — your body needs fuel to heal
            </Text>
          </FadeCard>

          {/* Daily check-in */}
          {!todayNBAnswered && (
            <FadeCard delay={260} style={[s.nbCheckCard, { borderColor: pal.cardBorder }]}>
              <Text style={[s.nbCheckText, { color: pal.text }]}>did you stay within your calorie target today?</Text>
              <View style={s.nbCheckBtns}>
                <TouchableOpacity style={s.nbCheckBtnGood} onPress={() => confirmNBAnswer(false)}>
                  <Text style={s.nbCheckBtnText}>✓  stayed within</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.nbCheckBtnOver} onPress={() => confirmNBAnswer(true)}>
                  <Text style={s.nbCheckBtnText}>↑  went over</Text>
                </TouchableOpacity>
              </View>
            </FadeCard>
          )}

          {/* Animated Macro Bars */}
          <FadeCard delay={300} style={[s.macroCard, { borderColor: pal.cardBorder }]}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16,
            }}>
              <MaterialCommunityIcons name="chart-donut" size={16} color={pal.accent} />
              <Text style={[s.macroCardTitle, { color: pal.textGray }]}>RECOVERY MACROS</Text>
            </View>
            <MacroBar label="Protein" grams={injuryData.proteinG} pct={injuryData.proteinPct}
              color="#EF4444" icon="food-steak" delay={400} />
            <MacroBar label="Carbs" grams={injuryData.carbsG} pct={injuryData.carbsPct}
              color="#F59E0B" icon="barley" delay={550} />
            <MacroBar label="Fat" grams={injuryData.fatG} pct={injuryData.fatPct}
              color="#3B82F6" icon="water" delay={700} />

            <View style={[s.healingBox, { backgroundColor: pal.softBg, borderColor: pal.cardBorder }]}>
              <MaterialCommunityIcons name="lightbulb-outline" size={14} color={pal.accent} />
              <Text style={[s.healingText, { color: pal.textSoft }]}>{injuryData.healingNotes}</Text>
            </View>
          </FadeCard>

          {/* Stats grid */}
          <FadeCard delay={400} style={[s.statsGrid, { borderColor: pal.cardBorder }]}>
            {[
              { val: injuryData.baseBmr, lbl: 'Base BMR', icon: 'heart-outline', color: '#6B7280' },
              { val: injuryData.injuryBmr, lbl: 'Recovery BMR', icon: 'heart-pulse', color: sev.color },
              { val: injuryData.tdee, lbl: 'Current TDEE', icon: 'fire', color: '#F59E0B' },
              { val: injuryData.recommendedCal, lbl: 'Daily Target', icon: 'target', color: pal.accent },
              { val: injuryData.dailyBurnAvg, lbl: 'Avg Burn/Day', icon: 'lightning-bolt', color: '#8B5CF6' },
              { val: injuryData.weeklyBurn, lbl: 'Weekly Burn', icon: 'calendar-clock', color: '#0891B2' },
            ].map((st, i) => (
              <View key={i} style={[s.statCell, { backgroundColor: st.color + '08', borderColor: st.color + '20' }]}>
                <MaterialCommunityIcons name={st.icon} size={16} color={st.color} style={{ marginBottom: 4 }} />
                <AnimatedNum value={st.val} style={[s.statVal, { color: st.color }]} />
                <Text style={s.statLbl}>{st.lbl}</Text>
              </View>
            ))}
          </FadeCard>

          {/* Warrior protocol */}
          <FadeCard delay={480}>
            <ProteinWarriorCard proteinStreak={proteinStreak} proteinConsumed={proteinConsumed} profile={profile} />
          </FadeCard>

          {/* Log meal button */}
          <FadeCard delay={500}>
            <TouchableOpacity style={s.logBtn} onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/MealLogScreen');
            }}>
              <LinearGradient colors={[pal.accent, pal.accentDark]} style={s.logBtnGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <MaterialCommunityIcons name="plus-circle" size={22} color="#fff" />
                <Text style={s.logBtnText}>Log a Meal</Text>
              </LinearGradient>
            </TouchableOpacity>
          </FadeCard>

          {/* Activity edit card */}
          <FadeCard delay={600} style={[s.actEditCard, { borderColor: pal.cardBorder }]}>
            <View style={s.actEditHeader}>
              <MaterialCommunityIcons name="run-fast" size={16} color={pal.accent} />
              <Text style={[s.actEditTitle, { color: pal.text }]}> current activity level</Text>
              <TouchableOpacity onPress={() => {
                Haptics.selectionAsync();
                setEditingActivities(!editingActivities);
              }} style={{ marginLeft: 'auto' }}>
                <Text style={[s.editLink, { color: pal.accent }]}>
                  {editingActivities ? 'cancel' : 'edit'}
                </Text>
              </TouchableOpacity>
            </View>

            {!editingActivities ? (
              <View style={s.tagWrap}>
                {Object.keys(injuryData.activitySettings || {}).map(name => {
                  const st = injuryData.activitySettings[name];
                  const d = RECOVERY_ACTIVITY_DATA[name];
                  if (!d) return null;
                  const wb = calcWeeklyBurn(name, st);
                  return (
                    <View key={name} style={[s.actTag, { borderColor: d.color + '50', backgroundColor: d.color + '10' }]}>
                      <MaterialCommunityIcons name={d.iconName} size={12} color={d.color} />
                      <Text style={[s.actTagText, { color: d.color }]}>
                        {name}  ·  {st.daysPerWeek ?? 7}x/wk  ·  {st.hoursPerDay ?? 1}h  ·  ~{Math.round(wb / 7)} kcal/day
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <>
                <Text style={[s.editHint, { color: pal.textGray }]}>
                  update what you can do — we'll recalculate your target instantly
                </Text>
                <ActivitySummaryBar activitySettings={activitySettings} pal={pal} />
                <ActivityPicker activitySettings={activitySettings} onChange={setActivitySettings}
                  accentColor={pal.accent} pal={pal} />
                <TouchableOpacity
                  style={[s.btnAccent, { backgroundColor: pal.accent, marginTop: 14 }]}
                  onPress={handleUpdateActivities}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                      <Text style={s.btnAccentText}>recalculate my plan</Text>
                      <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
                    </>
                  }
                </TouchableOpacity>
              </>
            )}
          </FadeCard>

          {/* Healed button */}
          <FadeCard delay={700}>
            <TouchableOpacity
              style={[s.healedBtn, { borderColor: '#D97706' }]}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                screenFade.setValue(0);
                setHealedStep('weight');
              }}
            >
              <LinearGradient
                colors={['#FFFBEB', '#FEF3C7']}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, paddingVertical: 16, borderRadius: 14,
                }}
              >
                <MaterialCommunityIcons name="party-popper" size={20} color="#D97706" />
                <Text style={s.healedBtnText}>I'm healed / recovered</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={[s.healedNote, { color: pal.textGray }]}>
              take all the time you need — press when you're truly ready
            </Text>
          </FadeCard>

          <View style={{ height: 48 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  return null;
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll: { padding: 20, paddingTop: 56 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, justifyContent: 'center',
    alignItems: 'center', marginBottom: 16, borderWidth: 1,
  },

  heroBox: { alignItems: 'center', marginBottom: 24 },
  heroEmoji: { fontSize: 44, marginBottom: 10 },
  heroTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 8, letterSpacing: -0.5 },
  heroSub: { fontSize: 13, textAlign: 'center', lineHeight: 21, maxWidth: 320 },

  catBlock: { marginBottom: 18 },
  catLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 1.2, marginBottom: 8 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  sevDot: { width: 7, height: 7, borderRadius: 4 },

  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 11, color: '#6B7280' },

  previewCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 20,
    borderWidth: 1.5, marginBottom: 14,
  },
  previewTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  previewMsg: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
  sevPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4,
  },
  sevPillText: { fontSize: 11, fontWeight: '700' },

  btnAccent: {
    borderRadius: 16, paddingVertical: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  btnAccentText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Summary bar
  summaryBar: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16,
    padding: 14, borderWidth: 1, marginBottom: 16,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 20, fontWeight: '800' },
  summaryLbl: { fontSize: 10, color: '#6B7280', marginTop: 3 },
  summaryDivider: { width: 1, marginVertical: 4 },

  // Activity picker
  actGroupLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 1.2, marginBottom: 8, marginTop: 4 },
  actCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, overflow: 'hidden', borderWidth: 1 },
  actHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  actIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actCopy: { flex: 1 },
  actTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  actName: { fontSize: 14, fontWeight: '700' },
  actDesc: { fontSize: 12, color: '#6B7280' },
  addedPill: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  addedPillText: { fontSize: 10, fontWeight: '700' },
  actExpanded: { paddingHorizontal: 14, paddingBottom: 14 },
  actDivider: { height: 1, marginBottom: 12 },

  settingLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8, marginBottom: 8 },
  btnRow: { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  numBtn: {
    width: 38, height: 38, borderRadius: 10, justifyContent: 'center',
    alignItems: 'center', borderWidth: 1,
  },
  numBtnText: { fontSize: 12, fontWeight: '700' },

  sportsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  sportChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: '#fff',
  },
  sportName: { fontSize: 12, fontWeight: '600' },

  calPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1,
  },
  calPreviewLabel: { fontSize: 11, color: '#6B7280' },
  calPreviewVal: { fontSize: 15, fontWeight: '800' },
  calPerDayBox: { alignItems: 'center' },
  calPerDay: { fontSize: 18, fontWeight: '900' },
  calPerDayLabel: { fontSize: 9, color: '#6B7280' },

  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  removeBtnText: { fontSize: 12, color: '#B91C1C', fontWeight: '600' },

  // Weight input
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  weightInput: {
    flex: 1, borderWidth: 1.5, borderRadius: 14, padding: 14,
    fontSize: 26, fontWeight: '800', textAlign: 'center', backgroundColor: '#fff',
  },
  weightUnit: { fontSize: 17, fontWeight: '700' },

  // Active screen
  activeHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  activeTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  sevBadge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  sevBadgeText: { fontSize: 12, fontWeight: '700' },

  warmCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 22,
    borderWidth: 1, marginBottom: 16, alignItems: 'center',
  },
  warmTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  warmMsg: { fontSize: 13, textAlign: 'center', lineHeight: 21 },

  ringCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 22,
    borderWidth: 1, marginBottom: 16, alignItems: 'center',
  },
  calNote: { fontSize: 11, textAlign: 'center', fontStyle: 'italic', marginTop: 12 },

  macroCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 20,
    borderWidth: 1, marginBottom: 16,
  },
  macroCardTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  healingBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    borderRadius: 12, padding: 12, borderWidth: 1, marginTop: 4,
  },
  healingText: { flex: 1, fontSize: 11, lineHeight: 17 },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    backgroundColor: '#fff', borderRadius: 22, padding: 12,
    borderWidth: 1, marginBottom: 16,
  },
  statCell: {
    width: (SCREEN_W - 80) / 3 - 6, alignItems: 'center',
    borderRadius: 14, paddingVertical: 12, borderWidth: 1,
  },
  statVal: { fontSize: 18, fontWeight: '900' },
  statLbl: { fontSize: 9, color: '#6B7280', marginTop: 3, textAlign: 'center' },

  logBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  logBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 17,
  },
  logBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  actEditCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 18,
    borderWidth: 1, marginBottom: 16,
  },
  actEditHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  actEditTitle: { fontSize: 13, fontWeight: '700' },
  editLink: { fontSize: 12, fontWeight: '700' },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5,
  },
  actTagText: { fontSize: 11, fontWeight: '600' },
  editHint: { fontSize: 12, marginBottom: 12, fontStyle: 'italic' },

  healedBtn: {
    borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, marginBottom: 8,
  },
  healedBtnText: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  healedNote: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 16 },

  // NB check-in
  nbCheckCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, marginBottom: 16,
  },
  nbCheckText: { fontSize: 13, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  nbCheckBtns: { flexDirection: 'column', gap: 10 },
  nbCheckBtnGood: {
    backgroundColor: '#16A34A', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  nbCheckBtnOver: {
    backgroundColor: '#EA580C', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  nbCheckBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
