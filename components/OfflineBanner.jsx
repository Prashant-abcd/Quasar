import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNetwork } from '../contexts/NetworkContext';

export default function OfflineBanner() {
  const { isConnected, justReconnected } = useNetwork();
  const router = useRouter();

  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const visible = !isConnected || justReconnected;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -120,
          duration: 300,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, opacityAnim]);

  if (!visible) return null;

  const isOnline = isConnected && justReconnected;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      <LinearGradient
        colors={
          isOnline
            ? ['#1a472a', '#0d2818']
            : ['#4a1010', '#2a0808']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Status indicator dot */}
        <View style={[styles.dot, isOnline ? styles.dotGreen : styles.dotRed]} />

        <View style={styles.textWrap}>
          {isOnline ? (
            <Text style={[styles.message, styles.messageGreen]}>
              You're back online ✓
            </Text>
          ) : (
            <>
              <Text style={styles.message}>
                You're offline — changes will sync when you're back
              </Text>
              <TouchableOpacity
                style={styles.factsButton}
                onPress={() => router.push('/FunFactsScreen')}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="brain"
                  size={14}
                  color="#ffcc77"
                />
                <Text style={styles.factsButtonText}>
                  Browse fun facts while you wait 🧠
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 2,
  },
  dotRed: {
    backgroundColor: '#ff4030',
    shadowColor: '#ff4030',
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  dotGreen: {
    backgroundColor: '#27ae60',
    shadowColor: '#27ae60',
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  textWrap: {
    flex: 1,
  },
  message: {
    color: 'rgba(255,200,180,0.85)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  messageGreen: {
    color: '#80e8a0',
    fontWeight: '700',
  },
  factsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: 'rgba(255,170,85,0.12)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,170,85,0.20)',
  },
  factsButtonText: {
    color: '#ffcc77',
    fontSize: 12,
    fontWeight: '700',
  },
});
