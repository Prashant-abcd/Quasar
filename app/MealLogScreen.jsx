import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Animated,
  Dimensions, Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { useRouter } from 'expo-router';
import { getLocalDateKey } from '../utils/date';
import AppAlertDialog from '../components/ui/AppAlertDialog';
import useAppDialog from '../hooks/useAppDialog';
import { useNetwork } from '../contexts/NetworkContext';

const { width: SW, height: SH } = Dimensions.get('window');
const SCANNER_SIZE = SW * 0.72;
const SEARCHABLE_PRODUCTS_KEY = '@adaptcal/searchable-products-v1';

// ── Craving Decoder / Body Hack tips ────────────────────────────────────────
const CRAVING_TIPS_GENERAL = [
  { icon: 'water', text: "craving sugar? you might just be dehydrated. drink a full glass of water, wait 15 minutes, and see if it passes." },
  { icon: 'sleep', text: "slept less than 6 hours? your body craves high-calorie food when tired — that's ghrelin spiking. it's hormonal, not weakness." },
  { icon: 'leaf', text: "craving salty chips? could be low sodium from sweating during yesterday's workout. a pinch of salt in water fixes it faster than a packet of lays." },
  { icon: 'food-apple', text: "feeling ravenous? low fiber yesterday might be why. adding veggies to this meal will keep you full for hours." },
  { icon: 'emoticon-sad-outline', text: "eating because you're bored? that's not hunger — that's dopamine seeking. try a 5-minute walk or just scroll memes for a bit." },
  { icon: 'coffee', text: "mid-afternoon slump? a black coffee or green tea can kill fake hunger for 1-2 hours. zero calories, maximum effect." },
  { icon: 'food-steak', text: "can't stop thinking about food? you might not be eating enough protein. 30g protein per meal keeps hunger in check all day." },
  { icon: 'yoga', text: "stress eating? cortisol spikes literally increase appetite. three deep breaths before eating can change what and how much you choose." },
  { icon: 'brain', text: "craving chocolate? your body might actually want magnesium. dark chocolate (70%+) satisfies it with fewer calories than milk chocolate." },
  { icon: 'food-drumstick', text: "pro tip: eat protein first in every meal. it triggers satiety hormones faster than carbs or fat. same food, less hunger." },
  { icon: 'timer-sand', text: "it takes 20 minutes for your brain to register fullness. eat slower and you might naturally eat 15-20% less." },
  { icon: 'egg', text: "eggs are the ultimate snack — 78 kcal each, 6g protein, keeps you full for hours. boil a few and keep them ready." },
  { icon: 'noodles', text: "craving instant noodles? add an egg and some veggies. same comfort, 12g more protein, and actual nutrition." },
  { icon: 'stomach', text: "hunger comes in waves — it peaks and fades in about 20 minutes. if you wait it out, the craving often just disappears." },
  { icon: 'fruit-watermelon', text: "watermelon is 92% water and just 30 kcal per 100g. if you want to eat a LOT of something, this is your best friend." },
  { icon: 'peanut', text: "a handful of peanuts (30g) is 170 kcal but has 7g protein and healthy fats. way better than reaching for chips." },
  { icon: 'cup', text: "herbal tea (chamomile, peppermint) is 0 kcal and genuinely reduces appetite. keep a box at your desk." },
  { icon: 'carrot', text: "craving something crunchy? cucumbers and carrots scratch the same itch as chips but at 1/10th the calories." },
  { icon: 'food', text: "before logging a snack, ask: am I actually hungry, or am I just procrastinating? no judgment either way, just awareness." },
  { icon: 'run-fast', text: "10 minutes of movement (even walking in place) can reduce food cravings by up to 50%. your body confuses 'bored' with 'hungry.'" },
];

const CRAVING_TIPS_MORNING = [
  { icon: 'weather-sunny', text: "morning tip: front-load your protein at breakfast. 30g protein in the AM reduces total daily calorie intake by 10-15%." },
  { icon: 'egg-fried', text: "starting the day? eggs + toast is ~350 kcal and keeps you full till lunch. way better than skipping and binging later." },
  { icon: 'coffee', text: "morning coffee suppresses appetite for 1-2 hours. use that window to push breakfast later if you're not hungry yet." },
  { icon: 'food-apple', text: "a banana at breakfast gives you 27g carbs for quick energy plus potassium for muscle function. nature's pre-workout." },
  { icon: 'glass-mug-variant', text: "drink a glass of water first thing. you wake up dehydrated, and dehydration mimics hunger. hydrate before you eat." },
];

const CRAVING_TIPS_NIGHT = [
  { icon: 'weather-night', text: "late night snacking? your body doesn't store late-night food differently — calories don't have a clock. but mindless eating does add up." },
  { icon: 'rice', text: "science break: carbs at night actually help sleep by boosting serotonin. eating rice at dinner is fine. stop stressing." },
  { icon: 'glass-mug-variant', text: "craving something at 11 PM? try warm milk or chamomile tea first. often your body wants comfort, not calories." },
  { icon: 'food-croissant', text: "if you're genuinely hungry at night, eat. a small protein snack (yogurt, egg, handful of nuts) won't ruin your deficit." },
  { icon: 'sleep', text: "going to bed slightly hungry is okay and even normal during a cut. sleep erases the feeling. you'll wake up fine." },
];

const getCravingTip = () => {
  const hour = new Date().getHours();
  let pool;
  if (hour >= 5 && hour < 11) {
    pool = [...CRAVING_TIPS_MORNING, ...CRAVING_TIPS_GENERAL];
  } else if (hour >= 21 || hour < 5) {
    pool = [...CRAVING_TIPS_NIGHT, ...CRAVING_TIPS_GENERAL];
  } else {
    pool = CRAVING_TIPS_GENERAL;
  }
  return pool[Math.floor(Math.random() * pool.length)];
};
const MAX_SEARCHABLE_PRODUCTS = 40;
const ONLINE_RESULT_LIMIT = 12;

