import { LinearGradient } from 'expo-linear-gradient';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: '132545595493-p7tds1np9iff9ioqdi4hpdta9svi0h3g.apps.googleusercontent.com',
});
import { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { auth } from '../config/firebaseConfig';
import { useRouter } from 'expo-router';
import AuthScreenShell from '../components/auth/AuthScreenShell';
import AppAlertDialog from '../components/ui/AppAlertDialog';
import useAppDialog from '../hooks/useAppDialog';

const { width: SW } = Dimensions.get('window');

// ── Quasar color palette ────────────────────────────────────────────────────
const Q = {
  black: '#000000',
  void: '#0a0202',
  deepRed: '#cc2020',
  red: '#e03030',
  brightRed: '#ff4030',
  orange: '#ff6b4a',
  warmOrange: '#ff8844',
  core: '#ffaa55',
  hotCore: '#ffcc77',
  white: '#ffe8d0',
  pureWhite: '#ffffff',
  // Subtle background tints
  cardBg: 'rgba(12,3,3,0.88)',
  inputBg: 'rgba(18,5,4,0.92)',
  inputBorder: 'rgba(200,40,25,0.22)',
  inputBorderFocused: '#ff4030',
  dimText: 'rgba(255,180,160,0.55)',
  labelText: 'rgba(255,140,110,0.72)',
};

// ── Animated shimmer line for CTA ───────────────────────────────────────────
function ShimmerLine({ width = SW - 92 }) {
  const anim = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, {
        toValue: 1, duration: 2400,
        easing: Easing.inOut(Easing.ease), useNativeDriver: true,
      })
    ).start();
  }, [anim]);
  const translateX = anim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-width, width],
  });
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderRadius: 18 }} pointerEvents="none">
      <Animated.View style={{
        position: 'absolute', top: 0, bottom: 0, width: 60,
        transform: [{ translateX }],
      }}>
        <LinearGradient
          colors={['transparent', 'rgba(255,120,80,0.14)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

// ── Fade-in wrapper ─────────────────────────────────────────────────────────
function FadeSlide({ children, delay = 0, style }) {
  const o = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(o, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(y, { toValue: 0, friction: 8, tension: 50, useNativeDriver: true }),
      ]),
    ]).start();
  }, [delay, o, y]);
  return (
    <Animated.View style={[style, { opacity: o, transform: [{ translateY: y }] }]}>
      {children}
    </Animated.View>
  );
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { showDialog, dialogProps } = useAppDialog();

  // Animated border glow
  const emailGlow = useRef(new Animated.Value(0)).current;
  const passGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(emailGlow, {
      toValue: focusedField === 'email' ? 1 : 0,
      duration: 250, useNativeDriver: false,
    }).start();
  }, [emailGlow, focusedField]);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const { data } = await GoogleSignin.signIn();
      const googleCredential = GoogleAuthProvider.credential(data.idToken);
      
      if (auth.currentUser) {
        await signOut(auth);
      }
      await signInWithCredential(auth, googleCredential);
    } catch (error) {
      setLoading(false);
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return;
      }
      showDialog({
        title: 'Google Sign-In Failed',
        message: error.message || 'An unexpected error occurred during Google Sign-In.',
        variant: 'error',
      });
    }
  };

  useEffect(() => {
    Animated.timing(passGlow, {
      toValue: focusedField === 'password' ? 1 : 0,
      duration: 250, useNativeDriver: false,
    }).start();
  }, [focusedField, passGlow]);

  const handleForgotPassword = async () => {
    if (!email || !email.includes('@')) {
      showDialog({
        title: 'Enter your email first',
        message: 'Type your email address in the field above and then tap Forgot?',
        variant: 'warning',
      });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      showDialog({
        title: 'Reset link sent',
        message: `A password reset link has been sent to ${email.trim()}. Follow the link to set a new password.\n\ncan't find it? check your spam or junk folder.`,
        variant: 'success',
      });
    } catch (error) {
      let friendlyMessage = 'We ran into an unexpected issue. Please try again.';
      if (error.code === 'auth/user-not-found') {
        friendlyMessage = 'We couldn\'t find an account with that email address.';
      } else if (error.code === 'auth/invalid-email') {
        friendlyMessage = 'That email address doesn\'t look quite right.';
      } else if (error.message) {
        friendlyMessage = error.message.replace('Firebase:', '').trim();
      }

      showDialog({
        title: 'Could not send reset link',
        message: friendlyMessage,
        variant: 'error',
      });
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showDialog({
        title: 'Missing details',
        message: 'Drop in both your email and password so we can sign you in.',
        variant: 'warning',
      });
      return;
    }

    setLoading(true);

    try {
      if (auth.currentUser) {
        await signOut(auth);
      }

      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      if (!userCredential.user.emailVerified) {
        await signOut(auth);
        showDialog({
          title: 'Email not verified',
          message: 'Please check your inbox and verify your email before logging in.',
          variant: 'warning',
        });
        setLoading(false);
      }
    } catch (error) {
      let friendlyMessage = 'We ran into an unexpected issue. Please try again.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        friendlyMessage = 'The email or password you entered is incorrect.';
      } else if (error.code === 'auth/too-many-requests') {
        friendlyMessage = 'Too many failed attempts. Please take a breather and try again later, or reset your password.';
      } else if (error.code === 'auth/network-request-failed') {
        friendlyMessage = 'It looks like you\'re offline. Check your internet connection and try again.';
      } else if (error.message) {
        friendlyMessage = error.message.replace('Firebase:', '').trim();
      }

      showDialog({
        title: 'Could not sign you in',
        message: friendlyMessage,
        variant: 'error',
      });
      setLoading(false);
    }
  };

  const emailBorderColor = emailGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [Q.inputBorder, Q.inputBorderFocused],
  });
  const passBorderColor = passGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [Q.inputBorder, Q.inputBorderFocused],
  });

  return (
    <AuthScreenShell description="Precision calorie targets that adapt to your body, your workouts, and your progress.">
      <View style={styles.card}>

        {/* Top glow accent */}
        <LinearGradient
          colors={['rgba(255,60,30,0.12)', 'transparent']}
          style={styles.cardTopShimmer}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
        />

        {/* Accent stripe — quasar red glow */}
        <LinearGradient
          colors={['#cc2020', '#ff4030', '#cc2020']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.accentStripe}
          pointerEvents="none"
        />

        {/* Card header */}
        <FadeSlide delay={100}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Welcome back</Text>
              <Text style={styles.cardSubtitle}>
                Log in to keep your targets, meals, and weekly check-ins in sync.
              </Text>
            </View>

            <View style={styles.secureBadge}>
              <LinearGradient
                colors={['rgba(255,60,30,0.15)', 'rgba(180,20,15,0.25)']}
                style={styles.secureBadgeGrad}
              >
                <MaterialCommunityIcons name="shield-check-outline" size={19} color={Q.orange} />
              </LinearGradient>
            </View>
          </View>
        </FadeSlide>

        {/* Trust indicators */}
        <FadeSlide delay={200}>
          <View style={styles.trustRow}>
            {[
              { icon: 'lock-outline', text: 'Encrypted' },
              { icon: 'shield-check', text: 'Secure auth' },
              { icon: 'cloud-sync-outline', text: 'Real-time sync' },
            ].map((t, i) => (
              <View key={i} style={styles.trustPill}>
                <MaterialCommunityIcons name={t.icon} size={11} color={Q.brightRed} />
                <Text style={styles.trustText}>{t.text}</Text>
              </View>
            ))}
          </View>
        </FadeSlide>

        {/* Divider */}
        <FadeSlide delay={250}>
          <View style={styles.sectionDivider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>CREDENTIALS</Text>
            <View style={styles.dividerLine} />
          </View>
        </FadeSlide>

        {/* Email field */}
        <FadeSlide delay={300}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Email address</Text>
            <Animated.View style={[styles.inputShell, { borderColor: emailBorderColor }]}>
              <View style={[
                styles.inputIconWrap,
                focusedField === 'email' && styles.inputIconWrapFocused,
              ]}>
                <MaterialCommunityIcons
                  name="at"
                  size={17}
                  color={focusedField === 'email' ? Q.brightRed : Q.orange}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="rgba(255,150,130,0.30)"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                selectionColor={Q.brightRed}
              />
              {email.length > 0 && email.includes('@') && email.includes('.') && (
                <MaterialCommunityIcons name="check-circle" size={16} color="#27ae60" style={{ marginLeft: 4 }} />
              )}
            </Animated.View>
          </View>
        </FadeSlide>

        {/* Password field */}
        <FadeSlide delay={400}>
          <View style={styles.inputWrapper}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>Password</Text>
              <TouchableOpacity onPress={handleForgotPassword} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.forgotLink}>Forgot?</Text>
              </TouchableOpacity>
            </View>
            <Animated.View style={[styles.inputShell, { borderColor: passBorderColor }]}>
              <View style={[
                styles.inputIconWrap,
                focusedField === 'password' && styles.inputIconWrapFocused,
              ]}>
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={17}
                  color={focusedField === 'password' ? Q.brightRed : Q.orange}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="rgba(255,150,130,0.30)"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showPassword}
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                selectionColor={Q.brightRed}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.eyeBtn}
              >
                <MaterialCommunityIcons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Q.orange}
                />
              </TouchableOpacity>
            </Animated.View>
          </View>
        </FadeSlide>

        {/* CTA button */}
        <FadeSlide delay={500}>
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={['#ff4030', '#cc2020', '#8a0e14']}
              locations={[0, 0.5, 1]}
              style={styles.buttonGradient}
            >
              <LinearGradient
                colors={['rgba(255,180,140,0.18)', 'transparent']}
                style={styles.buttonShine}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                pointerEvents="none"
              />
              {!loading && <ShimmerLine />}
              <View style={styles.buttonContent}>
                {loading ? (
                  <ActivityIndicator size="small" color={Q.white} />
                ) : (
                  <MaterialCommunityIcons name="arrow-right-circle" size={20} color={Q.white} />
                )}
                <Text style={styles.buttonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </FadeSlide>

        {/* Google Sign-In Button */}
        <FadeSlide delay={525}>
          <TouchableOpacity
            style={[styles.googleButton, loading && styles.buttonDisabled]}
            onPress={handleGoogleLogin}
            disabled={loading}
            activeOpacity={0.88}
          >
            <View style={styles.googleButtonContent}>
              <MaterialCommunityIcons name="google" size={20} color={Q.black} />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </View>
          </TouchableOpacity>
        </FadeSlide>

        {/* Sign-up nudge */}
        <FadeSlide delay={550}>
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={() => router.push('/SignupScreen')}
            activeOpacity={0.80}
          >
            <View style={styles.secondaryIconWrap}>
              <MaterialCommunityIcons name="account-plus-outline" size={16} color={Q.brightRed} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.secondaryTextMain}>New to Quasar?</Text>
              <Text style={styles.secondaryTextSub}>Create a free account in 30 seconds</Text>
            </View>
            <View style={styles.secondaryArrow}>
              <MaterialCommunityIcons name="arrow-right" size={14} color={Q.brightRed} />
            </View>
          </TouchableOpacity>
        </FadeSlide>

        <AppAlertDialog {...dialogProps} />
      </View>
    </AuthScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    backgroundColor: Q.cardBg,
    borderWidth: 1,
    borderColor: 'rgba(255,60,30,0.12)',
    shadowColor: '#ff2010',
    shadowOpacity: 0.15,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
    overflow: 'hidden',
  },
  cardTopShimmer: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 64, zIndex: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  accentStripe: {
    height: 3,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 12,
    zIndex: 1,
  },
  cardHeaderCopy: { flex: 1 },
  cardTitle: {
    color: Q.white,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  cardSubtitle: {
    marginTop: 6,
    color: Q.dimText,
    fontSize: 12.5,
    lineHeight: 19,
  },
  secureBadge: {
    borderRadius: 22, overflow: 'hidden',
    shadowColor: Q.deepRed, shadowOpacity: 0.30,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  secureBadgeGrad: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,80,50,0.20)',
  },

  trustRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: 24, marginBottom: 16, flexWrap: 'wrap',
  },
  trustPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,60,30,0.06)',
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,60,30,0.10)',
  },
  trustText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,160,130,0.60)', letterSpacing: 0.3 },

  sectionDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 24, marginBottom: 18,
  },
  dividerLine: { flex: 1, height: 0.8, backgroundColor: 'rgba(255,80,50,0.12)' },
  dividerLabel: { color: 'rgba(255,120,90,0.35)', fontSize: 9.5, fontWeight: '700', letterSpacing: 2.4 },

  inputWrapper: { marginHorizontal: 24, marginBottom: 14 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  inputLabel: { color: Q.labelText, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 8 },
  forgotLink: { color: Q.brightRed, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3, marginBottom: 8 },
  inputShell: {
    minHeight: 58, borderRadius: 17, borderWidth: 1.5,
    borderColor: Q.inputBorder, backgroundColor: Q.inputBg,
    paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
    shadowColor: Q.deepRed, shadowOpacity: 0.10,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  inputIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(255,60,30,0.08)',
    justifyContent: 'center', alignItems: 'center', marginRight: 6,
  },
  inputIconWrapFocused: { backgroundColor: 'rgba(255,60,30,0.15)' },
  input: { flex: 1, color: Q.white, fontSize: 15.5, paddingVertical: 16, letterSpacing: 0.1 },
  eyeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,60,30,0.06)',
    justifyContent: 'center', alignItems: 'center', marginLeft: 4,
  },

  button: {
    marginHorizontal: 24, marginTop: 8, borderRadius: 18, overflow: 'hidden',
    shadowColor: '#ff2010', shadowOpacity: 0.35, shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  buttonDisabled: { opacity: 0.76 },
  buttonGradient: { paddingVertical: 18, paddingHorizontal: 18, overflow: 'hidden' },
  buttonShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 28, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { color: Q.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  googleButton: {
    marginHorizontal: 24, marginTop: 12, borderRadius: 18,
    backgroundColor: Q.pureWhite, overflow: 'hidden',
    shadowColor: Q.pureWhite, shadowOpacity: 0.25, shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  googleButtonContent: { 
    paddingVertical: 16, paddingHorizontal: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 
  },
  googleButtonText: { color: Q.black, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  secondaryAction: {
    marginHorizontal: 24, marginTop: 14, marginBottom: 24,
    borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,60,30,0.12)',
    backgroundColor: 'rgba(255,40,20,0.04)', paddingHorizontal: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  secondaryIconWrap: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(255,60,30,0.08)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,60,30,0.15)',
  },
  secondaryTextMain: { color: Q.white, fontSize: 13.5, fontWeight: '800' },
  secondaryTextSub: { color: Q.dimText, fontSize: 11, fontWeight: '500', marginTop: 1 },
  secondaryArrow: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,60,30,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
});
