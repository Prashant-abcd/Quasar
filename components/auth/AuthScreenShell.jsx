import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width: SW } = Dimensions.get('window');

/* ── Star field — faint cosmic dust ────────────────────────────────────────── */
const STARS = [
  [8, 12, 1.8, 0.12], [42, 7, 1.2, 0.08], [78, 19, 2.0, 0.10], [91, 5, 1.4, 0.09],
  [22, 33, 1.6, 0.10], [63, 28, 1.0, 0.07], [14, 52, 2.0, 0.11], [88, 44, 1.4, 0.08],
  [35, 67, 1.6, 0.09], [71, 61, 1.2, 0.07], [5, 78, 1.4, 0.10], [52, 82, 1.8, 0.11],
  [82, 73, 1.4, 0.08], [27, 89, 1.0, 0.06], [94, 87, 1.6, 0.09], [48, 4, 2.2, 0.12],
  [68, 92, 1.2, 0.07], [16, 18, 1.4, 0.08], [57, 42, 1.0, 0.06], [93, 62, 1.6, 0.09],
];

export default function AuthScreenShell({ children, description }) {
  return (
    <View style={styles.root}>
      {/* ── Cosmic background layer ── */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* Very subtle deep-space red ambient glow behind the quasar area */}
        <View style={styles.ambientGlow} />

        {/* Star field */}
        {STARS.map(([l, t, size, opacity], i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: `${l}%`,
              top: `${t}%`,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: i % 4 === 0
                ? `rgba(255,120,100,${opacity})`
                : i % 3 === 0
                  ? `rgba(255,200,170,${opacity})`
                  : `rgba(255,255,255,${opacity * 0.7})`,
            }}
          />
        ))}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero section ── */}
          <View style={styles.hero}>

            {/* Badge */}
            <View style={styles.badge}>
              <View style={styles.badgePulseOuter}>
                <View style={styles.badgePulse} />
              </View>
              <MaterialCommunityIcons name="lightning-bolt" size={11} color="#ff6b4a" />
              <Text style={styles.badgeText}>adaptive energy engine</Text>
            </View>

            {/* Quasar image — the hero */}
            <View style={styles.imageContainer}>
              {/* Soft glow behind image */}
              <View style={styles.imageGlow} />
              <Image
                source={require('../../assets/images/quasar.png')}
                style={styles.quasarImage}
                resizeMode="contain"
              />
            </View>

            {/* Tagline */}
            <Text style={styles.tagline}>{description}</Text>

            {/* Metric pills */}
            <View style={styles.metricRow}>
              {[
                { icon: 'fire', label: 'Adaptive TDEE' },
                { icon: 'trending-up', label: 'Weekly sync' },
                { icon: 'dna', label: 'Body-aware' },
              ].map(({ icon, label }, i) => (
                <View key={i} style={styles.metricPill}>
                  <MaterialCommunityIcons name={icon} size={12} color="#ff6b4a" />
                  <Text style={styles.metricText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          {children}

          {/* ── Footer ── */}
          <View style={styles.footer}>
            <View style={styles.footerRule} />
            <Text style={styles.footerText}>Burn bright. Shine brighter.</Text>
            <View style={styles.footerRule} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },

  /* ── Ambient ── */
  ambientGlow: {
    position: 'absolute',
    top: -80,
    left: '10%',
    width: SW * 0.8,
    height: SW * 0.8,
    borderRadius: SW * 0.4,
    backgroundColor: 'rgba(180,20,20,0.08)',
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 44,
  },

  /* ── Hero ── */
  hero: { alignItems: 'center', marginBottom: 24 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 15, paddingVertical: 9,
    borderRadius: 999, marginBottom: 20,
    backgroundColor: 'rgba(255,60,30,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,80,50,0.18)',
  },
  badgePulseOuter: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: 'rgba(255,60,30,0.20)',
    justifyContent: 'center', alignItems: 'center',
  },
  badgePulse: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#ff4020',
    shadowColor: '#ff3010', shadowOpacity: 1, shadowRadius: 6,
  },
  badgeText: {
    color: '#ff8a6a', fontSize: 10.5, fontWeight: '700',
    letterSpacing: 1.6, textTransform: 'uppercase',
  },

  /* ── Quasar image ── */
  imageContainer: {
    width: SW * 0.7,
    height: SW * 0.7,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  imageGlow: {
    position: 'absolute',
    width: SW * 0.55,
    height: SW * 0.55,
    borderRadius: SW * 0.275,
    backgroundColor: 'rgba(200,30,15,0.12)',
    shadowColor: '#cc2010',
    shadowOpacity: 0.5,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 0 },
  },
  quasarImage: {
    width: '100%',
    height: '100%',
  },

  tagline: {
    marginTop: 4, width: '82%', textAlign: 'center',
    color: 'rgba(255,190,170,0.55)', fontSize: 13.5, lineHeight: 21,
    letterSpacing: 0.2,
  },

  /* ── Metric pills ── */
  metricRow: {
    flexDirection: 'row', gap: 8, marginTop: 18,
    flexWrap: 'wrap', justifyContent: 'center',
  },
  metricPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(255,50,25,0.07)',
    borderWidth: 0.8, borderColor: 'rgba(255,80,50,0.16)',
  },
  metricText: {
    color: 'rgba(255,180,160,0.65)', fontSize: 10.5,
    fontWeight: '600', letterSpacing: 0.5,
  },

  /* ── Footer ── */
  footer: {
    flexDirection: 'row', alignItems: 'center',
    gap: 14, marginTop: 28,
  },
  footerRule: {
    flex: 1, height: 0.8,
    backgroundColor: 'rgba(255,80,50,0.10)',
  },
  footerText: {
    color: 'rgba(255,180,160,0.30)', fontSize: 10.5,
    letterSpacing: 1.2, fontWeight: '600',
  },
});