// ── Food DB (same as before, abbreviated for space — keep your full version) ──
const FOOD_DB = [
  { id: 'r001', name: 'Roti / Chapati', aliases: ['chapati', 'chapathi', 'phulka', 'roti'], cal: 297, protein: 7.9, carbs: 63.7, fat: 3.7, unit: 'pieces', unitWeight: 30, unitLabel: 'medium roti (30g)' },
  { id: 'r002', name: 'Paratha (Plain)', aliases: ['paratha', 'parata', 'parantha'], cal: 326, protein: 8.2, carbs: 60.1, fat: 7.1, unit: 'pieces', unitWeight: 60, unitLabel: 'medium paratha (60g)' },
  { id: 'r003', name: 'Aloo Paratha', aliases: ['aloo paratha', 'potato paratha'], cal: 198, protein: 4.8, carbs: 30.2, fat: 6.8, unit: 'pieces', unitWeight: 100, unitLabel: 'paratha (100g)' },
  { id: 'r004', name: 'Puri', aliases: ['poori', 'puri'], cal: 340, protein: 7.2, carbs: 54.1, fat: 11.8, unit: 'pieces', unitWeight: 30, unitLabel: 'medium puri (30g)' },
  { id: 'r005', name: 'Naan', aliases: ['naan', 'nan'], cal: 310, protein: 9.5, carbs: 57.0, fat: 5.2, unit: 'pieces', unitWeight: 90, unitLabel: 'naan (90g)' },
  { id: 'r006', name: 'White Rice (cooked)', aliases: ['rice', 'white rice', 'steamed rice', 'plain rice', 'chawal'], cal: 130, protein: 2.7, carbs: 28.1, fat: 0.3, unit: 'cups', unitWeight: 158, unitLabel: 'cup cooked (158g)' },
  { id: 'r007', name: 'Brown Rice (cooked)', aliases: ['brown rice'], cal: 111, protein: 2.6, carbs: 23.0, fat: 0.9, unit: 'cups', unitWeight: 195, unitLabel: 'cup cooked (195g)' },
  { id: 'r008', name: 'Biryani (Chicken)', aliases: ['chicken biryani', 'biriyani', 'biryani'], cal: 167, protein: 8.5, carbs: 20.3, fat: 5.2, unit: 'plates', unitWeight: 300, unitLabel: 'plate (300g)' },
  { id: 'r009', name: 'Biryani (Veg)', aliases: ['veg biryani', 'vegetable biryani'], cal: 140, protein: 4.1, carbs: 24.7, fat: 3.8, unit: 'plates', unitWeight: 300, unitLabel: 'plate (300g)' },
  { id: 'r010', name: 'Upma', aliases: ['upma', 'uppma'], cal: 160, protein: 4.0, carbs: 22.0, fat: 6.5, unit: 'bowls', unitWeight: 150, unitLabel: 'bowl (150g)' },
  { id: 'r011', name: 'Poha', aliases: ['poha', 'pohe', 'flattened rice'], cal: 130, protein: 2.8, carbs: 24.5, fat: 3.2, unit: 'bowls', unitWeight: 150, unitLabel: 'bowl (150g)' },
  { id: 'r012', name: 'Idli', aliases: ['idli', 'idly'], cal: 58, protein: 1.8, carbs: 12.5, fat: 0.1, unit: 'pieces', unitWeight: 50, unitLabel: 'idli (50g)' },
  { id: 'r013', name: 'Dosa (Plain)', aliases: ['dosa', 'plain dosa', 'sada dosa'], cal: 168, protein: 4.3, carbs: 28.8, fat: 4.4, unit: 'pieces', unitWeight: 90, unitLabel: 'dosa (90g)' },
  { id: 'r014', name: 'Masala Dosa', aliases: ['masala dosa'], cal: 210, protein: 5.1, carbs: 30.2, fat: 7.8, unit: 'pieces', unitWeight: 150, unitLabel: 'dosa (150g)' },
  { id: 'r016', name: 'Maggi Noodles', aliases: ['maggi', 'maggi noodles', 'instant noodles'], cal: 435, protein: 9.5, carbs: 66.5, fat: 14.5, unit: 'packets', unitWeight: 70, unitLabel: 'packet (70g dry)' },
  { id: 'r017', name: 'Bread (White)', aliases: ['bread', 'white bread', 'sandwich bread'], cal: 265, protein: 9.0, carbs: 50.6, fat: 3.2, unit: 'slices', unitWeight: 25, unitLabel: 'slice (25g)' },
  { id: 'r018', name: 'Bread (Brown/Whole Wheat)', aliases: ['brown bread', 'whole wheat bread', 'multigrain bread'], cal: 243, protein: 10.6, carbs: 45.8, fat: 3.7, unit: 'slices', unitWeight: 25, unitLabel: 'slice (25g)' },
  { id: 'd001', name: 'Dal (Toor/Arhar)', aliases: ['toor dal', 'arhar dal', 'dal', 'pigeon peas'], cal: 85, protein: 5.8, carbs: 12.8, fat: 0.5, unit: 'bowls', unitWeight: 150, unitLabel: 'bowl cooked (150g)' },
  { id: 'd002', name: 'Dal Makhani', aliases: ['dal makhani', 'makhani dal'], cal: 150, protein: 7.5, carbs: 16.8, fat: 5.8, unit: 'bowls', unitWeight: 150, unitLabel: 'bowl (150g)' },
  { id: 'd004', name: 'Rajma', aliases: ['rajma', 'kidney beans', 'rajma masala'], cal: 103, protein: 6.7, carbs: 16.8, fat: 0.5, unit: 'bowls', unitWeight: 150, unitLabel: 'bowl (150g)' },
  { id: 'd005', name: 'Chole / Chana Masala', aliases: ['chole', 'chana masala', 'chickpeas', 'kabuli chana'], cal: 164, protein: 8.6, carbs: 27.1, fat: 2.9, unit: 'bowls', unitWeight: 150, unitLabel: 'bowl (150g)' },
  { id: 'v002', name: 'Palak Paneer', aliases: ['palak paneer', 'spinach paneer'], cal: 135, protein: 7.2, carbs: 6.8, fat: 9.1, unit: 'bowls', unitWeight: 150, unitLabel: 'bowl (150g)' },
  { id: 'v003', name: 'Paneer Butter Masala', aliases: ['paneer butter masala', 'butter paneer', 'paneer makhani'], cal: 198, protein: 9.8, carbs: 9.1, fat: 14.5, unit: 'bowls', unitWeight: 150, unitLabel: 'bowl (150g)' },
  { id: 'v004', name: 'Paneer (Raw)', aliases: ['paneer', 'cottage cheese'], cal: 265, protein: 18.3, carbs: 1.2, fat: 20.8, unit: 'grams', unitWeight: 100, unitLabel: '100g' },
  { id: 'm001', name: 'Chicken Curry', aliases: ['chicken curry', 'chicken gravy', 'murgh curry'], cal: 165, protein: 17.8, carbs: 4.2, fat: 8.9, unit: 'bowls', unitWeight: 150, unitLabel: 'bowl (150g)' },
  { id: 'm002', name: 'Butter Chicken', aliases: ['butter chicken', 'murgh makhani', 'chicken makhani'], cal: 198, protein: 16.5, carbs: 7.8, fat: 11.8, unit: 'bowls', unitWeight: 150, unitLabel: 'bowl (150g)' },
  { id: 'm005', name: 'Chicken Breast (grilled)', aliases: ['chicken breast', 'grilled chicken', 'boiled chicken'], cal: 165, protein: 31.0, carbs: 0, fat: 3.6, unit: 'grams', unitWeight: 100, unitLabel: '100g' },
  { id: 'm006', name: 'Egg (Whole)', aliases: ['egg', 'anda', 'boiled egg', 'scrambled egg'], cal: 143, protein: 13.0, carbs: 0.7, fat: 9.5, unit: 'pieces', unitWeight: 50, unitLabel: 'egg (50g)' },
  { id: 'm007', name: 'Egg White', aliases: ['egg white', 'egg whites'], cal: 52, protein: 10.9, carbs: 0.7, fat: 0.2, unit: 'pieces', unitWeight: 33, unitLabel: 'egg white' },
  { id: 'm010', name: 'Omelette', aliases: ['omelette', 'omelet', 'egg omelette'], cal: 154, protein: 10.6, carbs: 0.4, fat: 12.0, unit: 'pieces', unitWeight: 100, unitLabel: 'omelette (2 eggs)' },
  { id: 's001', name: 'Samosa', aliases: ['samosa', 'samosa chaat'], cal: 262, protein: 5.1, carbs: 30.2, fat: 13.9, unit: 'pieces', unitWeight: 70, unitLabel: 'samosa (70g)' },
  { id: 's004', name: 'Vada Pav', aliases: ['vada pav', 'wada pav'], cal: 295, protein: 7.5, carbs: 44.8, fat: 9.8, unit: 'pieces', unitWeight: 120, unitLabel: 'vada pav' },
  { id: 's005', name: 'Pav Bhaji', aliases: ['pav bhaji'], cal: 180, protein: 5.2, carbs: 26.8, fat: 6.5, unit: 'plates', unitWeight: 200, unitLabel: 'plate (with 2 pav)' },
  { id: 'dy001', name: 'Milk (Full Fat)', aliases: ['milk', 'doodh', 'whole milk'], cal: 61, protein: 3.2, carbs: 4.8, fat: 3.5, unit: 'ml', unitWeight: 200, unitLabel: 'glass (200ml)' },
  { id: 'dy003', name: 'Curd / Dahi (Full Fat)', aliases: ['curd', 'dahi', 'yogurt', 'yoghurt'], cal: 60, protein: 3.1, carbs: 4.7, fat: 3.2, unit: 'bowls', unitWeight: 100, unitLabel: 'bowl (100g)' },
  { id: 'dy007', name: 'Ghee', aliases: ['ghee', 'clarified butter'], cal: 900, protein: 0, carbs: 0, fat: 99.7, unit: 'tsp', unitWeight: 5, unitLabel: 'teaspoon (5g)' },
  { id: 'f001', name: 'Banana', aliases: ['banana', 'kela'], cal: 89, protein: 1.1, carbs: 22.8, fat: 0.3, unit: 'sizes', unitWeight: 0, unitLabel: '', sizes: [{ label: 'Small (80g)', weight: 80 }, { label: 'Medium (120g)', weight: 120 }, { label: 'Large (150g)', weight: 150 }] },
  { id: 'f002', name: 'Apple', aliases: ['apple', 'seb'], cal: 52, protein: 0.3, carbs: 13.8, fat: 0.2, unit: 'sizes', unitWeight: 0, unitLabel: '', sizes: [{ label: 'Small (130g)', weight: 130 }, { label: 'Medium (180g)', weight: 180 }, { label: 'Large (240g)', weight: 240 }] },
  { id: 'f003', name: 'Mango', aliases: ['mango', 'aam'], cal: 60, protein: 0.8, carbs: 14.9, fat: 0.4, unit: 'sizes', unitWeight: 0, unitLabel: '', sizes: [{ label: 'Small (150g)', weight: 150 }, { label: 'Medium (200g)', weight: 200 }, { label: 'Large (300g)', weight: 300 }] },
  { id: 'b001', name: 'Chai / Tea (with milk & sugar)', aliases: ['chai', 'tea', 'cutting chai', 'masala chai'], cal: 55, protein: 1.2, carbs: 8.5, fat: 1.8, unit: 'cups', unitWeight: 150, unitLabel: 'cup (150ml)' },
  { id: 'b002', name: 'Black Coffee', aliases: ['black coffee', 'coffee', 'espresso'], cal: 2, protein: 0.3, carbs: 0, fat: 0, unit: 'cups', unitWeight: 240, unitLabel: 'cup (240ml)' },
  { id: 'b006', name: 'Protein Shake / Whey', aliases: ['protein shake', 'whey protein', 'protein powder'], cal: 120, protein: 24.0, carbs: 5.0, fat: 1.5, unit: 'scoops', unitWeight: 30, unitLabel: 'scoop (30g)' },
  { id: 'sw001', name: 'Gulab Jamun', aliases: ['gulab jamun', 'gulab jamoon'], cal: 175, protein: 2.1, carbs: 25.8, fat: 7.2, unit: 'pieces', unitWeight: 50, unitLabel: 'piece (50g)' },
  { id: 'sw005', name: 'Chocolate', aliases: ['chocolate', 'dairy milk', 'kitkat'], cal: 546, protein: 4.9, carbs: 59.4, fat: 31.3, unit: 'grams', unitWeight: 40, unitLabel: 'small bar (40g)' },
  { id: 'sw006', name: 'Ice Cream', aliases: ['ice cream', 'icecream', 'kulfi'], cal: 207, protein: 3.5, carbs: 23.6, fat: 11.0, unit: 'scoops', unitWeight: 65, unitLabel: 'scoop (65g)' },
  { id: 'i001', name: 'Pizza (Cheese)', aliases: ['pizza', 'cheese pizza'], cal: 266, protein: 11.4, carbs: 32.9, fat: 10.4, unit: 'slices', unitWeight: 100, unitLabel: 'slice (100g)' },
  { id: 'i002', name: 'Burger', aliases: ['burger', 'hamburger'], cal: 295, protein: 17.0, carbs: 24.0, fat: 14.0, unit: 'pieces', unitWeight: 150, unitLabel: 'burger (150g)' },
  { id: 'i004', name: 'Oats (cooked)', aliases: ['oats', 'oatmeal', 'porridge', 'daliya'], cal: 71, protein: 2.5, carbs: 12.0, fat: 1.5, unit: 'bowls', unitWeight: 234, unitLabel: 'bowl cooked (234g)' },
  { id: 'i005', name: 'Peanut Butter', aliases: ['peanut butter'], cal: 588, protein: 25.0, carbs: 20.0, fat: 50.0, unit: 'tsp', unitWeight: 16, unitLabel: 'tablespoon (16g)' },
  { id: 'i006', name: 'Almonds', aliases: ['almonds', 'badam'], cal: 579, protein: 21.2, carbs: 21.6, fat: 49.9, unit: 'pieces', unitWeight: 28, unitLabel: '20 almonds (28g)' },
  { id: 'i009', name: 'Boiled Potato', aliases: ['boiled potato', 'potato', 'aloo'], cal: 87, protein: 1.9, carbs: 20.1, fat: 0.1, unit: 'pieces', unitWeight: 150, unitLabel: 'medium potato (150g)' },
];

