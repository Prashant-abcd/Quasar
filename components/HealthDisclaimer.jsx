import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/legal';

const DISCLAIMER_KEY = '@adaptcal/health-disclaimer-v1';

/**
 * One-time health / legal disclaimer shown on the very first app launch.
 * Once the user taps "I Understand", the flag is persisted in AsyncStorage
 * and the modal never appears again.
 */
export default function HealthDisclaimer() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const accepted = await AsyncStorage.getItem(DISCLAIMER_KEY);
        if (!accepted) setVisible(true);
      } catch {
        // If storage fails, don't block the user
      }
    })();
  }, []);

  const handleAccept = async () => {
    try {
      await AsyncStorage.setItem(DISCLAIMER_KEY, new Date().toISOString());
    } catch {
      // Proceed even if write fails
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        /* prevent back-button dismiss */
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient
            colors={['rgba(192,57,43,0.12)', 'transparent']}
            style={styles.cardShimmer}
            pointerEvents="none"
          />

          {/* Accent stripe */}
          <LinearGradient
            colors={['#ff4030', '#ff6b4a', '#ff4030']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.stripe}
            pointerEvents="none"
          />

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconWrap}>
                <LinearGradient
                  colors={['#fff5f0', '#ffe4db']}
                  style={styles.iconGrad}
                >
                  <MaterialCommunityIcons
                    name="heart-pulse"
                    size={26}
                    color="#9b2118"
                  />
                </LinearGradient>
              </View>
              <Text style={styles.title}>Before we begin</Text>
              <Text style={styles.subtitle}>
                Please read and acknowledge the following
              </Text>
            </View>

            {/* Health disclaimer */}
            <View style={styles.section}>
              <View style={styles.sectionIcon}>
                <MaterialCommunityIcons
                  name="medical-bag"
                  size={16}
                  color="#ff4030"
                />
              </View>
              <View style={styles.sectionContent}>
                <Text style={styles.sectionTitle}>Health Disclaimer</Text>
                <Text style={styles.sectionText}>
                  Quasar is designed for{' '}
                  <Text style={styles.bold}>informational purposes only</Text>.
                  It is not a substitute for professional medical advice,
                  diagnosis, or treatment.{'\n\n'}Always consult a qualified
                  healthcare provider before starting any diet, exercise, or
                  weight-management programme — especially if you have a
                  pre-existing medical condition, are pregnant, or are under 18
                  years of age.{'\n\n'}The calorie targets, deficit
                  calculations, and macro estimates provided by this app are
                  approximate and may not be suitable for every individual.
                </Text>
              </View>
            </View>

            {/* Data & privacy */}
            <View style={styles.section}>
              <View style={styles.sectionIcon}>
                <MaterialCommunityIcons
                  name="shield-lock-outline"
                  size={16}
                  color="#ff4030"
                />
              </View>
              <View style={styles.sectionContent}>
                <Text style={styles.sectionTitle}>Your Data & Privacy</Text>
                <Text style={styles.sectionText}>
                  We collect your email, body stats, and meal logs solely to
                  provide and improve your personalised calorie plan. Your data
                  is stored securely in Firebase and is never sold to third
                  parties.{'\n\n'}By continuing you agree to our{' '}
                  <Text
                    style={styles.link}
                    onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
                  >
                    Privacy Policy
                  </Text>{' '}
                  and{' '}
                  <Text
                    style={styles.link}
                    onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
                  >
                    Terms of Service
                  </Text>
                  .
                </Text>
              </View>
            </View>

            {/* Liability */}
            <View style={[styles.section, { marginBottom: 8 }]}>
              <View style={styles.sectionIcon}>
                <MaterialCommunityIcons
                  name="information-outline"
                  size={16}
                  color="#ff4030"
                />
              </View>
              <View style={styles.sectionContent}>
                <Text style={styles.sectionTitle}>Limitation of Liability</Text>
                <Text style={styles.sectionText}>
                  The developers of Quasar are not liable for any health
                  outcomes resulting from the use of this app. Use at your own
                  risk.
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* CTA */}
          <View style={styles.ctaWrap}>
            <TouchableOpacity
              style={styles.button}
              onPress={handleAccept}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#e04e4f', '#c03030', '#8e1016']}
                locations={[0, 0.5, 1]}
                style={styles.buttonGrad}
              >
                <MaterialCommunityIcons
                  name="check-circle-outline"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.buttonText}>
                  I Understand — Let's Go
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  card: {
    backgroundColor: 'rgba(255,249,245,0.98)',
    borderRadius: 28,
    maxHeight: '92%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#1a0000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 20,
  },
  cardShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  stripe: {
    height: 3,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },

  header: { alignItems: 'center', marginBottom: 22 },
  iconWrap: {
    borderRadius: 26,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#c04030',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  iconGrad: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0c8b8',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1c0402',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12.5,
    color: '#7d5c54',
    marginTop: 5,
  },

  section: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(192,57,43,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  sectionContent: { flex: 1 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2c0808',
    marginBottom: 5,
  },
  sectionText: {
    fontSize: 12.5,
    lineHeight: 19,
    color: '#5a3e38',
  },
  bold: { fontWeight: '700' },
  link: {
    color: '#ff4030',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  ctaWrap: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  button: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#a00e14',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  buttonGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 17,
    paddingHorizontal: 20,
  },
  buttonText: {
    color: '#fff4f0',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
