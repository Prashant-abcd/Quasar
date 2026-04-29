import { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNetwork } from '../contexts/NetworkContext';
import { FUN_FACTS, CATEGORIES, shuffleFacts } from '../data/funFacts';

const { width: SW } = Dimensions.get('window');

const CATEGORY_COLORS = {
  food: '#EF4444',
  workout: '#3B82F6',
  nutrition: '#8B5CF6',
  body: '#F59E0B',
};

const CATEGORY_GRADIENTS = {
  food: ['rgba(239,68,68,0.15)', 'rgba(239,68,68,0.04)'],
  workout: ['rgba(59,130,246,0.15)', 'rgba(59,130,246,0.04)'],
  nutrition: ['rgba(139,92,246,0.15)', 'rgba(139,92,246,0.04)'],
  body: ['rgba(245,158,11,0.15)', 'rgba(245,158,11,0.04)'],
};

export default function FunFactsScreen() {
  const router = useRouter();
  const { isConnected } = useNetwork();
  const [activeCategory, setActiveCategory] = useState('all');

  // Shuffle once on mount
  const shuffled = useMemo(() => shuffleFacts(FUN_FACTS), []);

  const filtered = activeCategory === 'all'
    ? shuffled
    : shuffled.filter((f) => f.category === activeCategory);

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#000000', '#050101', '#0a0202']}
        style={StyleSheet.absoluteFill}
      />

      {/* Online indicator */}
      {isConnected && (
        <View style={styles.onlineBanner}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>You're back online!</Text>
          <TouchableOpacity
            style={styles.onlineCloseBtn}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              }
            }}
          >
            <Text style={styles.onlineCloseText}>Go back →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            }
          }}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={20}
            color="rgba(255,255,255,0.8)"
          />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Fun Facts 🧠</Text>
          <Text style={styles.headerSub}>
            {filtered.length} facts to explore while you wait
          </Text>
        </View>
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipContainer}
      >
        {CATEGORIES.map(({ key, label, emoji }) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.chip,
              activeCategory === key && styles.chipActive,
            ]}
            onPress={() => setActiveCategory(key)}
          >
            <Text style={styles.chipEmoji}>{emoji}</Text>
            <Text
              style={[
                styles.chipText,
                activeCategory === key && styles.chipTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Facts list */}
      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {filtered.map((fact, index) => {
          const color = CATEGORY_COLORS[fact.category] || '#fff';
          const gradient =
            CATEGORY_GRADIENTS[fact.category] || ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)'];

          return (
            <View key={`${fact.title}-${index}`} style={styles.card}>
              <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradient}
              >
                {/* Accent stripe */}
                <View style={[styles.cardStripe, { backgroundColor: color }]} />

                <View style={styles.cardContent}>
                  {/* Header row */}
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardEmoji}>{fact.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color }]}>
                        {fact.title}
                      </Text>
                      <View
                        style={[
                          styles.categoryBadge,
                          { backgroundColor: color + '18', borderColor: color + '30' },
                        ]}
                      >
                        <Text style={[styles.categoryBadgeText, { color }]}>
                          {fact.category.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.cardIndex}>
                      {index + 1}/{filtered.length}
                    </Text>
                  </View>

                  {/* Body */}
                  <Text style={styles.cardBody}>{fact.body}</Text>
                </View>
              </LinearGradient>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Online banner
  onlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(39,174,96,0.12)',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(39,174,96,0.20)',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#27ae60',
    shadowColor: '#27ae60',
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  onlineText: {
    flex: 1,
    color: '#80e8a0',
    fontSize: 13,
    fontWeight: '700',
  },
  onlineCloseBtn: {
    backgroundColor: 'rgba(39,174,96,0.15)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(39,174,96,0.25)',
  },
  onlineCloseText: {
    color: '#80e8a0',
    fontSize: 12,
    fontWeight: '700',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    color: '#ffe8d0',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  headerSub: {
    color: 'rgba(255,180,160,0.50)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },

  // Chips
  chipScroll: {
    maxHeight: 52,
    paddingVertical: 4,
  },
  chipContainer: {
    paddingHorizontal: 18,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipActive: {
    backgroundColor: 'rgba(255,100,70,0.15)',
    borderColor: 'rgba(255,100,70,0.30)',
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipText: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#ff8844',
  },

  // Body
  body: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
  },

  // Card
  card: {
    marginBottom: 14,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardGradient: {
    overflow: 'hidden',
  },
  cardStripe: {
    height: 3,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  cardContent: {
    padding: 18,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  cardEmoji: {
    fontSize: 28,
    marginTop: -2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  cardIndex: {
    color: 'rgba(255,255,255,0.20)',
    fontSize: 11,
    fontWeight: '600',
  },
  cardBody: {
    color: 'rgba(255,220,200,0.70)',
    fontSize: 13.5,
    lineHeight: 21,
    fontWeight: '500',
  },
});