const MEAL_TYPES = [
  { label: 'Breakfast', icon: 'weather-sunset-up' },
  { label: 'Lunch', icon: 'silverware-fork-knife' },
  { label: 'Dinner', icon: 'weather-night' },
  { label: 'Snack', icon: 'food-apple' },
  { label: 'Pre-Workout', icon: 'lightning-bolt' },
  { label: 'Post-Workout', icon: 'dumbbell' },
];

const QUICK_PICKS = ['Roti / Chapati', 'White Rice (cooked)', 'Egg (Whole)', 'Chicken Breast (grilled)', 'Dal (Toor/Arhar)', 'Banana', 'Oats (cooked)', 'Paneer (Raw)'];

const normalizeSearchText = (value = '') => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const getSearchTokens = (value = '') => normalizeSearchText(value).split(' ').filter(Boolean);

const getFoodKey = (food) => {
  if (food?.barcode) return `barcode:${food.barcode}`;
  return `${normalizeSearchText(food?.brand || '')}|${normalizeSearchText(food?.name || '')}`;
};

const mergeUniqueFoods = (...lists) => {
  const merged = [];
  const seen = new Set();

  lists.flat().forEach((food) => {
    if (!food?.name) return;
    const key = getFoodKey(food);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(food);
  });

  return merged;
};

const mergeRecentFoods = (incomingFoods, existingFoods) =>
  mergeUniqueFoods(incomingFoods, existingFoods).slice(0, MAX_SEARCHABLE_PRODUCTS);

const toFiniteNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const getEnergyKcalPer100g = (nutriments = {}) => {
  const directKcal = toFiniteNumber(nutriments['energy-kcal_100g']);
  if (directKcal !== null) {
    return directKcal;
  }

  const kjValue = toFiniteNumber(nutriments['energy-kj_100g'] ?? nutriments.energy_100g);
  if (kjValue !== null) {
    return kjValue / 4.184;
  }

  return null;
};

