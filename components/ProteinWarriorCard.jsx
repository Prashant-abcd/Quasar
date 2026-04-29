/**
 * Shared Protein Warrior Badge Card + Hierarchy Modal
 * Used in: DeficitCyclingScreen, ThermicEngineScreen
 * (Dashboard has its own inline version)
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  PROTEIN_BADGES, getProteinGoal, getBadgeForScore, getNextBadge,
} from '../utils/proteinStreak';

export default function ProteinWarriorCard({ proteinStreak, proteinConsumed, profile }) {
  const [modalVisible, setModalVisible] = useState(false);

  const badge = getBadgeForScore(proteinStreak.badgeScore);
  const nextBadge = getNextBadge(proteinStreak.badgeScore);
  const proteinGoal = getProteinGoal(profile);
  const proteinPct = proteinGoal > 0 ? Math.min(proteinConsumed / proteinGoal, 1) : 0;
  const scorePct = nextBadge
    ? (proteinStreak.badgeScore - badge.minScore) / (nextBadge.minScore - badge.minScore)
    : 1;

  return (
    <>
      <TouchableOpacity
        style={[s.card, { borderColor: badge.borderColor + '55' }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.88}
      >
        <LinearGradient
          colors={['rgba(15,2,3,0.96)', 'rgba(25,5,6,0.98)']}
          style={s.cardGrad}
        >
          {/* Header */}
          <View style={s.cardHeader}>
            <MaterialCommunityIcons name="sword-cross" size={13} color={badge.color} />
            <Text style={[s.eyebrow, { color: badge.color }]}>WARRIOR PROTOCOL</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color="rgba(255,255,255,0.25)" />
          </View>

          {/* Badge + streak row */}
          <View style={s.mainRow}>
            <View style={[s.medallion, { borderColor: badge.borderColor, shadowColor: badge.glowColor }]}>
              <LinearGradient colors={badge.gradColors} style={s.medallionGrad}>
                <Text style={s.medallionEmoji}>{badge.emoji}</Text>
              </LinearGradient>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.badgeName, { color: badge.color }]}>{badge.name}</Text>
              <Text style={s.subtitle}>{badge.subtitle}</Text>
              <View style={s.streakRow}>
                <View style={s.streakChip}>
                  <Text style={s.chipEmoji}>🔥</Text>
                  <Text style={s.chipVal}>{proteinStreak.currentStreak}</Text>
                  <Text style={s.chipLbl}>day streak</Text>
                </View>
                {proteinStreak.shields > 0 && (
                  <View style={s.shieldChip}>
                    <Text style={s.chipEmoji}>🛡️</Text>
                    <Text style={s.chipVal}>{proteinStreak.shields}</Text>
                    <Text style={s.chipLbl}>shields</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Score progress */}
          <View style={{ marginBottom: 10 }}>
            <View style={s.progLabelRow}>
              <Text style={s.progLabel}>{proteinStreak.badgeScore} pts</Text>
              <Text style={s.progLabel}>
                {nextBadge ? `${nextBadge.minScore} → ${nextBadge.name}` : 'MAX RANK'}
              </Text>
            </View>
            <View style={s.progBg}>
              <LinearGradient
                colors={[badge.borderColor, badge.color]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.progFill, { width: `${Math.round(scorePct * 100)}%` }]}
              />
            </View>
          </View>

          {/* Today's protein */}
          <View>
            <View style={s.progLabelRow}>
              <Text style={s.progLabel}>today's protein</Text>
              <Text style={[s.proteinVal, {
                color: proteinConsumed >= proteinGoal ? '#4ADE80' : 'rgba(255,255,255,0.6)',
              }]}>
                {Math.round(proteinConsumed)}g / {proteinGoal}g
              </Text>
            </View>
            <View style={s.progBg}>
              <LinearGradient
                colors={proteinConsumed >= proteinGoal ? ['#16A34A', '#4ADE80'] : ['#ff4030', '#ff6b4a']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.progFill, { width: `${Math.round(proteinPct * 100)}%` }]}
              />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* ══ Badge Hierarchy Modal ══ */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
        statusBarTranslucent
      >
        <LinearGradient colors={['#0a0002', '#150104', '#200305']} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={s.bhHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={s.bhClose}>
                <MaterialCommunityIcons name="chevron-down" size={26} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
              <Text style={s.bhTitle}>Warrior Protocol</Text>
              <Text style={s.bhSub}>your path to immortality</Text>
            </View>

            {/* Hero */}
            <View style={s.bhHero}>
              <View style={[s.bhHeroMedallion, { borderColor: badge.borderColor, shadowColor: badge.glowColor }]}>
                <LinearGradient colors={badge.gradColors} style={s.bhHeroMedallionGrad}>
                  <Text style={s.bhHeroEmoji}>{badge.emoji}</Text>
                </LinearGradient>
              </View>
              <Text style={[s.bhHeroName, { color: badge.color }]}>{badge.name}</Text>
              <Text style={s.bhHeroSubtitle}>{badge.subtitle}</Text>

              <View style={s.bhStatsRow}>
                {[
                  { e: '🔥', v: proteinStreak.currentStreak, l: 'day streak' },
                  { e: '⚡', v: proteinStreak.badgeScore, l: 'badge score' },
                  { e: '🛡️', v: proteinStreak.shields, l: 'shields' },
                  { e: '🏹', v: proteinStreak.totalCompletions, l: 'victories' },
                ].map((st, i) => (
                  <View key={i} style={s.bhStatChip}>
                    <Text style={s.bhStatEmoji}>{st.e}</Text>
                    <Text style={s.bhStatVal}>{st.v}</Text>
                    <Text style={s.bhStatLbl}>{st.l}</Text>
                  </View>
                ))}
              </View>

              {nextBadge && (
                <View style={s.bhHeroProgress}>
                  <View style={s.progLabelRow}>
                    <Text style={s.bhProgLabel}>{proteinStreak.badgeScore} pts</Text>
                    <Text style={s.bhProgLabel}>{nextBadge.minScore} pts → {nextBadge.name}</Text>
                  </View>
                  <View style={s.bhProgBg}>
                    <LinearGradient
                      colors={[badge.borderColor, badge.color]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[s.progFill, { width: `${Math.round(scorePct * 100)}%` }]}
                    />
                  </View>
                  <Text style={s.bhProgNote}>
                    {Math.ceil((nextBadge.minScore - proteinStreak.badgeScore) / 10)} protein days to {nextBadge.name}
                  </Text>
                </View>
              )}
            </View>

            {/* Divider */}
            <View style={s.bhDividerRow}>
              <View style={s.bhDividerLine} />
              <Text style={s.bhDividerLabel}>ALL RANKS</Text>
              <View style={s.bhDividerLine} />
            </View>

            {/* Badge list */}
            <View style={{ paddingHorizontal: 20, gap: 12 }}>
              {PROTEIN_BADGES.map((b) => {
                const isAchieved = proteinStreak.badgeScore >= b.minScore;
                const isCurrent = getBadgeForScore(proteinStreak.badgeScore).id === b.id;
                return (
                  <View
                    key={b.id}
                    style={[
                      s.bhRow, { borderColor: isCurrent ? b.borderColor : 'rgba(255,255,255,0.06)' },
                      isCurrent && { backgroundColor: b.borderColor + '12' },
                    ]}
                  >
                    <View style={[s.bhRowMedallion, {
                      borderColor: isAchieved ? b.borderColor : 'rgba(255,255,255,0.1)',
                      opacity: isAchieved ? 1 : 0.4,
                    }]}>
                      <LinearGradient
                        colors={isAchieved ? b.gradColors : ['#1a1a1a', '#0a0a0a']}
                        style={s.bhHeroMedallionGrad}
                      >
                        <Text style={[s.bhRowEmoji, { opacity: isAchieved ? 1 : 0.5 }]}>{b.emoji}</Text>
                      </LinearGradient>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[s.bhRowName, { color: isAchieved ? b.color : 'rgba(255,255,255,0.3)' }]}>
                          {b.name}
                        </Text>
                        {isCurrent && (
                          <View style={[s.bhCurrentPill, { backgroundColor: b.borderColor + '22', borderColor: b.borderColor + '55' }]}>
                            <Text style={[s.bhCurrentPillText, { color: b.color }]}>CURRENT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[s.bhRowSub, { color: isAchieved ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)' }]}>
                        {b.subtitle}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {isAchieved
                        ? <MaterialCommunityIcons name="check-circle" size={18} color={b.color} />
                        : <MaterialCommunityIcons name="lock-outline" size={16} color="rgba(255,255,255,0.2)" />
                      }
                      <Text style={[s.bhRowScore, { color: isAchieved ? b.color : 'rgba(255,255,255,0.2)' }]}>
                        {b.minScore} pts
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Shield info */}
            <View style={s.bhShieldInfo}>
              <Text style={{ fontSize: 20 }}>🛡️</Text>
              <Text style={s.bhShieldText}>
                you earn a <Text style={{ color: '#FCD34D', fontWeight: '700' }}>shield</Text> every 5th protein victory. shields automatically protect your streak if you miss a day.{'\n\n'}missing a day without any shields resets both your day streak and badge score to zero.
              </Text>
            </View>
          </ScrollView>
        </LinearGradient>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  // Card
  card: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, marginBottom: 14 },
  cardGrad: { padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  eyebrow: { flex: 1, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  mainRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  medallion: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, overflow: 'hidden',
    shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  medallionGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  medallionEmoji: { fontSize: 28 },
  badgeName: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  subtitle: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 16 },
  streakRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  streakChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  shieldChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(252,211,77,0.08)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(252,211,77,0.2)',
  },
  chipEmoji: { fontSize: 13 },
  chipVal: { fontSize: 13, fontWeight: '800', color: '#fff' },
  chipLbl: { fontSize: 10, color: 'rgba(255,255,255,0.4)' },
  progLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  progLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: '600' },
  proteinVal: { fontSize: 10, fontWeight: '700' },
  progBg: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  progFill: { height: '100%', borderRadius: 3 },

  // Modal
  bhHeader: { alignItems: 'center', paddingTop: 56, paddingBottom: 8, paddingHorizontal: 24 },
  bhClose: {
    position: 'absolute', top: 52, left: 20, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center',
  },
  bhTitle: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  bhSub: { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4, letterSpacing: 1 },
  bhHero: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  bhHeroMedallion: {
    width: 110, height: 110, borderRadius: 55, borderWidth: 3, overflow: 'hidden', marginBottom: 14,
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
  bhProgLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  bhProgBg: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)' },
  bhProgNote: { fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 8 },
  bhDividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginVertical: 16 },
  bhDividerLine: { flex: 1, height: 0.8, backgroundColor: 'rgba(255,255,255,0.08)' },
  bhDividerLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2, color: 'rgba(255,255,255,0.2)' },
  bhRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 18, borderWidth: 1, padding: 14, backgroundColor: 'rgba(255,255,255,0.02)',
  },
  bhRowMedallion: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, overflow: 'hidden' },
  bhRowEmoji: { fontSize: 22 },
  bhRowName: { fontSize: 15, fontWeight: '800' },
  bhCurrentPill: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  bhCurrentPillText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  bhRowSub: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  bhRowScore: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  bhShieldInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginHorizontal: 20, marginTop: 20,
    backgroundColor: 'rgba(252,211,77,0.06)', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(252,211,77,0.15)',
  },
  bhShieldText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 18 },
});
