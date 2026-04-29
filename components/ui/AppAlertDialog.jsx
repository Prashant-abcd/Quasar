import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const VARIANT_THEME = {
  info: {
    icon: 'information-outline',
    accent: '#ff8f86',
    surface: 'rgba(231,76,60,0.14)',
    border: 'rgba(231,76,60,0.22)',
  },
  success: {
    icon: 'check-circle-outline',
    accent: '#9cf0af',
    surface: 'rgba(39,174,96,0.14)',
    border: 'rgba(39,174,96,0.22)',
  },
  warning: {
    icon: 'alert-outline',
    accent: '#ffd19d',
    surface: 'rgba(243,156,18,0.14)',
    border: 'rgba(243,156,18,0.24)',
  },
  error: {
    icon: 'alert-circle-outline',
    accent: '#ffb4b0',
    surface: 'rgba(231,76,60,0.16)',
    border: 'rgba(231,76,60,0.24)',
  },
};

const ACTION_GRADIENTS = {
  primary: ['#ff4030', '#cc2020'],
  danger: ['#d64545', '#7B1C1C'],
};

export default function AppAlertDialog({
  visible,
  title,
  message,
  variant = 'info',
  actions = [],
  onClose,
}) {
  const theme = VARIANT_THEME[variant] || VARIANT_THEME.info;
  const resolvedActions = actions.length > 0 ? actions : [{ label: 'Got it', tone: 'primary' }];

  const handleActionPress = (action) => {
    if (action.closeOnPress !== false) {
      onClose?.();
    }
    action.onPress?.();
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <MaterialCommunityIcons name={theme.icon} size={24} color={theme.accent} />
          </View>

          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}

          <View style={[styles.actions, resolvedActions.length === 1 && styles.actionsSingle]}>
            {resolvedActions.map((action, index) => {
              const tone = action.tone || (index === resolvedActions.length - 1 ? 'primary' : 'secondary');
              const isPrimaryTone = tone === 'primary' || tone === 'danger';

              return (
                <TouchableOpacity
                  key={`${action.label}-${index}`}
                  activeOpacity={0.9}
                  onPress={() => handleActionPress(action)}
                  style={[styles.actionButton, isPrimaryTone ? styles.actionButtonPrimary : styles.actionButtonSecondary]}
                >
                  {isPrimaryTone ? (
                    <LinearGradient
                      colors={ACTION_GRADIENTS[tone] || ACTION_GRADIENTS.primary}
                      style={styles.actionGradient}
                    >
                      <Text style={styles.actionTextPrimary}>{action.label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.actionSecondaryInner}>
                      <Text style={styles.actionTextSecondary}>{action.label}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8,0,0,0.76)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: '#160204',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 8,
  },
  message: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.62)',
    marginBottom: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionsSingle: {
    justifyContent: 'stretch',
  },
  actionButton: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  actionButtonPrimary: {
    flex: 1.1,
  },
  actionButtonSecondary: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  actionGradient: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSecondaryInner: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextPrimary: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  actionTextSecondary: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '800',
  },
});
