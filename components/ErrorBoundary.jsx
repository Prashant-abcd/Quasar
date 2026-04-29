import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Global error boundary that catches uncaught render errors and
 * shows a recovery screen instead of a blank white page.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // TODO: send to a crash-reporting service (Sentry / Firebase Crashlytics)
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <LinearGradient
          colors={['#1a0000', '#2a0a0e', '#1a0000']}
          style={styles.container}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              {/* Icon */}
              <View style={styles.iconWrap}>
                <LinearGradient
                  colors={['rgba(231,76,60,0.18)', 'rgba(231,76,60,0.05)']}
                  style={styles.iconGrad}
                >
                  <MaterialCommunityIcons
                    name="alert-circle-outline"
                    size={48}
                    color="#e74c3c"
                  />
                </LinearGradient>
              </View>

              {/* Copy */}
              <Text style={styles.title}>Something went wrong</Text>
              <Text style={styles.message}>
                The app hit an unexpected error. This won't affect your saved
                data — tap below to try recovering.
              </Text>

              {/* Error detail (collapsed) */}
              {this.state.error?.message ? (
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>ERROR DETAIL</Text>
                  <Text style={styles.detailText} numberOfLines={4}>
                    {this.state.error.message}
                  </Text>
                </View>
              ) : null}

              {/* CTA */}
              <TouchableOpacity
                style={styles.button}
                onPress={this.handleReset}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['#ff4030', '#cc2020']}
                  style={styles.buttonGrad}
                >
                  <MaterialCommunityIcons
                    name="refresh"
                    size={18}
                    color="#fff"
                  />
                  <Text style={styles.buttonText}>Try Again</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </LinearGradient>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  card: {
    backgroundColor: 'rgba(30,6,8,0.92)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.18)',
    padding: 32,
    alignItems: 'center',
  },
  iconWrap: { marginBottom: 24 },
  iconGrad: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  message: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
  },
  detailBox: {
    width: '100%',
    backgroundColor: 'rgba(231,76,60,0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.12)',
  },
  detailLabel: {
    color: 'rgba(231,76,60,0.6)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  detailText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#ff4030',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    width: '100%',
  },
  buttonGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