const getMatchScore = (food, query) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const tokens = getSearchTokens(query);
  const name = normalizeSearchText(food.name);
  const brand = normalizeSearchText(food.brand || '');
  const aliases = normalizeSearchText((food.aliases || []).join(' '));
  const barcode = normalizeSearchText(food.barcode || '');
  const combined = [name, brand, aliases, barcode].filter(Boolean).join(' ');
  const exactBrandName = normalizeSearchText(`${food.brand || ''} ${food.name || ''}`);
  const exactNameBrand = normalizeSearchText(`${food.name || ''} ${food.brand || ''}`);

  let score = 0;

  if (food.barcode && food.barcode === query.trim()) score += 200;
  if (name === normalizedQuery) score += 140;
  if (exactBrandName === normalizedQuery || exactNameBrand === normalizedQuery) score += 130;
  if (name.startsWith(normalizedQuery)) score += 95;
  if (brand.startsWith(normalizedQuery)) score += 50;
  if (combined.includes(normalizedQuery)) score += 70;

  const matchesAllTokens = tokens.every((token) => combined.includes(token));
  if (matchesAllTokens) score += 40;

  tokens.forEach((token) => {
    if (name.split(' ').includes(token)) score += 16;
    else if (name.includes(token)) score += 10;

    if (brand.split(' ').includes(token)) score += 12;
    else if (brand.includes(token)) score += 6;

    if (aliases.includes(token)) score += 8;
  });

  if (food.source === 'Barcode Scan') score += 4;
  if (food.source === 'Open Food Facts') score += 2;

  return score;
};

const sortFoodsByQuery = (foods, query) => foods
  .map((food) => ({ food, score: getMatchScore(food, query) }))
  .filter(({ score }) => score > 0)
  .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name))
  .map(({ food }) => food);

const createOpenFoodFactsItem = (product, source = 'Open Food Facts', fallbackId = '') => {
  const nutriments = product.nutriments || {};
  const caloriesPer100g = getEnergyKcalPer100g(nutriments);
  const productName = (
    product.product_name ||
    product.product_name_en ||
    product.abbreviated_product_name ||
    product.generic_name ||
    ''
  ).trim();

  if (!productName || !Number.isFinite(caloriesPer100g)) return null;

  return {
    id: fallbackId || `off_${product.code || normalizeSearchText(productName)}`,
    name: productName,
    brand: (product.brands || '').trim(),
    cal: Math.round(caloriesPer100g),
    protein: Math.round((Number(nutriments['proteins_100g']) || 0) * 10) / 10,
    carbs: Math.round((Number(nutriments['carbohydrates_100g']) || 0) * 10) / 10,
    fat: Math.round((Number(nutriments['fat_100g']) || 0) * 10) / 10,
    unit: 'grams',
    unitWeight: 100,
    unitLabel: '100g',
    source,
    barcode: product.code || '',
  };
};

const searchLocalDB = (q) => {
  if (!q || q.length < 2) return [];
  return sortFoodsByQuery(FOOD_DB, q).slice(0, 8);
};

const searchRememberedProducts = (q, products) => {
  if (!q || q.length < 2) return [];
  return sortFoodsByQuery(products, q).slice(0, 8);
};

