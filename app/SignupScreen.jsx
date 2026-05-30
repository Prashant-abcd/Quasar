import { LinearGradient } from 'expo-linear-gradient';
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
  Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut, signInWithEmailAndPassword, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { auth } from '../config/firebaseConfig';
import { useRouter } from 'expo-router';
import AuthScreenShell from '../components/auth/AuthScreenShell';
import AppAlertDialog from '../components/ui/AppAlertDialog';
import useAppDialog from '../hooks/useAppDialog';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '../constants/legal';

GoogleSignin.configure({
  webClientId: '132545595493-p7tds1np9iff9ioqdi4hpdta9svi0h3g.apps.googleusercontent.com',
});

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
  cardBg: 'rgba(12,3,3,0.88)',
  inputBg: 'rgba(18,5,4,0.92)',
  inputBorder: 'rgba(200,40,25,0.22)',
  inputBorderFocused: '#ff4030',
  dimText: 'rgba(255,180,160,0.55)',
  labelText: 'rgba(255,140,110,0.72)',
};

// ── Animated shimmer ────────────────────────────────────────────────────────
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

// ── Animated strength bar ───────────────────────────────────────────────────
function StrengthBar({ level, strength, color }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, {
      toValue: strength >= level ? 1 : 0,
      duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [level, strength, w]);
  const bg = w.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,80,50,0.12)', color],
  });
  return <Animated.View style={[styles.strengthBar, { backgroundColor: bg }]} />;
}

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();
  const { showDialog, dialogProps } = useAppDialog();

  // Animated border glows
  const emailGlow = useRef(new Animated.Value(0)).current;
  const passGlow = useRef(new Animated.Value(0)).current;
  const confirmGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(emailGlow, { toValue: focusedField === 'email' ? 1 : 0, duration: 250, useNativeDriver: false }).start();
    Animated.timing(passGlow, { toValue: focusedField === 'password' ? 1 : 0, duration: 250, useNativeDriver: false }).start();
    Animated.timing(confirmGlow, { toValue: focusedField === 'confirm' ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  }, [confirmGlow, emailGlow, focusedField, passGlow]);

  const handleSignup = async () => {
    if (!email || !password || !confirm) {
      showDialog({
        title: 'Missing details',
        message: 'Fill in your email, password, and confirmation so we can build the account.',
        variant: 'warning',
      });
      return;
    }

    if (password !== confirm) {
      showDialog({
        title: 'Passwords do not match',
        message: 'Make sure both password fields match exactly before continuing.',
        variant: 'warning',
      });
      return;
    }

    if (password.length < 6) {
      showDialog({
        title: 'Password too short',
        message: 'Use at least 6 characters so your account is secure enough to continue.',
        variant: 'warning',
      });
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(userCredential.user);
      // We no longer sign the user out here. They remain authenticated but UNVERIFIED.

      const checkVerification = async () => {
        if (auth.currentUser) {
          await auth.currentUser.reload();
          if (auth.currentUser.emailVerified) {
            // Force onAuthStateChanged to re-fire so _layout.jsx detects the verified state
            const currentEmail = auth.currentUser.email;
            await signOut(auth);
            await signInWithEmailAndPassword(auth, currentEmail, password);
          } else {
            showDialog({
              title: 'Not verified yet',
              message: 'We checked, but your email still isn\'t verified. Please click the link we sent to your email and try again.',
              variant: 'warning',
              actions: [{
                label: 'Check again',
                tone: 'primary',
                onPress: checkVerification,
              }],
            });
          }
        }
      };

      showDialog({
        title: 'Check your email',
        message: `A verification link has been sent to ${email}. Verify it first, then tap the button below to continue.\n\nCan't find it? Check your spam or junk folder.`,
        variant: 'success',
        actions: [{
          label: "I've verified it!",
          tone: 'primary',
          onPress: checkVerification,
        }],
      });
    } catch (error) {
      let friendlyMessage = 'We ran into an unexpected issue. Please try again.';
      if (error.code === 'auth/email-already-in-use') {
        friendlyMessage = 'An account with this email already exists. Try logging in instead.';
      } else if (error.code === 'auth/invalid-email') {
        friendlyMessage = 'That email address doesn\'t look quite right. Double-check it for typos.';
      } else if (error.code === 'auth/network-request-failed') {
        friendlyMessage = 'It looks like you\'re offline. Check your internet connection and try again.';
      } else if (error.message) {
        friendlyMessage = error.message.replace('Firebase:', '').trim();
      }

      showDialog({
        title: 'Could not create account',
        message: friendlyMessage,
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
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
        title: 'Google Sign-Up Failed',
        message: error.message || 'An unexpected error occurred during Google Sign-Up.',
        variant: 'error',
      });
    }
  };

  /* Password strength — based on length only */
  const getStrength = () => {
    if (!password) return 0;
    if (password.length < 6) return 1;
    if (password.length < 10) return 2;
    return 3;
  };
  const strength = getStrength();
  const strengthLabels = ['', 'Weak', 'Good', 'Strong'];
  const strengthColors = ['', '#e05a3a', '#ff8844', '#27ae60'];

  const emailBorderColor = emailGlow.interpolate({ inputRange: [0, 1], outputRange: [Q.inputBorder, Q.inputBorderFocused] });
  const passBorderColor = passGlow.interpolate({ inputRange: [0, 1], outputRange: [Q.inputBorder, Q.inputBorderFocused] });
  const confirmMatch = confirm.length > 0 && confirm === password;
  const confirmBorderColor = confirmMatch
    ? '#27ae60'
    : confirmGlow.interpolate({ inputRange: [0, 1], outputRange: [Q.inputBorder, Q.inputBorderFocused] });

  return (
    <AuthScreenShell description="Build your plan once, then let Quasar keep adjusting it as your body changes.">
      <View style={styles.card}>

        {/* Top glow */}
        <LinearGradient
          colors={['rgba(255,60,30,0.12)', 'transparent']}
          style={styles.cardTopShimmer}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          pointerEvents="none"
        />

        {/* Accent stripe */}
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
              <Text style={styles.cardTitle}>Create account</Text>
              <Text style={styles.cardSubtitle}>
                Start with your login — we'll build the rest of your plan in onboarding.
              </Text>
            </View>

            <View style={styles.secureBadge}>
              <LinearGradient
                colors={['rgba(255,60,30,0.15)', 'rgba(180,20,15,0.25)']}
                style={styles.secureBadgeGrad}
              >
                <MaterialCommunityIcons name="account-plus-outline" size={19} color={Q.orange} />
              </LinearGradient>
            </View>
          </View>
        </FadeSlide>

        {/* What you get */}
        <FadeSlide delay={180}>
          <View style={styles.perksRow}>
            {[
              { icon: 'fire', text: 'Adaptive TDEE' },
              { icon: 'chart-timeline-variant', text: 'Smart tracking' },
              { icon: 'shield-sun-outline', text: 'Load modes' },
              { icon: 'dna', text: 'Deficit cycling' },
            ].map((p, i) => (
              <View key={i} style={styles.perkChip}>
                <MaterialCommunityIcons name={p.icon} size={11} color={Q.brightRed} />
                <Text style={styles.perkText}>{p.text}</Text>
              </View>
            ))}
          </View>
        </FadeSlide>

        {/* Divider */}
        <FadeSlide delay={220}>
          <View style={styles.sectionDivider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>YOUR DETAILS</Text>
            <View style={styles.dividerLine} />
          </View>
        </FadeSlide>

        {/* Email */}
        <FadeSlide delay={280}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Email address</Text>
            <Animated.View style={[styles.inputShell, { borderColor: emailBorderColor }]}>
              <View style={[styles.inputIconWrap, focusedField === 'email' && styles.inputIconWrapFocused]}>
                <MaterialCommunityIcons name="at" size={17} color={focusedField === 'email' ? Q.brightRed : Q.orange} />
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

        {/* Password */}
        <FadeSlide delay={350}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Password</Text>
            <Animated.View style={[styles.inputShell, { borderColor: passBorderColor }]}>
              <View style={[styles.inputIconWrap, focusedField === 'password' && styles.inputIconWrapFocused]}>
                <MaterialCommunityIcons name="lock-outline" size={17} color={focusedField === 'password' ? Q.brightRed : Q.orange} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Create a password"
                placeholderTextColor="rgba(255,150,130,0.30)"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showPassword}
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                selectionColor={Q.brightRed}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.eyeBtn}
              >
                <MaterialCommunityIcons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18} color={Q.orange}
                />
              </TouchableOpacity>
            </Animated.View>

            {/* Password strength meter */}
            {password.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthBars}>
                  {[1, 2, 3].map(level => (
                    <StrengthBar key={level} level={level} strength={strength} color={strengthColors[strength] || '#ccc'} />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: strengthColors[strength] || '#ccc' }]}>
                  {strengthLabels[strength]}
                </Text>
              </View>
            )}

            {/* Password requirements */}
            {password.length > 0 && password.length < 6 && (
              <View style={styles.reqRow}>
                <MaterialCommunityIcons name="information-outline" size={12} color="#ff8844" />
                <Text style={styles.reqText}>At least 6 characters required</Text>
              </View>
            )}
          </View>
        </FadeSlide>

        {/* Confirm password */}
        <FadeSlide delay={420}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Confirm password</Text>
            <Animated.View style={[
              styles.inputShell,
              { borderColor: confirmBorderColor },
              confirmMatch && styles.inputShellValid,
            ]}>
              <View style={[styles.inputIconWrap, focusedField === 'confirm' && styles.inputIconWrapFocused]}>
                <MaterialCommunityIcons
                  name={confirmMatch ? 'check-circle-outline' : 'lock-check-outline'}
                  size={17}
                  color={confirmMatch ? '#27ae60' : focusedField === 'confirm' ? Q.brightRed : Q.orange}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Re-enter your password"
                placeholderTextColor="rgba(255,150,130,0.30)"
                value={confirm}
                onChangeText={setConfirm}
                onFocus={() => setFocusedField('confirm')}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showConfirm}
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="password"
                selectionColor={Q.brightRed}
              />
              {confirmMatch ? (
                <View style={styles.matchBadge}>
                  <MaterialCommunityIcons name="check" size={12} color="#fff" />
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowConfirm(!showConfirm)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.eyeBtn}
                >
                  <MaterialCommunityIcons
                    name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                    size={18} color={Q.orange}
                  />
                </TouchableOpacity>
              )}
            </Animated.View>
            {confirm.length > 0 && !confirmMatch && (
              <View style={styles.reqRow}>
                <MaterialCommunityIcons name="close-circle-outline" size={12} color="#ff4030" />
                <Text style={[styles.reqText, { color: '#ff4030' }]}>Passwords don't match yet</Text>
              </View>
            )}
          </View>
        </FadeSlide>

        {/* Terms */}
        <FadeSlide delay={460}>
          <View style={styles.termsRow}>
            <MaterialCommunityIcons name="information-outline" size={13} color="rgba(255,140,110,0.45)" />
            <Text style={styles.termsText}>
              By signing up you agree to our{' '}
              <Text style={styles.termsLink} onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}>Terms</Text> &amp;{' '}
              <Text style={styles.termsLink} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>Privacy Policy</Text>.
            </Text>
          </View>
        </FadeSlide>

        {/* CTA */}
        <FadeSlide delay={500}>
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
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
                  <MaterialCommunityIcons name="account-arrow-right" size={20} color={Q.white} />
                )}
                <Text style={styles.buttonText}>{loading ? 'Creating account…' : 'Create account'}</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </FadeSlide>

        {/* Google Sign-In Button */}
        <FadeSlide delay={520}>
          <TouchableOpacity
            style={[styles.googleButton, loading && styles.buttonDisabled]}
            onPress={handleGoogleSignup}
            disabled={loading}
            activeOpacity={0.88}
          >
            <View style={styles.googleButtonContent}>
              <MaterialCommunityIcons name="google" size={20} color={Q.black} />
              <Text style={styles.googleButtonText}>Sign up with Google</Text>
            </View>
          </TouchableOpacity>
        </FadeSlide>

        {/* Security note */}
        <FadeSlide delay={540}>
          <View style={styles.securityNote}>
            <View style={styles.secNoteIconWrap}>
              <MaterialCommunityIcons name="shield-lock-outline" size={14} color={Q.brightRed} />
            </View>
            <Text style={styles.secNoteText}>
              Your data is encrypted end-to-end. We never share or sell your information.
            </Text>
          </View>
        </FadeSlide>

        {/* Already have account */}
        <FadeSlide delay={580}>
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={() => router.push('/LoginScreen')}
            activeOpacity={0.80}
          >
            <View style={styles.secondaryIconWrap}>
              <MaterialCommunityIcons name="login-variant" size={16} color={Q.brightRed} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.secondaryTextMain}>Already have an account?</Text>
              <Text style={styles.secondaryTextSub}>Sign in to continue your journey</Text>
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
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 64, zIndex: 0,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
  },
  accentStripe: {
    height: 3,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    paddingHorizontal: 24, paddingTop: 22, paddingBottom: 12, zIndex: 1,
  },
  cardHeaderCopy: { flex: 1 },
  cardTitle: { color: Q.white, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  cardSubtitle: { marginTop: 6, color: Q.dimText, fontSize: 12.5, lineHeight: 19 },
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

  perksRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 24,
    marginBottom: 16, flexWrap: 'wrap',
  },
  perkChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,60,30,0.06)',
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,60,30,0.10)',
  },
  perkText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,160,130,0.60)', letterSpacing: 0.3 },

  sectionDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 24, marginBottom: 18,
  },
  dividerLine: { flex: 1, height: 0.8, backgroundColor: 'rgba(255,80,50,0.12)' },
  dividerLabel: { color: 'rgba(255,120,90,0.35)', fontSize: 9.5, fontWeight: '700', letterSpacing: 2.4 },

  inputWrapper: { marginHorizontal: 24, marginBottom: 14 },
  inputLabel: { color: Q.labelText, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 8 },
  inputShell: {
    minHeight: 58, borderRadius: 17, borderWidth: 1.5,
    borderColor: Q.inputBorder, backgroundColor: Q.inputBg,
    paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
    shadowColor: Q.deepRed, shadowOpacity: 0.10,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  inputShellValid: {
    borderColor: '#80c898',
    shadowColor: '#27ae60', shadowOpacity: 0.15,
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
  matchBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#27ae60',
    justifyContent: 'center', alignItems: 'center', marginLeft: 4,
  },

  strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
  strengthBars: { flexDirection: 'row', gap: 4, flex: 1 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, width: 42, textAlign: 'right' },

  reqRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6,
  },
  reqText: { fontSize: 11, color: '#ff8844', fontWeight: '600' },

  termsRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    marginHorizontal: 24, marginBottom: 14,
  },
  termsText: { flex: 1, color: 'rgba(255,160,140,0.45)', fontSize: 11.5, lineHeight: 16.5 },
  termsLink: { color: Q.brightRed, fontWeight: '700' },

  button: {
    marginHorizontal: 24, marginTop: 2, borderRadius: 18, overflow: 'hidden',
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

  securityNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 24, marginTop: 14,
    backgroundColor: 'rgba(255,60,30,0.04)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,60,30,0.08)',
  },
  secNoteIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: 'rgba(255,60,30,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  secNoteText: { flex: 1, fontSize: 11, color: 'rgba(255,160,140,0.50)', lineHeight: 16 },

  secondaryAction: {
    marginHorizontal: 24, marginTop: 12, marginBottom: 24,
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
