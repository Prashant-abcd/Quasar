import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../config/firebaseConfig';
import { doc, getDoc, onSnapshot } from 'firebase/firestore'; 
import { ActivityIndicator, Image, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ErrorBoundary from '../components/ErrorBoundary';
import HealthDisclaimer from '../components/HealthDisclaimer';
import { NetworkProvider } from '../contexts/NetworkContext';
import OfflineBanner from '../components/OfflineBanner';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();

  const [appState, setAppState] = useState('INITIAL_LOADING');

  useEffect(() => {
    let profileUnsub = null;
    let authUnsub = () => {};
    let isMounted = true;

    const clearProfileListener = () => {
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }
    };

    const handleAuthChange = async (signedInUser) => {
      if (!isMounted) return;

      clearProfileListener();

      if (!signedInUser) {
        setAppState('UNAUTHENTICATED');
        return;
      }

      let currentUser = signedInUser;

      if (!currentUser.emailVerified) {
        try {
          await currentUser.reload();
          currentUser = auth.currentUser || currentUser;
        } catch (error) {
          // Network error while offline — use cached auth state
          console.log('User reload error (likely offline):', error.message);
        }
      }

      if (!isMounted) return;

      if (!currentUser.emailVerified) {
        setAppState('UNVERIFIED');
        return;
      }

      const ref = doc(db, 'users', currentUser.uid, 'profile', 'data');

      try {
        const snap = await getDoc(ref);
        if (!isMounted) return;

        if (snap.exists() && snap.data().onboardingComplete) {
          // If active injury exists, route to InjuryScreen instead of tabs
          if (snap.data().activeInjury?.active) {
            setAppState('INJURY_ACTIVE');
          } else if (snap.data().loadManagement?.active) {
            setAppState('LOAD_MANAGEMENT');
          } else if (snap.data().thermicEngine?.active) {
            setAppState('THERMIC_ENGINE');
          } else if (snap.data().deficitCycling?.active) {
            setAppState('DEFICIT_CYCLING');
          } else {
            setAppState('READY');
          }
        } else {
          setAppState('NEEDS_ONBOARDING');
        }
      } catch (error) {
        // Offline: getDoc may fail if cache is cold. 
        // Fall through to onSnapshot which serves from cache.
        console.log('Layout getDoc error (likely offline):', error.message);
      }

      if (!isMounted) return;

      profileUnsub = onSnapshot(ref, (liveSnap) => {
        if (!isMounted) return;

        if (liveSnap.exists() && liveSnap.data().onboardingComplete) {
          if (liveSnap.data().activeInjury?.active) {
            setAppState('INJURY_ACTIVE');
          } else if (liveSnap.data().loadManagement?.active) {
            setAppState('LOAD_MANAGEMENT');
          } else if (liveSnap.data().thermicEngine?.active) {
            setAppState('THERMIC_ENGINE');
          } else if (liveSnap.data().deficitCycling?.active) {
            setAppState('DEFICIT_CYCLING');
          } else {
            setAppState('READY');
          }
        } else {
          setAppState('NEEDS_ONBOARDING');
        }
      });
    };

    const bootstrapAuth = async () => {
      try {
        if (typeof auth.authStateReady === 'function') {
          await auth.authStateReady();
        }
      } catch (error) {
        console.log('Auth bootstrap error:', error.message);
      }

      if (!isMounted) return;

      authUnsub = onAuthStateChanged(auth, (currentUser) => {
        handleAuthChange(currentUser);
      });
    };

    bootstrapAuth();

    return () => {
      isMounted = false;
      authUnsub();
      clearProfileListener();
    };
  }, []);

  useEffect(() => {
    if (appState === 'INITIAL_LOADING') return;
    if (!segments || segments.length === 0) return;

    const currentRoute = segments[0];

    const isProtected = currentRoute === '(tabs)' || currentRoute === 'MealLogScreen' || currentRoute === 'WeeklyCheckIn' || currentRoute === 'LoadManagementScreen' || currentRoute === 'DeficitCyclingScreen' || currentRoute === 'ThermicEngineScreen' || currentRoute === 'InjuryScreen';
    const isOnboarding = currentRoute === 'OnboardingScreen';
    const isAuth = currentRoute === 'LoginScreen' || currentRoute === 'SignupScreen';

    if (appState === 'UNAUTHENTICATED' || appState === 'UNVERIFIED') {
      if (isProtected || isOnboarding) router.replace('/LoginScreen');

    } else if (appState === 'NEEDS_ONBOARDING') {
      if (!isOnboarding) router.replace('/OnboardingScreen');

    } else if (appState === 'READY') {
      if (isAuth || isOnboarding) router.replace('/(tabs)');
    } else if (appState === 'INJURY_ACTIVE') {
      const inInjury = currentRoute === 'InjuryScreen' || currentRoute === 'MealLogScreen';
      if (!inInjury) router.replace('/InjuryScreen');
    } else if (appState === 'LOAD_MANAGEMENT') {
      const inLM = currentRoute === 'LoadManagementScreen';
      if (!inLM) router.replace('/LoadManagementScreen');
    } else if (appState === 'THERMIC_ENGINE') {
      const inTE = currentRoute === 'ThermicEngineScreen' || currentRoute === 'MealLogScreen' || currentRoute === 'WeeklyCheckIn';
      if (!inTE) router.replace('/ThermicEngineScreen');
    } else if (appState === 'DEFICIT_CYCLING') {
      const inDC = currentRoute === 'DeficitCyclingScreen' || currentRoute === 'MealLogScreen' || currentRoute === 'WeeklyCheckIn';
      if (!inDC) router.replace('/DeficitCyclingScreen');
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState, segments]);

  if (appState === 'INITIAL_LOADING') {
    return (
      <LinearGradient colors={['#000000', '#000000']} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Image 
          source={require('../assets/images/quasar.png')} 
          style={{ width: 240, height: 240 }} 
          resizeMode="contain" 
        />
        <ActivityIndicator size="large" color="#ff4030" style={{ marginTop: 40 }} />
      </LinearGradient>
    );
  }

  return (
    <NetworkProvider>
      <ErrorBoundary>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="LoginScreen" options={{ headerShown: false }} />
            <Stack.Screen name="SignupScreen" options={{ headerShown: false }} />
            <Stack.Screen name="OnboardingScreen" options={{ headerShown: false }} />
            <Stack.Screen name="MealLogScreen" options={{ headerShown: false }} />
            <Stack.Screen name="WeeklyCheckIn" options={{ headerShown: false }} />
            <Stack.Screen name="InjuryScreen" options={{ headerShown: false }} />
            <Stack.Screen name="LoadManagementScreen" options={{ headerShown: false }} />
            <Stack.Screen name="DeficitCyclingScreen" options={{ headerShown: false }} />
            <Stack.Screen name="ThermicEngineScreen" options={{ headerShown: false }} />
            <Stack.Screen name="FunFactsScreen" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
          <OfflineBanner />
          <StatusBar style="auto" />
          <HealthDisclaimer />
        </ThemeProvider>
      </ErrorBoundary>
    </NetworkProvider>
  );
}