const searchOpenFoodFacts = async (q) => {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=code,product_name,product_name_en,abbreviated_product_name,generic_name,brands,nutriments,serving_size`;
    const res = await fetch(url);
    const data = await res.json();

    const foods = (data.products || [])
      .map((product, index) => createOpenFoodFactsItem(product, 'Open Food Facts', `off_${product.code || index}`))
      .filter(Boolean);

    return sortFoodsByQuery(mergeUniqueFoods(foods), q).slice(0, ONLINE_RESULT_LIMIT);
  } catch { return []; }
};

const fetchByBarcode = async (barcode) => {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await res.json();
    if (data.status !== 1) return null;
    return createOpenFoodFactsItem(
      { ...data.product, code: data.product?.code || barcode },
      'Barcode Scan',
      `barcode_${barcode}`
    );
  } catch { return null; }
};

// ── Animated scanner line ──────────────────────────────────────────────────────
function ScanLine() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(anim, { toValue: 0, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, [anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, SCANNER_SIZE - 4] });
  return (
    <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
  );
}

export default function MealLogScreen() {
  const router = useRouter();
  const { isConnected } = useNetwork();
  const [permission, requestPermission] = useCameraPermissions();
  const searchableProductsRef = useRef([]);

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false); // prevent double scan
  const [scanning, setScanning] = useState(false);           // fetching barcode data

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Food selection state
  const [selectedFood, setSelectedFood] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState(null);
  const [customGrams, setCustomGrams] = useState('');
  const [useCustomGrams, setUseCustomGrams] = useState(false);
  const [mealType, setMealType] = useState('Lunch');
  const [saving, setSaving] = useState(false);
  const [cravingTip] = useState(() => getCravingTip());
  const [cravingVisible, setCravingVisible] = useState(true);
  const [aiMode, setAiMode] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [activeProfile, setActiveProfile] = useState(null);
  const { showDialog, dialogProps } = useAppDialog();

  // Load profile to check if thermic engine is active
  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const snap = await getDoc(doc(db, 'users', uid, 'profile', 'data'));
        if (snap.exists()) setActiveProfile(snap.data());
      } catch (_) {}
    })();
  }, []);

  // Card slide-in anim
  const cardAnim = useRef(new Animated.Value(60)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (selectedFood || aiResult) {
      cardAnim.setValue(60);
      cardOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(cardAnim, { toValue: 0, duration: 380, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [cardAnim, cardOpacity, selectedFood, aiResult]);

  useEffect(() => {
    const loadRememberedProducts = async () => {
      try {
        const stored = await AsyncStorage.getItem(SEARCHABLE_PRODUCTS_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        searchableProductsRef.current = Array.isArray(parsed) ? parsed : [];
      } catch {
        searchableProductsRef.current = [];
      }
    };

    loadRememberedProducts();
  }, []);

  const rememberProducts = (foods) => {
    const productsToStore = foods.filter((food) => food?.name && (food.barcode || food.brand || food.source));
    if (productsToStore.length === 0) return;

    const merged = mergeRecentFoods(productsToStore, searchableProductsRef.current);
    searchableProductsRef.current = merged;
    AsyncStorage.setItem(SEARCHABLE_PRODUCTS_KEY, JSON.stringify(merged)).catch(() => {});
  };

  // Search debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;

    const t = setTimeout(async () => {
      setSearching(true);
      const local = searchLocalDB(searchQuery);
      const remembered = searchRememberedProducts(searchQuery, searchableProductsRef.current);
      const seedResults = sortFoodsByQuery(
        mergeUniqueFoods(remembered, local),
        searchQuery
      ).slice(0, ONLINE_RESULT_LIMIT);

      if (!cancelled) {
        setSearchResults(seedResults);
      }

      // Only hit Open Food Facts if online
      let online = [];
      if (isConnected) {
        online = await searchOpenFoodFacts(searchQuery);
        if (online.length > 0) {
          rememberProducts(online);
        }
      }

      if (!cancelled) {
        setSearchResults(
          sortFoodsByQuery(
            mergeUniqueFoods(remembered, local, online),
            searchQuery
          )
            .slice(0, ONLINE_RESULT_LIMIT)
        );
        setSearching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery]);

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        showDialog({
          title: 'Camera permission needed',
          message: 'Allow camera access so Quasar can scan packaged foods for you.',
          variant: 'warning',
        });
        return;
      }
    }
    setScannerLocked(false);
    setScannerOpen(true);
  };

  const onBarcodeScanned = async ({ data }) => {
    if (scannerLocked) return;
    setScannerLocked(true);
    setScanning(true);
    setScannerOpen(false);

    const food = await fetchByBarcode(data);
    setScanning(false);

    if (food) {
      selectFood(food);
    } else {
      showDialog({
        title: 'Product not found',
        message: `Barcode ${data} is not in Open Food Facts yet. Try searching by name instead.`,
        variant: 'info',
        actions: [{
          label: 'Search manually',
          tone: 'primary',
          onPress: () => setScannerLocked(false),
        }],
      });
    }
  };

  const selectFood = (food) => {
    if (food.source === 'Barcode Scan' || food.source === 'Open Food Facts') {
      rememberProducts([food]);
    }
    setSelectedFood(food);
    setSearchQuery('');
    setSearchResults([]);
    setQuantity(1);
    setSelectedSize(food.sizes ? food.sizes[1] || food.sizes[0] : null);
    setCustomGrams('');
    setUseCustomGrams(false);
    setAiMode(false);
    setAiResult(null);
    setAiDescription('');
  };

  const getEffectiveWeight = () => {
    if (useCustomGrams) return parseFloat(customGrams) || 0;
    if (selectedFood?.unit === 'sizes' && selectedSize) return selectedSize.weight * quantity;
    return (selectedFood?.unitWeight || 0) * quantity;
  };

  const getCalories = () => Math.round((selectedFood?.cal / 100) * getEffectiveWeight());
  const getMacro = (f) => Math.round(((selectedFood?.[f] || 0) / 100) * getEffectiveWeight() * 10) / 10;

  const handleSave = async () => {
    if (!selectedFood) return;
    const calories = getCalories();
    if (calories <= 0) {
      showDialog({
        title: 'Set a valid quantity first',
        message: 'Choose a portion above 0 grams before saving this meal.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const userId = auth.currentUser.uid;
      const today = getLocalDateKey();
      await addDoc(collection(db, 'users', userId, 'logs', today, 'meals'), {
        foodName: selectedFood.name,
        calories,
        protein: getMacro('protein'),
        carbs: getMacro('carbs'),
        fat: getMacro('fat'),
        grams: getEffectiveWeight(),
        mealType,
        loggedAt: new Date().toISOString(),
      });
      // TEF breakdown when thermic engine is active
      const isTE = activeProfile?.thermicEngine?.active;
      if (isTE) {
        const p = getMacro('protein');
        const c = getMacro('carbs');
        const f = getMacro('fat');
        const pTEF = Math.round(p * 4 * 0.25);
        const cTEF = Math.round(c * 4 * 0.08);
        const fTEF = Math.round(f * 9 * 0.02);
        const totalTEF = pTEF + cTEF + fTEF;
        const netCal = calories - totalTEF;
        showDialog({
          title: 'Meal logged — TEF applied!',
          message: `Gross: ${calories} kcal\n\nTEF Breakdown:\n  Protein (${p}g): −${pTEF} kcal (25%)\n  Carbs (${c}g): −${cTEF} kcal (8%)\n  Fat (${f}g): −${fTEF} kcal (2%)\n\nTotal refund: +${totalTEF} kcal\nNet impact: ${netCal} kcal`,
          variant: 'success',
          actions: [
            { label: 'Log another', tone: 'secondary', onPress: () => setSelectedFood(null) },
            { label: 'Done', tone: 'primary', onPress: () => router.back() },
          ],
        });
      } else {
        showDialog({
          title: 'Meal logged',
          message: `${calories} kcal added to ${mealType}.`,
          variant: 'success',
          actions: [
            { label: 'Log another', tone: 'secondary', onPress: () => setSelectedFood(null) },
            { label: 'Done', tone: 'primary', onPress: () => router.back() },
          ],
        });
      }
    } catch (e) {
      showDialog({
        title: 'Could not save meal',
        message: e.message,
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── AI Describe ────────────────────────────────────────────────────────────
  const analyzeWithAI = async (description) => {
    setAiLoading(true);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-20250414',
          max_tokens: 300,
          system: 'You are a nutritionist AI. The user describes a meal they ate. Estimate the total calories and macronutrients. Return ONLY valid JSON in this exact format, no other text: {"foodName":"short meal name","calories":integer,"protein":number,"carbs":number,"fat":number,"breakdown":"item1 (~Xkcal), item2 (~Ykcal)"}. Use ICMR-NIN data for Indian foods. Be realistic with typical Indian home-cooked portions. Round calories to nearest integer, macros to 1 decimal.',
          messages: [{ role: 'user', content: description }],
        }),
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const parsed = JSON.parse(jsonMatch[0]);

      if (!parsed.calories || !parsed.foodName) throw new Error('Invalid response');

      setAiResult({
        foodName: parsed.foodName,
        calories: Math.round(parsed.calories),
        protein: Math.round((parsed.protein || 0) * 10) / 10,
        carbs: Math.round((parsed.carbs || 0) * 10) / 10,
        fat: Math.round((parsed.fat || 0) * 10) / 10,
        breakdown: parsed.breakdown || '',
      });
    } catch (error) {
      showDialog({
        title: 'Could not analyze meal',
        message: 'AI couldn\'t process that description. Try being more specific about portions and food items.',
        variant: 'error',
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleAISave = async () => {
    if (!aiResult) return;
    setSaving(true);
    try {
      const userId = auth.currentUser.uid;
      const today = getLocalDateKey();
      await addDoc(collection(db, 'users', userId, 'logs', today, 'meals'), {
        foodName: aiResult.foodName,
        calories: aiResult.calories,
        protein: aiResult.protein,
        carbs: aiResult.carbs,
        fat: aiResult.fat,
        grams: 0,
        mealType,
        loggedAt: new Date().toISOString(),
        source: 'ai-describe',
      });

      const isTE = activeProfile?.thermicEngine?.active;
      if (isTE) {
        const p = aiResult.protein;
        const c = aiResult.carbs;
        const f = aiResult.fat;
        const pTEF = Math.round(p * 4 * 0.25);
        const cTEF = Math.round(c * 4 * 0.08);
        const fTEF = Math.round(f * 9 * 0.02);
        const totalTEF = pTEF + cTEF + fTEF;
        const netCal = aiResult.calories - totalTEF;
        showDialog({
          title: 'Meal logged — TEF applied!',
          message: `Gross: ${aiResult.calories} kcal\n\nTEF Breakdown:\n  Protein (${p}g): \u2212${pTEF} kcal (25%)\n  Carbs (${c}g): \u2212${cTEF} kcal (8%)\n  Fat (${f}g): \u2212${fTEF} kcal (2%)\n\nTotal refund: +${totalTEF} kcal\nNet impact: ${netCal} kcal`,
          variant: 'success',
          actions: [
            { label: 'Log another', tone: 'secondary', onPress: () => { setAiMode(false); setAiResult(null); setAiDescription(''); } },
            { label: 'Done', tone: 'primary', onPress: () => router.back() },
          ],
        });
      } else {
        showDialog({
          title: 'Meal logged',
          message: `${aiResult.calories} kcal added to ${mealType}.`,
          variant: 'success',
          actions: [
            { label: 'Log another', tone: 'secondary', onPress: () => { setAiMode(false); setAiResult(null); setAiDescription(''); } },
            { label: 'Done', tone: 'primary', onPress: () => router.back() },
          ],
        });
      }
    } catch (e) {
      showDialog({
        title: 'Could not save meal',
        message: e.message,
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── SCANNER SCREEN ─────────────────────────────────────────────────────────
  if (scannerOpen) {
    return (
      <View style={styles.scanScreen}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={onBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39'] }}
        />

        {/* Dark overlay with cutout */}
        <View style={styles.scanOverlay}>
          {/* Top dark */}
          <View style={[styles.scanDark, { height: (SH - SCANNER_SIZE) / 2 - 60 }]} />

          {/* Middle row */}
          <View style={{ flexDirection: 'row', height: SCANNER_SIZE }}>
            <View style={[styles.scanDark, { flex: 1 }]} />
            {/* The cutout */}
            <View style={styles.scanCutout}>
              {/* Corner brackets */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
              <ScanLine />
            </View>
            <View style={[styles.scanDark, { flex: 1 }]} />
          </View>

          {/* Bottom dark */}
          <View style={[styles.scanDark, { flex: 1 }]}>
            <Text style={styles.scanHint}>point at any barcode on packaged food</Text>
            <Text style={styles.scanHint2}>Maggi · Amul · Britannia · Lay&apos;s · and more</Text>
            <TouchableOpacity style={styles.scanCancelBtn} onPress={() => setScannerOpen(false)}>
              <MaterialCommunityIcons name="close-circle" size={20} color="rgba(255,255,255,0.7)" />
              <Text style={styles.scanCancelText}>cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── MAIN SCREEN ────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>

      {/* ── Header ── */}
      <LinearGradient colors={['#000000', '#050101', '#0a0202']} style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Log a Meal</Text>
            <Text style={styles.headerSub}>search · scan · describe · log</Text>
          </View>
          {/* Barcode scan button */}
          <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
            {scanning
              ? <ActivityIndicator size="small" color="#fff" />
              : <MaterialCommunityIcons name="barcode-scan" size={22} color="#fff" />
            }
          </TouchableOpacity>
        </View>

        {/* Meal type chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          {MEAL_TYPES.map(({ label, icon }) => (
            <TouchableOpacity
              key={label}
              style={[styles.mealChip, mealType === label && styles.mealChipActive]}
              onPress={() => setMealType(label)}
            >
              <MaterialCommunityIcons
                name={icon}
                size={13}
                color={mealType === label ? '#000' : 'rgba(255,255,255,0.6)'}
              />
              <Text style={[styles.mealChipText, mealType === label && styles.mealChipTextActive]}>
                {' '}{label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ── Search bar ── */}
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search food… roti, chicken, banana"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
              <MaterialCommunityIcons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={openScanner} style={styles.searchScanBtn}>
              <MaterialCommunityIcons name="barcode-scan" size={18} color="#ff4030" />
              <Text style={styles.searchScanText}>Scan</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Offline indicator */}
        {!isConnected && (
          <View style={styles.offlinePill}>
            <MaterialCommunityIcons name="wifi-off" size={13} color="#ff8844" />
            <Text style={styles.offlinePillText}>offline — showing local foods only</Text>
          </View>
        )}

        {/* ── Craving Decoder / Body Hack ── */}
        {cravingVisible && !searchQuery && !selectedFood && (
          <View style={styles.cravingCard}>
            <LinearGradient colors={['rgba(255,60,30,0.12)', 'rgba(10,2,2,0.9)']} style={styles.cravingGradient}>
              <View style={styles.cravingHeader}>
                <View style={styles.cravingIconWrap}>
                  <MaterialCommunityIcons name={cravingTip.icon} size={18} color="#ff6b4a" />
                </View>
                <Text style={styles.cravingEyebrow}>BODY HACK</Text>
                <TouchableOpacity onPress={() => setCravingVisible(false)} style={styles.cravingDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              </View>
              <Text style={styles.cravingText}>{cravingTip.text}</Text>
            </LinearGradient>
          </View>
        )}

        {/* Scanning loading */}
        {scanning && (
          <View style={styles.scanningRow}>
            <ActivityIndicator size="small" color="#c0392b" />
            <Text style={styles.scanningText}>looking up barcode…</Text>
          </View>
        )}

        {/* Search results */}
        {searching && (
          <View style={styles.scanningRow}>
            <ActivityIndicator size="small" color="#c0392b" />
            <Text style={styles.scanningText}>searching…</Text>
          </View>
        )}

        {searchResults.length > 0 && (
          <View style={styles.resultsList}>
            {searchResults.map((food, i) => (
              <TouchableOpacity
                key={food.id}
                style={[styles.resultRow, i === searchResults.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => selectFood(food)}
              >
                <View style={styles.resultIconBox}>
                  <MaterialCommunityIcons
                    name={food.source === 'Barcode Scan' ? 'barcode' : food.source === 'Open Food Facts' ? 'package-variant' : 'food'}
                    size={18}
                    color="#c0392b"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName} numberOfLines={1}>{food.name}</Text>
                  {food.brand ? <Text style={styles.resultBrand}>{food.brand}</Text> : null}
                  <Text style={styles.resultMeta}>{food.cal} kcal · P {food.protein}g · C {food.carbs}g · F {food.fat}g</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {searchQuery.length > 1 && !searching && searchResults.length === 0 && (
          <View style={styles.noResults}>
            <MaterialCommunityIcons name="magnify-close" size={36} color="rgba(255,255,255,0.2)" />
            <Text style={styles.noResultsText}>No results for &quot;{searchQuery}&quot;</Text>
            <Text style={styles.noResultsSub}>Try scanning the barcode instead</Text>
            <TouchableOpacity style={styles.noResultsScanBtn} onPress={openScanner}>
              <MaterialCommunityIcons name="barcode-scan" size={16} color="#fff" />
              <Text style={styles.noResultsScanText}>Open Scanner</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── AI Mode: Input ── */}
        {aiMode && !aiResult && !selectedFood && (
          <View style={styles.aiInputCard}>
            <View style={styles.aiInputHeader}>
              <View style={styles.aiIconWrap}>
                <MaterialCommunityIcons name="creation" size={20} color="#a855f7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.aiInputTitle}>Describe your meal</Text>
                <Text style={styles.aiInputSub}>AI will estimate calories & macros</Text>
              </View>
              <TouchableOpacity onPress={() => { setAiMode(false); setAiDescription(''); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.aiTextInput}
              placeholder={"e.g., 2 medium rotis, aloo gobi sabzi,\nand a cup of curd"}
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={aiDescription}
              onChangeText={setAiDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!aiLoading}
            />

            <TouchableOpacity
              style={[styles.aiAnalyzeBtn, (!aiDescription.trim() || aiLoading) && { opacity: 0.5 }]}
              onPress={() => analyzeWithAI(aiDescription)}
              disabled={!aiDescription.trim() || aiLoading}
            >
              <LinearGradient colors={['#a855f7', '#7c3aed']} style={styles.saveBtnGrad}>
                {aiLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <MaterialCommunityIcons name="creation" size={18} color="#fff" />
                }
                <Text style={styles.saveBtnText}>
                  {aiLoading ? 'Analyzing your meal\u2026' : '\u2728 Analyze'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* ── AI Mode: Result ── */}
        {aiMode && aiResult && !selectedFood && (
          <Animated.View style={[styles.foodCard, { opacity: cardOpacity, transform: [{ translateY: cardAnim }] }]}>
            <View style={styles.foodCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodCardName}>{aiResult.foodName}</Text>
                <View style={styles.sourceBadgeRow}>
                  <View style={[styles.sourceBadge, { backgroundColor: '#f3e8ff' }]}>
                    <MaterialCommunityIcons name="creation" size={10} color="#a855f7" />
                    <Text style={[styles.sourceBadgeText, { color: '#a855f7' }]}> AI Estimate</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity style={styles.foodCardClose} onPress={() => { setAiResult(null); setAiMode(false); setAiDescription(''); }}>
                <MaterialCommunityIcons name="close" size={20} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>

            {aiResult.breakdown ? (
              <Text style={styles.aiBreakdownText}>{aiResult.breakdown}</Text>
            ) : null}

            <View style={styles.cardDivider} />

            <View style={styles.calorieBlock}>
              <LinearGradient colors={['#0a0202', '#150404']} style={styles.calorieGrad}>
                <View style={styles.calorieMain}>
                  <Text style={styles.calorieNum}>{aiResult.calories}</Text>
                  <Text style={styles.calorieUnit}>kcal</Text>
                </View>
                <View style={styles.macroRow}>
                  <View style={styles.macroCell}>
                    <Text style={[styles.macroVal, { color: '#ff4030' }]}>{aiResult.protein}g</Text>
                    <Text style={styles.macroLbl}>Protein</Text>
                  </View>
                  <View style={styles.macroDivider} />
                  <View style={styles.macroCell}>
                    <Text style={[styles.macroVal, { color: '#f39c12' }]}>{aiResult.carbs}g</Text>
                    <Text style={styles.macroLbl}>Carbs</Text>
                  </View>
                  <View style={styles.macroDivider} />
                  <View style={styles.macroCell}>
                    <Text style={[styles.macroVal, { color: '#3498db' }]}>{aiResult.fat}g</Text>
                    <Text style={styles.macroLbl}>Fat</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleAISave} disabled={saving}>
              <LinearGradient colors={['#a855f7', '#7c3aed']} style={styles.saveBtnGrad}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <MaterialCommunityIcons name="check-bold" size={18} color="#fff" />
                }
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving\u2026' : `Log ${aiResult.calories} kcal to ${mealType}`}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.aiRetryBtn} onPress={() => setAiResult(null)}>
              <MaterialCommunityIcons name="refresh" size={14} color="rgba(255,255,255,0.5)" />
              <Text style={styles.aiRetryText}>Try again with different description</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Selected food card ── */}
        {selectedFood && (
          <Animated.View style={[styles.foodCard, { opacity: cardOpacity, transform: [{ translateY: cardAnim }] }]}>

            {/* Food name + source badge */}
            <View style={styles.foodCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.foodCardName}>{selectedFood.name}</Text>
                {selectedFood.brand ? <Text style={styles.foodCardBrand}>{selectedFood.brand}</Text> : null}
                <View style={styles.sourceBadgeRow}>
                  {selectedFood.source === 'Barcode Scan' && (
                    <View style={[styles.sourceBadge, { backgroundColor: '#e8f5e9' }]}>
                      <MaterialCommunityIcons name="barcode-scan" size={10} color="#27ae60" />
                      <Text style={[styles.sourceBadgeText, { color: '#27ae60' }]}> Barcode verified</Text>
                    </View>
                  )}
                  {selectedFood.source === 'Open Food Facts' && (
                    <View style={[styles.sourceBadge, { backgroundColor: '#e3f2fd' }]}>
                      <MaterialCommunityIcons name="package-variant" size={10} color="#2980b9" />
                      <Text style={[styles.sourceBadgeText, { color: '#2980b9' }]}> Open Food Facts</Text>
                    </View>
                  )}
                  <View style={[styles.sourceBadge, { backgroundColor: '#fce4ec' }]}>
                    <Text style={[styles.sourceBadgeText, { color: '#c0392b' }]}>{mealType}</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedFood(null)} style={styles.foodCardClose}>
                <MaterialCommunityIcons name="close" size={18} color="#aaa" />
              </TouchableOpacity>
            </View>

            <View style={styles.cardDivider} />

            {/* Size selector (fruits) */}
            {selectedFood.unit === 'sizes' && selectedFood.sizes && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>SIZE</Text>
                <View style={styles.sizeRow}>
                  {selectedFood.sizes.map(size => (
                    <TouchableOpacity
                      key={size.label}
                      style={[styles.sizeChip, selectedSize?.label === size.label && styles.sizeChipActive]}
                      onPress={() => setSelectedSize(size)}
                    >
                      <Text style={[styles.sizeChipText, selectedSize?.label === size.label && styles.sizeChipTextActive]}>
                        {size.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Quantity */}
            {!useCustomGrams && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>
                  QUANTITY {selectedFood.unit !== 'sizes' ? `· ${selectedFood.unitLabel}` : ''}
                </Text>
                <View style={styles.qtyRow}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setQuantity(q => Math.max(0.5, q - (q > 1 ? 1 : 0.5)))}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyVal}>{quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setQuantity(q => q + (q >= 1 ? 1 : 0.5))}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyWeight}>{getEffectiveWeight()}g total</Text>
                </View>
              </View>
            )}

            {/* Custom grams */}
            <TouchableOpacity style={styles.customGramsRow} onPress={() => setUseCustomGrams(v => !v)}>
              <MaterialCommunityIcons
                name={useCustomGrams ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={16} color="#ff4030"
              />
              <Text style={styles.customGramsText}>enter exact grams instead</Text>
            </TouchableOpacity>

            {useCustomGrams && (
              <View style={styles.gramsRow}>
                <TextInput
                  style={styles.gramsInput}
                  placeholder="e.g. 85"
                  value={customGrams}
                  onChangeText={setCustomGrams}
                  keyboardType="numeric"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                />
                <Text style={styles.gramsUnit}>g</Text>
              </View>
            )}

            {/* Calorie display */}
            <View style={styles.calorieBlock}>
              <LinearGradient colors={['#0a0202', '#150404']} style={styles.calorieGrad}>
                <View style={styles.calorieMain}>
                  <Text style={styles.calorieNum}>{getCalories()}</Text>
                  <Text style={styles.calorieUnit}>kcal</Text>
                </View>
                <View style={styles.macroRow}>
                  <View style={styles.macroCell}>
                    <Text style={[styles.macroVal, { color: '#ff4030' }]}>{getMacro('protein')}g</Text>
                    <Text style={styles.macroLbl}>Protein</Text>
                  </View>
                  <View style={styles.macroDivider} />
                  <View style={styles.macroCell}>
                    <Text style={[styles.macroVal, { color: '#f39c12' }]}>{getMacro('carbs')}g</Text>
                    <Text style={styles.macroLbl}>Carbs</Text>
                  </View>
                  <View style={styles.macroDivider} />
                  <View style={styles.macroCell}>
                    <Text style={[styles.macroVal, { color: '#3498db' }]}>{getMacro('fat')}g</Text>
                    <Text style={styles.macroLbl}>Fat</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            {/* Save */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              <LinearGradient colors={['#ff4030', '#cc2020']} style={styles.saveBtnGrad}>
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <MaterialCommunityIcons name="check-bold" size={18} color="#fff" />
                }
                <Text style={styles.saveBtnText}>
                  {saving ? 'Saving…' : `Add ${getCalories()} kcal to ${mealType}`}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Quick picks ── */}
        {!searchQuery && !selectedFood && !aiMode && (
          <View style={{ paddingBottom: 40 }}>
            {/* Scan CTA banner */}
            <TouchableOpacity style={styles.scanBanner} onPress={openScanner}>
              <LinearGradient colors={['#0a0202', '#150404']} style={styles.scanBannerGrad}>
                <View style={styles.scanBannerIcon}>
                  <MaterialCommunityIcons name="barcode-scan" size={28} color="#ff4030" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scanBannerTitle}>Scan a barcode</Text>
                  <Text style={styles.scanBannerSub}>Point at any packaged food — Maggi, Amul, Britannia, Lay&apos;s…</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(255,255,255,0.4)" />
              </LinearGradient>
            </TouchableOpacity>

            {/* AI Describe CTA banner */}
            <TouchableOpacity style={styles.aiDescribeBanner} onPress={() => { setAiMode(true); setAiResult(null); setAiDescription(''); }}>
              <LinearGradient colors={['#0a0206', '#120410']} style={styles.scanBannerGrad}>
                <View style={[styles.scanBannerIcon, { backgroundColor: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.25)' }]}>
                  <MaterialCommunityIcons name="creation" size={28} color="#a855f7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scanBannerTitle}>Describe your meal</Text>
                  <Text style={styles.scanBannerSub}>Type what you ate \u2014 AI estimates calories & macros instantly</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(255,255,255,0.4)" />
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.quickTitle}>Common foods</Text>
            <View style={styles.quickGrid}>
              {QUICK_PICKS.map(name => {
                const food = FOOD_DB.find(f => f.name === name);
                if (!food) return null;
                return (
                  <TouchableOpacity key={food.id} style={styles.quickItem} onPress={() => selectFood(food)}>
                    <Text style={styles.quickName}>{food.name}</Text>
                    <Text style={styles.quickCal}>{food.cal} kcal/100g</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sourceNote}>📚 ICMR-NIN · USDA FoodData Central · Open Food Facts · Claude AI</Text>
          </View>
        )}

      </ScrollView>

      <AppAlertDialog {...dialogProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },

  // Header
  header: { paddingTop: 54, paddingBottom: 16, paddingHorizontal: 20 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffe8d0', letterSpacing: 0.2 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 },
  scanBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#ff4030', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#ff4030', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.5, shadowRadius: 8 },
  mealChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', marginRight: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  mealChipActive: { backgroundColor: '#ff4030' },
  mealChipText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  mealChipTextActive: { color: '#000' },

  // Body
  body: { flex: 1, padding: 16 },

  // Search
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(18,5,4,0.92)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: 'rgba(255,60,30,0.15)' },
  searchInput: { flex: 1, fontSize: 14, color: '#ffe8d0', paddingVertical: 9 },
  searchScanBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,60,30,0.1)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,60,30,0.25)' },
  searchScanText: { fontSize: 12, fontWeight: '700', color: '#ff4030' },

  scanningRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  scanningText: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },

  // Results
  resultsList: { backgroundColor: 'rgba(12,3,3,0.88)', borderRadius: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,60,30,0.12)' },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 12 },
  resultIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,60,30,0.1)', justifyContent: 'center', alignItems: 'center' },
  resultName: { fontSize: 14, fontWeight: '700', color: '#ffe8d0', marginBottom: 1 },
  resultBrand: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 },
  resultMeta: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },

  noResults: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  noResultsText: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  noResultsSub: { fontSize: 12, color: 'rgba(255,255,255,0.3)' },
  noResultsScanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ff4030', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 },
  noResultsScanText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Food card
  foodCard: { backgroundColor: 'rgba(12,3,3,0.88)', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,60,30,0.15)' },
  foodCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  foodCardName: { fontSize: 17, fontWeight: '800', color: '#ffe8d0', marginBottom: 2 },
  foodCardBrand: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 },
  sourceBadgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  sourceBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  sourceBadgeText: { fontSize: 10, fontWeight: '700' },
  foodCardClose: { padding: 4 },
  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 16 },

  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.35)', letterSpacing: 1.2, marginBottom: 10 },

  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)' },
  sizeChipActive: { backgroundColor: '#ff4030', borderColor: '#ff4030' },
  sizeChipText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  sizeChipTextActive: { color: '#fff' },

  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  qtyBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#ff4030', justifyContent: 'center', alignItems: 'center' },
  qtyBtnText: { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 26 },
  qtyVal: { fontSize: 24, fontWeight: '800', color: '#ffe8d0', minWidth: 36, textAlign: 'center' },
  qtyWeight: { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginLeft: 4 },

  customGramsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  customGramsText: { fontSize: 12, color: '#ff4030', fontWeight: '600' },
  gramsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  gramsInput: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,60,30,0.4)', borderRadius: 12, padding: 12, fontSize: 18, color: '#ffe8d0', fontWeight: '700', backgroundColor: 'rgba(255,255,255,0.04)' },
  gramsUnit: { fontSize: 16, color: 'rgba(255,255,255,0.45)', fontWeight: '700' },

  calorieBlock: { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  calorieGrad: { padding: 18, alignItems: 'center' },
  calorieMain: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 16 },
  calorieNum: { fontSize: 52, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  calorieUnit: { fontSize: 16, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  macroRow: { flexDirection: 'row', width: '100%', justifyContent: 'center' },
  macroCell: { flex: 1, alignItems: 'center' },
  macroVal: { fontSize: 18, fontWeight: '800' },
  macroLbl: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 3, letterSpacing: 0.5 },
  macroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 2 },

  saveBtn: { borderRadius: 14, overflow: 'hidden' },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },

  // Scan banner
  scanBanner: { borderRadius: 18, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,60,30,0.15)' },
  scanBannerGrad: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 },
  scanBannerIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,60,30,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,60,30,0.25)' },
  scanBannerTitle: { fontSize: 15, fontWeight: '800', color: '#ffe8d0', marginBottom: 3 },
  scanBannerSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 16 },

  quickTitle: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, marginBottom: 12 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  quickItem: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, width: (SW - 52) / 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  quickName: { fontSize: 12, fontWeight: '700', color: '#ffe8d0', marginBottom: 4 },
  quickCal: { fontSize: 11, color: '#ff6b4a', fontWeight: '600' },
  sourceNote: { fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginBottom: 8 },

  // Scanner screen
  scanScreen: { flex: 1, backgroundColor: '#000' },
  scanOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'column' },
  scanDark: { backgroundColor: 'rgba(0,0,0,0.72)', width: '100%' },
  scanCutout: { width: SCANNER_SIZE, height: SCANNER_SIZE, overflow: 'hidden' },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 2.5, backgroundColor: '#ff4030', shadowColor: '#ff4030', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8, elevation: 8 },

  // Corner brackets
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#fff' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3.5, borderLeftWidth: 3.5, borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3.5, borderRightWidth: 3.5, borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3.5, borderLeftWidth: 3.5, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3.5, borderRightWidth: 3.5, borderBottomRightRadius: 6 },

  scanHint: { color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontSize: 14, fontWeight: '600', marginTop: 28 },
  scanHint2: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 12, marginTop: 6 },
  scanCancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 28, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  scanCancelText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },

  // Craving Decoder — dark quasar tint
  cravingCard: { borderRadius: 16, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,60,30,0.12)' },
  cravingGradient: { padding: 14, borderRadius: 16 },
  cravingHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  cravingIconWrap: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,60,30,0.12)', justifyContent: 'center', alignItems: 'center' },
  cravingEyebrow: { flex: 1, fontSize: 10, fontWeight: '900', color: '#ff6b4a', letterSpacing: 1.5 },
  cravingDismiss: { padding: 4 },
  cravingText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 19, fontWeight: '500' },

  // AI Photo Tips Modal
  aiTipOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  aiTipCard: { backgroundColor: 'rgba(12,3,3,0.95)', borderRadius: 24, padding: 24, width: SW - 48, borderWidth: 1, borderColor: 'rgba(255,60,30,0.2)' },
  aiTipHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  aiTipIconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,60,30,0.12)', justifyContent: 'center', alignItems: 'center' },
  aiTipTitle: { fontSize: 17, fontWeight: '800', color: '#ffe8d0' },
  aiTipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12, paddingLeft: 4 },
  aiTipText: { fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 18, flex: 1 },
  aiTipBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ff4030', borderRadius: 14, paddingVertical: 14, marginTop: 8 },
  aiTipBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  aiTipCancel: { alignItems: 'center', paddingVertical: 10, marginTop: 4 },
  aiTipCancelText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },

  offlinePill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 18, marginBottom: 10, backgroundColor: 'rgba(255,136,68,0.08)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,136,68,0.15)', alignSelf: 'flex-start' },
  offlinePillText: { color: '#ff8844', fontSize: 11, fontWeight: '700' },

  // AI Describe styles
  aiDescribeBanner: { borderRadius: 18, overflow: 'hidden', marginBottom: 14, borderWidth: 1, borderColor: 'rgba(168,85,247,0.15)' },
  aiInputCard: { backgroundColor: 'rgba(12,3,3,0.88)', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)' },
  aiInputHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  aiIconWrap: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(168,85,247,0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)' },
  aiInputTitle: { fontSize: 16, fontWeight: '800', color: '#ffe8d0' },
  aiInputSub: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 },
  aiTextInput: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, fontSize: 14, color: '#ffe8d0', minHeight: 80, borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)', marginBottom: 14, lineHeight: 20 },
  aiAnalyzeBtn: { borderRadius: 14, overflow: 'hidden' },
  aiBreakdownText: { fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  aiRetryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 8 },
  aiRetryText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
});
