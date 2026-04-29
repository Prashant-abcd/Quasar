/**
 * Shared Workout Editor — standard activities only (no recovery-only).
 * Used on Dashboard, ThermicEngineScreen, DeficitCyclingScreen.
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RECOVERY_ACTIVITY_DATA, calcWeeklyBurn, calcTotalWeeklyBurn } from '../utils/injuryData';

const STANDARD_ENTRIES = Object.entries(RECOVERY_ACTIVITY_DATA).filter(([, d]) => !d.recoveryOnly);

function SummaryBar({ activitySettings, accent }) {
  const count = Object.keys(activitySettings).length;
  const weekly = calcTotalWeeklyBurn(activitySettings);
  const daily = Math.round(weekly / 7);
  return (
    <View style={[st.summaryBar, { borderColor: accent + '25' }]}>
      <View style={st.summaryCell}>
        <Text style={[st.summaryVal, { color: accent }]}>{count}</Text>
        <Text style={st.summaryLbl}>Selected</Text>
      </View>
      <View style={[st.summaryDivider, { backgroundColor: accent + '25' }]} />
      <View style={st.summaryCell}>
        <Text style={[st.summaryVal, { color: accent }]}>{daily}</Text>
        <Text style={st.summaryLbl}>Avg kcal/day</Text>
      </View>
      <View style={[st.summaryDivider, { backgroundColor: accent + '25' }]} />
      <View style={st.summaryCell}>
        <Text style={[st.summaryVal, { color: accent }]}>{weekly}</Text>
        <Text style={st.summaryLbl}>Kcal/week</Text>
      </View>
    </View>
  );
}

function Picker({ activitySettings, onChange, accent }) {
  const [expanded, setExpanded] = useState(null);

  const isSelected = (name) => !!activitySettings[name];
  const getSetting = (name) => activitySettings[name] || {};

  const toggle = (name) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isSelected(name)) {
      setExpanded(expanded === name ? null : name);
    } else {
      onChange({ ...activitySettings, [name]: { daysPerWeek: 3, hoursPerDay: 1 } });
      setExpanded(name);
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
    if (expanded === name) setExpanded(null);
  };

  return (
    <View>
      {STANDARD_ENTRIES.map(([actName, actData]) => {
        const sel = isSelected(actName);
        const exp = expanded === actName;
        const settings = getSetting(actName);
        const selSport = actData.hasSubOptions && settings.selectedSport
          ? actData.subOptions?.find(sp => sp.name === settings.selectedSport) : null;
        const cph = selSport?.caloriesPerHour || actData.caloriesPerHour || 0;
        const days = settings.daysPerWeek ?? 3;
        const hrs = settings.hoursPerDay ?? 1;
        const weeklyBurn = Math.round(cph * days * hrs);
        const ac = actData.color;

        return (
          <View key={actName} style={[st.actCard, { borderColor: sel ? ac : '#E5E7EB' }, sel && { borderWidth: 1.5 }]}>
            <TouchableOpacity style={st.actHeader} activeOpacity={0.88} onPress={() => toggle(actName)}>
              <View style={[st.actIconBox, { backgroundColor: ac + '22' }]}>
                <MaterialCommunityIcons name={actData.iconName} size={24} color={ac} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={st.actTitleRow}>
                  <Text style={st.actName}>{actName}</Text>
                  {sel && (
                    <View style={[st.addedPill, { backgroundColor: ac + '18', borderColor: ac + '35' }]}>
                      <Text style={[st.addedPillText, { color: ac }]}>Added</Text>
                    </View>
                  )}
                </View>
                <Text style={st.actDesc}>
                  {sel
                    ? `${actData.hasSubOptions && settings.selectedSport ? settings.selectedSport + '  ·  ' : ''}${days}x/week  ·  ${hrs}h/session`
                    : actData.desc}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={sel ? (exp ? 'chevron-up' : 'chevron-down') : 'plus'}
                size={22} color={sel ? ac : accent}
              />
            </TouchableOpacity>

            {sel && exp && (
              <View style={st.actExpanded}>
                <View style={st.actDivider} />

                <Text style={st.settingLabel}>Days per week</Text>
                <View style={st.btnRow}>
                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                    <TouchableOpacity key={d}
                      style={[st.numBtn, days === d && { backgroundColor: ac, borderColor: ac }]}
                      onPress={() => updateSetting(actName, 'daysPerWeek', d)}
                    >
                      <Text style={[st.numBtnText, days === d && { color: '#fff' }]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={st.settingLabel}>Hours per session</Text>
                <View style={st.btnRow}>
                  {[0.5, 1, 1.5, 2, 2.5, 3].map(h => (
                    <TouchableOpacity key={h}
                      style={[st.numBtn, hrs === h && { backgroundColor: ac, borderColor: ac }]}
                      onPress={() => updateSetting(actName, 'hoursPerDay', h)}
                    >
                      <Text style={[st.numBtnText, hrs === h && { color: '#fff' }]}>{h}h</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {actData.hasSubOptions && actData.subOptions && (
                  <>
                    <Text style={st.settingLabel}>Select your sport</Text>
                    <View style={st.sportsGrid}>
                      {actData.subOptions.map(sport => {
                        const active = settings.selectedSport === sport.name;
                        return (
                          <TouchableOpacity key={sport.name}
                            style={[st.sportChip, active && { backgroundColor: ac, borderColor: ac }]}
                            onPress={() => updateSetting(actName, 'selectedSport', sport.name)}
                          >
                            <MaterialCommunityIcons name={sport.iconName} size={16} color={active ? '#fff' : '#555'} />
                            <Text style={[st.sportName, active && { color: '#fff' }]}>{sport.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                <View style={[st.calPreview, { backgroundColor: ac + '12', borderColor: ac + '30' }]}>
                  <MaterialCommunityIcons name="fire" size={18} color={ac} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.calPreviewLabel}>Estimated weekly burn</Text>
                    <Text style={[st.calPreviewVal, { color: ac }]}>{weeklyBurn} kcal/week</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={[st.calPerDay, { color: ac }]}>{Math.round(weeklyBurn / 7)}</Text>
                    <Text style={st.calPerDayLabel}>kcal/day avg</Text>
                  </View>
                </View>

                <TouchableOpacity style={st.removeBtn} onPress={() => remove(actName)}>
                  <MaterialCommunityIcons name="trash-can-outline" size={15} color="#B91C1C" />
                  <Text style={st.removeBtnText}>Remove activity</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Main export: collapsible workout editor card.
 * Props:
 *  - activitySettings: current activities object
 *  - onSave(newSettings): called when user taps "Recalculate"
 *  - accent: theme accent color
 *  - saving: boolean loading state
 *  - cardBorder: border color for the wrapper card
 */
