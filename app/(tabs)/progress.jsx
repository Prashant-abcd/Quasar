import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { collection, getDocs, orderBy, query, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebaseConfig';
import { useFocusEffect } from '@react-navigation/native';
import Svg, {
  Path,
  Circle,
  Line,
  Text as SvgText,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from 'react-native-svg';
import { getLocalDateKey } from '../../utils/date';
import { getTimeLeft } from '../../utils/timeLeft';
import {
  formatDateKey,
  getCheatCompensationState,
  getEffectiveCalorieTarget,
} from '../../utils/cheatCompensation';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 48;
const CHART_H = 180;

function WeightChart({ history, goalWeight, startWeight }) {
  if (!history || history.length < 2) {
    return (
      <View style={{ alignItems: 'center', padding: 20 }}>
        <MaterialCommunityIcons name="chart-line" size={40} color="rgba(255,255,255,0.2)" />
        <Text style={{ color: 'rgba(255,255,255,0.3)', marginTop: 8, fontSize: 12 }}>
          log at least 2 weights to see your chart
        </Text>
      </View>
    );
  }

  const allWeights = [...history.map((entry) => entry.weight), goalWeight, startWeight];
  const minWeight = Math.min(...allWeights) - 1;
  const maxWeight = Math.max(...allWeights) + 1;
  const range = maxWeight - minWeight || 1;

  const toX = (index) => (index / Math.max(history.length - 1, 1)) * CHART_W;
  const toY = (weight) => CHART_H - ((weight - minWeight) / range) * CHART_H;

  const linePath = history
    .map((entry, index) => `${index === 0 ? 'M' : 'L'} ${toX(index).toFixed(1)} ${toY(entry.weight).toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${toX(history.length - 1).toFixed(1)} ${CHART_H} L 0 ${CHART_H} Z`;
  const goalY = toY(goalWeight);
  const startY = toY(startWeight);

  return (
    <Svg width={CHART_W} height={CHART_H + 20}>
      <Defs>
        <SvgGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#ff4030" stopOpacity="0.4" />
          <Stop offset="100%" stopColor="#ff4030" stopOpacity="0" />
        </SvgGradient>
      </Defs>

      <Line
        x1="0"
        y1={startY}
        x2={CHART_W}
        y2={startY}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="1"
        strokeDasharray="4,4"
      />
      <SvgText x={4} y={startY - 4} fontSize="9" fill="rgba(255,255,255,0.3)">
        start {startWeight}kg
      </SvgText>

      {goalY >= 0 && goalY <= CHART_H && (
        <>
          <Line
            x1="0"
            y1={goalY}
            x2={CHART_W}
            y2={goalY}
            stroke="#27ae60"
            strokeWidth="1.5"
            strokeDasharray="5,4"
          />
          <SvgText
            x={CHART_W - 4}
            y={goalY - 5}
            fontSize="9"
            fill="#27ae60"
            textAnchor="end"
          >
            goal {goalWeight}kg
          </SvgText>
        </>
      )}

      <Path d={areaPath} fill="url(#areaGrad)" />
      <Path
        d={linePath}
        fill="none"
        stroke="#ff4030"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {history.map((entry, index) => (
        <Circle
          key={index}
          cx={toX(index)}
          cy={toY(entry.weight)}
          r="4"
          fill={index === history.length - 1 ? '#ff4030' : '#fff'}
          stroke="#ff4030"
          strokeWidth="2"
        />
      ))}

      {history.map((entry, index) => {
        if (history.length > 6 && index % 2 !== 0) return null;
        const label = new Date(entry.loggedAt).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        });
        return (
          <SvgText
            key={`label-${index}`}
            x={toX(index)}
            y={CHART_H + 16}
            fontSize="8"
            fill="rgba(255,255,255,0.3)"
            textAnchor="middle"
          >
            {label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

export default function ProgressScreen() {
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [mealLogs, setMealLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        try {
          setLoading(true);
          const userId = auth.currentUser.uid;

          const profileSnap = await getDoc(doc(db, 'users', userId, 'profile', 'data'));
          if (profileSnap.exists()) {
            setProfile(profileSnap.data());
          }

          const historyQuery = query(
            collection(db, 'users', userId, 'weightHistory'),
            orderBy('loggedAt', 'asc')
          );
          const historySnapshot = await getDocs(historyQuery);
          setHistory(historySnapshot.docs.map((docSnap) => docSnap.data()));

          const logs = [];
          for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
            const date = new Date();
            date.setDate(date.getDate() - dayOffset);
            const dateKey = getLocalDateKey(date);

            try {
              const mealsSnapshot = await getDocs(
                collection(db, 'users', userId, 'logs', dateKey, 'meals')
              );
              const totalCalories = mealsSnapshot.docs.reduce(
                (sum, docSnap) => sum + (docSnap.data().calories || 0),
                0
              );
              logs.push({ date: dateKey, calories: totalCalories });
            } catch {
              logs.push({ date: dateKey, calories: 0 });
            }
          }

          setMealLogs(logs);
        } catch (error) {
          console.log('Progress fetch error:', error.message);
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
        <Text style={[styles.loadingText, { marginTop: 20 }]}>loading your journey...</Text>
      </View>
    );
  }

  const todayKey = getLocalDateKey();
  const baseTarget = profile?.dailyCalorieTarget || 0;
  const todayTarget = getEffectiveCalorieTarget(baseTarget, profile?.cheatCompensation, todayKey);
  const cheatCompensationState = getCheatCompensationState(profile?.cheatCompensation, todayKey);
  const compensationWindowLabel = cheatCompensationState.compensation
    ? `${formatDateKey(cheatCompensationState.compensation.startDateKey, { day: 'numeric', month: 'short' })} - ${formatDateKey(cheatCompensationState.compensation.endDateKey, { day: 'numeric', month: 'short' })}`
    : '';

  const startWeight = profile?.weight || 0;
  const currentWeight = profile?.currentWeight || startWeight;
  const goalWeight = profile?.goalWeight || 0;
  const totalToLose = startWeight - goalWeight;
  const lostSoFar = startWeight - currentWeight;
  const progressPct = totalToLose > 0
    ? Math.max(0, Math.min(Math.round((lostSoFar / totalToLose) * 100), 100))
    : 0;
  const isGained = lostSoFar < 0;

  const totalEntries = history.length;
  const bestDrop = totalEntries >= 2
    ? Math.min(...history.slice(1).map((entry, index) => entry.weight - history[index].weight))
    : 0;
  const loggedMealLogs = mealLogs.filter((log) => log.calories > 0);
  const avgDailyCalories = loggedMealLogs.length > 0
    ? Math.round(loggedMealLogs.reduce((sum, log) => sum + log.calories, 0) / loggedMealLogs.length)
    : 0;
  const daysLogged = loggedMealLogs.length;
  const daysWithinTarget = loggedMealLogs.filter(
    (log) => log.calories <= getEffectiveCalorieTarget(baseTarget, profile?.cheatCompensation, log.date)
  ).length;

  return (
          <LinearGradient colors={['#000000', '#050101', '#0a0202']} locations={[0, 0.5, 1]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Progress</Text>
            <Text style={styles.headerSub}>your journey so far, one clean week at a time</Text>
          </View>
          <View style={styles.headerBadge}>
            <MaterialCommunityIcons name="trophy" size={18} color="#f39c12" />
          </View>
        </View>

        <View style={styles.heroCard}>
          <LinearGradient
            colors={['rgba(255,60,30,0.3)', 'rgba(10,2,2,0.6)']}
            style={styles.heroGradient}
          >
            <View style={styles.heroRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>STARTED</Text>
                <Text style={styles.heroStatVal}>{startWeight}</Text>
                <Text style={styles.heroUnit}>kg</Text>
              </View>
              <View style={styles.heroCenterBlock}>
                <Text style={styles.heroCenterLabel}>CURRENT</Text>
                <Text style={[styles.bigWeight, { color: isGained ? '#ff4030' : '#fff' }]}>
                  {currentWeight}
                </Text>
                <Text style={styles.heroUnit2}>kg</Text>
                {lostSoFar !== 0 && (
                  <View
                    style={[
                      styles.lostBadge,
                      {
                        backgroundColor: isGained
                          ? 'rgba(231,76,60,0.15)'
                          : 'rgba(39,174,96,0.15)',
                        borderColor: isGained
                          ? 'rgba(231,76,60,0.25)'
                          : 'rgba(39,174,96,0.25)',
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={isGained ? 'trending-up' : 'trending-down'}
                      size={12}
                      color={isGained ? '#ff4030' : '#27ae60'}
                    />
                    <Text
                      style={[
                        styles.lostBadgeText,
                        { color: isGained ? '#ff4030' : '#27ae60' },
                      ]}
                    >
                      {isGained ? '+' : '-'}{Math.abs(lostSoFar).toFixed(1)} kg
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>GOAL</Text>
                <Text style={[styles.heroStatVal, { color: '#27ae60' }]}>{goalWeight}</Text>
                <Text style={styles.heroUnit}>kg</Text>
              </View>
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progressPct}%`,
                      backgroundColor: isGained ? '#ff4030' : '#27ae60',
                    },
                  ]}
                />
                <View
                  style={[
                    styles.progressThumb,
                    {
                      left: `${progressPct}%`,
                      borderColor: isGained ? '#ff4030' : '#27ae60',
                    },
                  ]}
                />
              </View>
              <View style={styles.progressLabels}>
                <Text style={styles.progressLabelTxt}>{startWeight} kg</Text>
                <Text style={[styles.progressPct, { color: isGained ? '#ff4030' : '#27ae60' }]}>
                  {progressPct}% done
                </Text>
                <Text style={styles.progressLabelTxt}>{goalWeight} kg</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <MaterialCommunityIcons name="scale-bathroom" size={16} color="#ff4030" />
            <Text style={styles.statChipVal}>{totalEntries}</Text>
            <Text style={styles.statChipLabel}>weigh-ins</Text>
          </View>
          <View style={styles.statChip}>
            <MaterialCommunityIcons name="fire" size={16} color="#f39c12" />
            <Text style={styles.statChipVal}>{daysLogged}/7</Text>
            <Text style={styles.statChipLabel}>days logged</Text>
          </View>
          <View style={styles.statChip}>
            <MaterialCommunityIcons name="trending-down" size={16} color="#27ae60" />
            <Text style={styles.statChipVal}>{getTimeLeft(profile).label}</Text>
            <Text style={styles.statChipLabel}>time left</Text>
          </View>
          <View style={styles.statChip}>
            <MaterialCommunityIcons name="lightning-bolt" size={16} color="#8e44ad" />
            <Text style={styles.statChipVal}>{profile?.dailyDeficit}</Text>
            <Text style={styles.statChipLabel}>deficit</Text>
          </View>
        </View>

        {cheatCompensationState.isBlocked && (
          <View style={styles.compensationBanner}>
            <View style={styles.compensationBannerIcon}>
              <MaterialCommunityIcons
                name={cheatCompensationState.isActive ? 'shield-alert-outline' : 'calendar-arrow-right'}
                size={18}
                color="#ff8f86"
              />
            </View>
            <View style={styles.compensationBannerCopy}>
              <Text style={styles.compensationBannerTitle}>
                {cheatCompensationState.isCheatDay
                  ? `Cheat day active: +${Math.max(todayTarget - baseTarget, 0)} kcal today`
                  : cheatCompensationState.isActive
                    ? `Recovery active: -${Math.max(baseTarget - todayTarget, 0)} kcal today`
                    : 'Recovery queued for tomorrow'}
              </Text>
              <Text style={styles.compensationBannerSub}>
                {cheatCompensationState.isCheatDay
                  ? `${cheatCompensationState.compensation?.excessCalories ?? 0} extra kcal is open for today. Recovery still runs ${compensationWindowLabel}.`
                  : cheatCompensationState.isActive
                    ? `${cheatCompensationState.daysRemaining} day${cheatCompensationState.daysRemaining === 1 ? '' : 's'} left. Window ${compensationWindowLabel}.`
                    : `${cheatCompensationState.compensation?.excessCalories ?? 0} kcal gets spread across ${cheatCompensationState.compensation?.compensationDays ?? 0} days. Window ${compensationWindowLabel}.`}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.chartCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="chart-line-variant" size={16} color="#ff4030" />
            <Text style={styles.sectionTitle}> Weight Over Time</Text>
          </View>
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#ff4030' }]} />
              <Text style={styles.legendTxt}>actual weight</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#27ae60' }]} />
              <Text style={styles.legendTxt}>goal line</Text>
            </View>
          </View>
          <View style={{ marginTop: 12 }}>
            <WeightChart history={history} goalWeight={goalWeight} startWeight={startWeight} />
          </View>
          {history.length === 0 && (
            <Text style={styles.noDataNote}>log your weight to start tracking</Text>
          )}
        </View>

        <View style={styles.chartCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="food-apple" size={16} color="#f39c12" />
            <Text style={styles.sectionTitle}> Calorie Log - Last 7 Days</Text>
          </View>
          <View style={styles.calBarRow}>
            {mealLogs.map((log, index) => {
              const target = getEffectiveCalorieTarget(baseTarget, profile?.cheatCompensation, log.date) || 1;
              const pct = Math.min((log.calories / target) * 100, 120);
              const isOver = log.calories > target;
              const isToday = index === mealLogs.length - 1;
              const dayLabel = formatDateKey(log.date, { weekday: 'short' });

              return (
                <View key={log.date} style={styles.calBarItem}>
                  <Text style={styles.calBarVal}>{log.calories > 0 ? log.calories : '-'}</Text>
                  <View style={styles.calBarTrack}>
                    <View
                      style={[
                        styles.calBarFill,
                        {
                          height: `${Math.max(pct, log.calories > 0 ? 5 : 0)}%`,
                          backgroundColor: isOver ? '#ff4030' : '#27ae60',
                          opacity: isToday ? 1 : 0.6,
                        },
                      ]}
                    />
                    <View style={styles.calBarTargetLine} />
                  </View>
                  <Text style={[styles.calBarDay, isToday && { color: '#ff4030', fontWeight: '700' }]}>
                    {dayLabel}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={styles.calLegendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#27ae60' }]} />
              <Text style={styles.legendTxt}>under target</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#ff4030' }]} />
              <Text style={styles.legendTxt}>over target</Text>
            </View>
            <Text style={styles.legendTxt}>- = not logged</Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="poll" size={16} color="#3498db" />
            <Text style={styles.sectionTitle}> Weekly Summary</Text>
          </View>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryCellVal}>{avgDailyCalories || '-'}</Text>
              <Text style={styles.summaryCellLabel}>avg kcal/day</Text>
            </View>
            <View style={styles.summaryCellDivider} />
            <View style={styles.summaryCell}>
              <Text style={styles.summaryCellVal}>{todayTarget || '-'}</Text>
              <Text style={styles.summaryCellLabel}>today target</Text>
            </View>
            <View style={styles.summaryCellDivider} />
            <View style={styles.summaryCell}>
              <Text
                style={[
                  styles.summaryCellVal,
                  {
                    color: daysLogged === 0 || daysWithinTarget === daysLogged ? '#27ae60' : '#ff4030',
                  },
                ]}
              >
                {daysLogged > 0 ? `${daysWithinTarget}/${daysLogged}` : '-'}
              </Text>
              <Text style={styles.summaryCellLabel}>days in range</Text>
            </View>
          </View>

          <View style={[styles.summaryGrid, { marginTop: 12 }]}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryCellVal}>
                {bestDrop < 0 ? `${Math.abs(bestDrop).toFixed(1)} kg` : '-'}
              </Text>
              <Text style={styles.summaryCellLabel}>best single drop</Text>
            </View>
            <View style={styles.summaryCellDivider} />
            <View style={styles.summaryCell}>
              <Text style={styles.summaryCellVal}>
                {lostSoFar > 0 ? `${lostSoFar.toFixed(1)} kg` : '0 kg'}
              </Text>
              <Text style={styles.summaryCellLabel}>total lost</Text>
            </View>
            <View style={styles.summaryCellDivider} />
            <View style={styles.summaryCell}>
              <Text style={styles.summaryCellVal}>
                {((profile?.dailyDeficit || 0) * 7 / 7700).toFixed(2)} kg
              </Text>
              <Text style={styles.summaryCellLabel}>est. weekly loss</Text>
            </View>
          </View>
        </View>

        {history.length > 0 && (
          <View style={styles.chartCard}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="history" size={16} color="#8e44ad" />
              <Text style={styles.sectionTitle}> Weight Log History</Text>
            </View>
            {[...history].reverse().map((entry, index) => {
              const label = new Date(entry.loggedAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: '2-digit',
              });
              const previousEntry = history[history.length - 1 - index - 1];
              const delta = previousEntry
                ? Math.round((entry.weight - previousEntry.weight) * 10) / 10
                : null;

              return (
                <View key={index} style={[styles.historyRow, index === 0 && { borderTopWidth: 0 }]}>
                  <View
                    style={[
                      styles.historyDot,
                      {
                        backgroundColor: delta !== null && delta <= 0 ? '#27ae60' : '#ff4030',
                      },
                    ]}
                  />
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

        <View style={styles.planReminderCard}>
          <Text style={styles.planReminderTitle}>current plan</Text>
          {cheatCompensationState.isBlocked && (
            <View style={styles.planReminderNote}>
              <Text style={styles.planReminderNoteText}>
                {cheatCompensationState.isCheatDay
                  ? `Cheat day live: today runs ${todayTarget} kcal, then recovery starts tomorrow.`
                  : cheatCompensationState.isActive
                    ? `Recovery live: today runs ${todayTarget} kcal instead of ${baseTarget}.`
                    : `Recovery starts tomorrow and trims the next ${cheatCompensationState.compensation?.compensationDays ?? 0} days.`}
              </Text>
            </View>
          )}
          <View style={styles.planReminderRow}>
            <View style={styles.planReminderItem}>
              <MaterialCommunityIcons name="fire" size={18} color="#ff4030" />
              <Text style={styles.planReminderVal}>{todayTarget}</Text>
              <Text style={styles.planReminderLabel}>today target</Text>
            </View>
            <View style={styles.planReminderItem}>
              <MaterialCommunityIcons name="trending-down" size={18} color="#3498db" />
              <Text style={styles.planReminderVal}>{profile?.dailyDeficit}</Text>
              <Text style={styles.planReminderLabel}>deficit</Text>
            </View>
            <View style={styles.planReminderItem}>
              <MaterialCommunityIcons name="speedometer" size={18} color="#8e44ad" />
              <Text style={styles.planReminderVal}>{profile?.tdee}</Text>
              <Text style={styles.planReminderLabel}>TDEE</Text>
            </View>
            <View style={styles.planReminderItem}>
              <MaterialCommunityIcons name="calendar-check" size={18} color="#27ae60" />
              <Text style={styles.planReminderVal}>{getTimeLeft(profile).label}</Text>
              <Text style={styles.planReminderLabel}>time left</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingTop: 56, paddingHorizontal: 18, paddingBottom: 56 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: 'rgba(255,255,255,0.4)', fontSize: 13 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  headerTitle: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.32)', marginTop: 4 },
  headerBadge: {
    width: 42, height: 42, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(243,156,18,0.1)',
    borderWidth: 0.5, borderColor: 'rgba(243,156,18,0.25)',
  },

  heroCard: { borderRadius: 28, overflow: 'hidden', marginBottom: 10, borderWidth: 0.5, borderColor: 'rgba(255,60,30,0.35)' },
  heroGradient: { padding: 22 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  heroStat: { alignItems: 'center', flex: 1 },
  heroStatLabel: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', marginBottom: 6, fontWeight: '700' },
  heroStatVal: { fontSize: 26, fontWeight: '800', color: '#fff' },
  heroUnit: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  heroCenterBlock: { alignItems: 'center', flex: 1.4 },
  heroCenterLabel: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontWeight: '700' },
  bigWeight: { fontSize: 52, fontWeight: '900', letterSpacing: -1.5, lineHeight: 56 },
  heroUnit2: { fontSize: 14, color: 'rgba(255,255,255,0.35)', marginTop: -4 },
  lostBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, marginTop: 6, borderWidth: 0.5,
  },
  lostBadgeText: { fontSize: 11, fontWeight: '700' },

  progressSection: { gap: 8 },
  progressTrack: { height: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'visible', position: 'relative' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressThumb: { position: 'absolute', top: -6, width: 17, height: 17, borderRadius: 9, backgroundColor: '#fff', borderWidth: 2.5, marginLeft: -8 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabelTxt: { fontSize: 10, color: 'rgba(255,255,255,0.3)' },
  progressPct: { fontSize: 11, fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statChip: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.07)',
  },
  statChipVal: { fontSize: 17, fontWeight: '900', color: '#fff' },
  statChipLabel: { fontSize: 9, color: 'rgba(255,255,255,0.32)', textAlign: 'center', letterSpacing: 0.3 },

  compensationBanner: {
    flexDirection: 'row', gap: 12, padding: 16, borderRadius: 20, marginBottom: 10,
    backgroundColor: 'rgba(155,89,182,0.1)',
    borderWidth: 0.5, borderColor: 'rgba(155,89,182,0.2)',
  },
  compensationBannerIcon: {
    width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(155,89,182,0.15)',
    borderWidth: 0.5, borderColor: 'rgba(155,89,182,0.25)',
  },
  compensationBannerCopy: { flex: 1 },
  compensationBannerTitle: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 4 },
  compensationBannerSub: { fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.45)' },

  chartCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 22, padding: 18, marginBottom: 10,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.07)',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.72)', letterSpacing: 0.3 },
  chartLegend: { flexDirection: 'row', gap: 14, marginTop: 8, marginBottom: 2 },
  calLegendRow: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendTxt: { fontSize: 10, color: 'rgba(255,255,255,0.32)' },
  noDataNote: { color: 'rgba(255,255,255,0.22)', fontSize: 12, textAlign: 'center', marginTop: 12 },

  calBarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 110, marginTop: 12 },
  calBarItem: { flex: 1, alignItems: 'center', gap: 4 },
  calBarVal: { fontSize: 8, color: 'rgba(255,255,255,0.38)', textAlign: 'center' },
  calBarTrack: {
    flex: 1, width: '100%', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 5, overflow: 'hidden', position: 'relative', justifyContent: 'flex-end',
  },
  calBarFill: { width: '100%', borderRadius: 5 },
  calBarTargetLine: { position: 'absolute', left: 0, right: 0, top: '16.7%', height: 0.5, backgroundColor: 'rgba(255,255,255,0.2)' },
  calBarDay: { fontSize: 9, color: 'rgba(255,255,255,0.32)' },

  summaryGrid: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryCellVal: { fontSize: 22, fontWeight: '900', color: '#fff' },
  summaryCellLabel: { fontSize: 9, color: 'rgba(255,255,255,0.32)', marginTop: 3, textAlign: 'center', letterSpacing: 0.3 },
  summaryCellDivider: { width: 0.5, height: 36, backgroundColor: 'rgba(255,255,255,0.08)' },

  historyRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 11,
    borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.05)', gap: 10,
  },
  historyDot: { width: 7, height: 7, borderRadius: 4 },
  historyDate: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.42)' },
  historyWeight: { fontSize: 16, fontWeight: '900', color: '#fff' },
  historyDelta: { fontSize: 12, fontWeight: '700', minWidth: 52, textAlign: 'right' },

  planReminderCard: {
    backgroundColor: 'rgba(255,60,30,0.08)', borderRadius: 20, padding: 18, marginBottom: 10,
    borderWidth: 0.5, borderColor: 'rgba(255,60,30,0.18)',
  },
  planReminderTitle: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.55)', marginBottom: 14 },
  planReminderNote: {
    marginBottom: 14, padding: 12, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.07)',
  },
  planReminderNoteText: { fontSize: 11, lineHeight: 17, color: 'rgba(255,255,255,0.6)' },
  planReminderRow: { flexDirection: 'row', justifyContent: 'space-around' },
  planReminderItem: { alignItems: 'center', gap: 4 },
  planReminderVal: { fontSize: 22, fontWeight: '900', color: '#fff' },
  planReminderLabel: { fontSize: 10, color: 'rgba(255,255,255,0.32)' },
});