export default function WorkoutEditor({ activitySettings, onSave, accent = '#ff4030', saving = false, cardBorder = '#E5E7EB', dark = false }) {
  // Theme-aware colors
  const T = dark
    ? { bg: 'rgba(255,255,255,0.04)', text: '#fff', textSoft: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.08)' }
    : { bg: '#fff', text: '#1F2937', textSoft: '#6B7280', border: '#E5E7EB' };
  const [editing, setEditing] = useState(false);
  const [localSettings, setLocalSettings] = useState({ ...activitySettings });

  const handleOpen = () => {
    setLocalSettings({ ...activitySettings });
    setEditing(true);
  };

  const handleSave = () => {
    onSave(localSettings);
    setEditing(false);
  };

  const weekly = calcTotalWeeklyBurn(activitySettings);
  const daily = Math.round(weekly / 7);

  return (
    <View style={[st.wrapper, { borderColor: cardBorder, backgroundColor: T.bg }]}>
      <View style={st.headerRow}>
        <MaterialCommunityIcons name="dumbbell" size={18} color={accent} />
        <Text style={[st.headerText, { color: T.text }]}>Workout Setup</Text>
        <TouchableOpacity
          style={[st.editToggle, { borderColor: accent + '40' }]}
          onPress={() => editing ? setEditing(false) : handleOpen()}
        >
          <MaterialCommunityIcons name={editing ? 'close' : 'pencil'} size={14} color={accent} />
          <Text style={[st.editToggleText, { color: accent }]}>{editing ? 'cancel' : 'edit'}</Text>
        </TouchableOpacity>
      </View>

      {!editing ? (
        <>
          {/* Current activities as tags */}
          <View style={st.tagsRow}>
            {Object.entries(activitySettings).map(([name, settings]) => {
              const d = RECOVERY_ACTIVITY_DATA[name];
              if (!d) return null;
              return (
                <View key={name} style={[st.tag, { borderColor: d.color + '50', backgroundColor: d.color + '10' }]}>
                  <MaterialCommunityIcons name={d.iconName} size={12} color={d.color} />
                  <Text style={[st.tagText, { color: d.color }]}>
                    {name}  ·  {settings.daysPerWeek ?? 3}x/wk  ·  ~{Math.round(calcWeeklyBurn(name, settings) / 7)} kcal/day
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={st.quickStats}>
            <Text style={[st.quickStat, { color: T.textSoft }]}><Text style={{ fontWeight: '800', color: accent }}>{daily}</Text> kcal/day avg</Text>
            <Text style={[st.quickStatDot, { color: T.border }]}>·</Text>
            <Text style={[st.quickStat, { color: T.textSoft }]}><Text style={{ fontWeight: '800', color: accent }}>{weekly}</Text> kcal/week</Text>
          </View>
        </>
      ) : (
        <>
          <SummaryBar activitySettings={localSettings} accent={accent} />
          <Picker activitySettings={localSettings} onChange={setLocalSettings} accent={accent} />
          <TouchableOpacity
            style={[st.saveBtn, { backgroundColor: accent }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                <Text style={st.saveBtnText}>recalculate my plan</Text>
                <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
              </>
            }
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff', borderRadius: 22, padding: 16,
    borderWidth: 1, marginBottom: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  headerText: { flex: 1, fontSize: 14, fontWeight: '800', color: '#1F2937' },
  editToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
  editToggleText: { fontSize: 12, fontWeight: '700' },

  tagsRow: { gap: 6, marginBottom: 10 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5,
  },
  tagText: { fontSize: 11, fontWeight: '600' },
  quickStats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quickStat: { fontSize: 12, color: '#6B7280' },
  quickStatDot: { fontSize: 12, color: '#D1D5DB' },

  summaryBar: {
    flexDirection: 'row', backgroundColor: '#F9FAFB', borderRadius: 16,
    padding: 14, borderWidth: 1, marginBottom: 16,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 20, fontWeight: '800' },
  summaryLbl: { fontSize: 10, color: '#6B7280', marginTop: 3 },
  summaryDivider: { width: 1, marginVertical: 4 },

  actCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, overflow: 'hidden', borderWidth: 1 },
  actHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  actIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  actName: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  actDesc: { fontSize: 12, color: '#6B7280' },
  addedPill: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  addedPillText: { fontSize: 10, fontWeight: '700' },
  actExpanded: { paddingHorizontal: 14, paddingBottom: 14 },
  actDivider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 12 },
  settingLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8, marginBottom: 8 },
  btnRow: { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  numBtn: {
    width: 38, height: 38, borderRadius: 10, justifyContent: 'center',
    alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  numBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  sportsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  sportChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: '#fff', borderColor: '#E5E7EB',
  },
  sportName: { fontSize: 12, fontWeight: '600', color: '#374151' },
  calPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1,
  },
  calPreviewLabel: { fontSize: 11, color: '#6B7280' },
  calPreviewVal: { fontSize: 15, fontWeight: '800' },
  calPerDay: { fontSize: 18, fontWeight: '900' },
  calPerDayLabel: { fontSize: 9, color: '#6B7280' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  removeBtnText: { fontSize: 12, color: '#B91C1C', fontWeight: '600' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 14, marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
