// ═══════════════════════════════════════════════════════════════════════════
// AdaptCal Injury & Illness Biological Database
// ═══════════════════════════════════════════════════════════════════════════

export const SEVERITY = {
  MILD:    { label: 'Mild',    color: '#81C784', bmrBoost: 1.05, calBoost: 1.10, tag: 'mild' },
  MODERATE:{ label: 'Moderate',color: '#FFB74D', bmrBoost: 1.15, calBoost: 1.20, tag: 'moderate' },
  SERIOUS: { label: 'Serious', color: '#E57373', bmrBoost: 1.30, calBoost: 1.35, tag: 'serious' },
  CRITICAL:{ label: 'Critical',color: '#B71C1C', bmrBoost: 1.50, calBoost: 1.50, tag: 'critical' },
};

// ── Recovery activity data — same structure as onboarding ACTIVITY_DATA ────
// caloriesPerHour: estimated kcal burned per hour of actual activity
// For rest/low-activity options, caloriesPerHour is the TDEE multiplier × BMR equivalent
export const RECOVERY_ACTIVITY_DATA = {
  // ── Recovery-specific (shown first) ────────────────────────────────────
  'Complete Bed Rest': {
    iconName: 'bed', color: '#6B7280',
    desc: 'Total rest, minimal movement',
    caloriesPerHour: 65,   // ~sedentary BMR/24h equivalent
    hasSubOptions: false,
    recoveryOnly: true,
    metValue: 1.0,
  },
  'Seated / Minimal Activity': {
    iconName: 'sofa', color: '#9CA3AF',
    desc: 'Sitting, reading, screen time',
    caloriesPerHour: 80,
    hasSubOptions: false,
    recoveryOnly: true,
    metValue: 1.2,
  },
  'Light Household Tasks': {
    iconName: 'home-heart', color: '#059669',
    desc: 'Cooking, dishes, gentle tidying',
    caloriesPerHour: 140,
    hasSubOptions: false,
    recoveryOnly: true,
    metValue: 1.4,
  },
  'Crutching / Mobility Aid': {
    iconName: 'human-cane', color: '#D97706',
    desc: 'Moving on crutches — burns 2-3× walking',
    caloriesPerHour: 280,
    hasSubOptions: false,
    recoveryOnly: true,
    metValue: 1.7,
  },
  'Slow Indoor Walking': {
    iconName: 'walk', color: '#0D9488',
    desc: 'Short gentle walks indoors',
    caloriesPerHour: 180,
    hasSubOptions: false,
    recoveryOnly: true,
    metValue: 1.5,
  },
  'Normal Daily Life (No Workouts)': {
    iconName: 'briefcase-outline', color: '#7C3AED',
    desc: 'Work, errands, daily tasks only',
    caloriesPerHour: 200,
    hasSubOptions: false,
    recoveryOnly: true,
    metValue: 1.6,
  },
  'Chair Yoga / Gentle Stretching': {
    iconName: 'yoga', color: '#8B5CF6',
    desc: 'Seated or supported flexibility work',
    caloriesPerHour: 120,
    hasSubOptions: false,
    recoveryOnly: true,
    metValue: 1.5,
  },
  'Upper Body Only': {
    iconName: 'arm-flex-outline', color: '#2563EB',
    desc: 'Weights, bands — lower body injured',
    caloriesPerHour: 300,
    hasSubOptions: false,
    recoveryOnly: true,
    metValue: 1.8,
  },
  'Lower Body Only': {
    iconName: 'run', color: '#16A34A',
    desc: 'Leg press, walking — upper body injured',
    caloriesPerHour: 280,
    hasSubOptions: false,
    recoveryOnly: true,
    metValue: 1.8,
  },

  // ── Standard activities (from onboarding) ──────────────────────────────
  Weightlifting: {
    iconName: 'weight-lifter', color: '#c0392b',
    desc: 'Strength & muscle building',
    caloriesPerHour: 400,
    hasSubOptions: false,
    recoveryOnly: false,
    metValue: 3.5,
  },
  Running: {
    iconName: 'run-fast', color: '#e67e22',
    desc: 'Outdoor or treadmill',
    caloriesPerHour: 600,
    hasSubOptions: false,
    recoveryOnly: false,
    metValue: 7.0,
  },
  Walking: {
    iconName: 'walk', color: '#27ae60',
    desc: 'Casual or brisk walking',
    caloriesPerHour: 280,
    hasSubOptions: false,
    recoveryOnly: false,
    metValue: 3.5,
  },
  Cycling: {
    iconName: 'bike', color: '#2980b9',
    desc: 'Road, mountain or stationary',
    caloriesPerHour: 500,
    hasSubOptions: false,
    recoveryOnly: false,
    metValue: 6.0,
  },
  Yoga: {
    iconName: 'yoga', color: '#8e44ad',
    desc: 'Flexibility & mindfulness',
    caloriesPerHour: 250,
    hasSubOptions: false,
    recoveryOnly: false,
    metValue: 3.0,
  },
  HIIT: {
    iconName: 'fire', color: '#e74c3c',
    desc: 'High intensity intervals',
    caloriesPerHour: 650,
    hasSubOptions: false,
    recoveryOnly: false,
    metValue: 8.0,
  },
  Swimming: {
    iconName: 'swim', color: '#0891B2',
    desc: 'Low-impact, joint-friendly',
    caloriesPerHour: 500,
    hasSubOptions: false,
    recoveryOnly: false,
    metValue: 6.0,
  },
  Sports: {
    iconName: 'trophy-outline', color: '#16a085',
    desc: 'Pick your sport below',
    caloriesPerHour: 0,
    hasSubOptions: true,
    recoveryOnly: false,
    metValue: 6.0,
    subOptions: [
      { name: 'Football/Soccer', iconName: 'soccer',        caloriesPerHour: 600 },
      { name: 'Basketball',      iconName: 'basketball',    caloriesPerHour: 550 },
      { name: 'Boxing',          iconName: 'boxing-glove',  caloriesPerHour: 700 },
      { name: 'Tennis',          iconName: 'tennis',        caloriesPerHour: 450 },
      { name: 'Cricket',         iconName: 'cricket',       caloriesPerHour: 350 },
      { name: 'Badminton',       iconName: 'badminton',     caloriesPerHour: 400 },
      { name: 'Volleyball',      iconName: 'volleyball',    caloriesPerHour: 350 },
    ],
  },
};

// ── Weekly burn calculator matching onboarding logic ──────────────────────
export const calcWeeklyBurn = (actName, settings) => {
  const actData = RECOVERY_ACTIVITY_DATA[actName];
  if (!actData) return 0;
  let cph = actData.caloriesPerHour;
  if (actData.hasSubOptions && settings?.selectedSport) {
    const sport = actData.subOptions?.find(s => s.name === settings.selectedSport);
    if (sport) cph = sport.caloriesPerHour;
  }
  const days  = settings?.daysPerWeek  ?? (actData.recoveryOnly ? 7 : 3);
  const hours = settings?.hoursPerDay  ?? 1;
  return Math.round(cph * days * hours);
};

// ── Total weekly burn across all selected activities ──────────────────────
export const calcTotalWeeklyBurn = (activitySettings) => {
  return Object.entries(activitySettings || {}).reduce((total, [name, settings]) => {
    return total + calcWeeklyBurn(name, settings);
  }, 0);
};

// ── TDEE for injury mode ──────────────────────────────────────────────────
export const calcInjuryTDEE = (injuryBmr, activitySettings) => {
  const weeklyBurn = calcTotalWeeklyBurn(activitySettings);
  const dailyBurn  = Math.round(weeklyBurn / 7);
  // Base: sedentary (1.0 × BMR) + daily burn from activities
  return Math.round(injuryBmr + dailyBurn);
};

export const calcMacros = (totalCalories, proteinPct, carbsPct, fatPct) => ({
  protein: Math.round((totalCalories * proteinPct / 100) / 4),
  carbs:   Math.round((totalCalories * carbsPct  / 100) / 4),
  fat:     Math.round((totalCalories * fatPct    / 100) / 9),
});

// ── Condition database ─────────────────────────────────────────────────────
export const CONDITIONS = {
  fever_low: {
    label: 'Low-grade Fever (37.5–38.5°C)', category: 'Fever & Infection',
    severity: 'MILD', bmrMultiplier: 1.10,
    protein: 20, carbs: 55, fat: 25,
    healingNotes: 'Hydration is critical. Easy-digest carbs for energy. Moderate protein to support immunity.',
    warmMessage: "A low fever means your body is working hard to protect you 💪 Rest, hydrate, and eat — your immune system is doing its job.",
    defaultActivity: 'Seated / Minimal Activity',
  },
  fever_high: {
    label: 'High Fever (>38.5°C)', category: 'Fever & Infection',
    severity: 'MODERATE', bmrMultiplier: 1.25,
    protein: 22, carbs: 53, fat: 25,
    healingNotes: 'BMR rises ~13% per 1°C above normal. High protein to prevent muscle breakdown. Electrolytes critical.',
    warmMessage: "High fevers are rough — we see you 🌡️ Your body is fighting hard. Focus on fluids and small frequent meals. You'll get through this.",
    defaultActivity: 'Complete Bed Rest',
  },
  flu_influenza: {
    label: 'Flu / Influenza', category: 'Fever & Infection',
    severity: 'MODERATE', bmrMultiplier: 1.20,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'Protein critical to support immune cell production. Anti-inflammatory fats helpful. Avoid sugar.',
    warmMessage: "Flu is genuinely awful and we know it 🤒 Please rest completely. Your only job right now is to hydrate and eat what you can.",
    defaultActivity: 'Complete Bed Rest',
  },
  common_cold: {
    label: 'Common Cold', category: 'Fever & Infection',
    severity: 'MILD', bmrMultiplier: 1.08,
    protein: 20, carbs: 55, fat: 25,
    healingNotes: 'Vitamin C rich foods. Zinc for immune support. Warm broths and fluids.',
    warmMessage: "Even a cold deserves rest 😌 Don't push yourself. A few slow days now means a much faster recovery.",
    defaultActivity: 'Seated / Minimal Activity',
  },
  covid: {
    label: 'COVID-19', category: 'Fever & Infection',
    severity: 'MODERATE', bmrMultiplier: 1.25,
    protein: 28, carbs: 47, fat: 25,
    healingNotes: 'High protein to counter muscle wasting. Omega-3s for inflammation. Vitamin D critical.',
    warmMessage: "COVID recovery can be unpredictable — please be patient with yourself 🌿 Rest is the workout right now. Your progress will be waiting for you.",
    defaultActivity: 'Complete Bed Rest',
  },
  dengue: {
    label: 'Dengue Fever', category: 'Fever & Infection',
    severity: 'SERIOUS', bmrMultiplier: 1.35,
    protein: 22, carbs: 53, fat: 25,
    healingNotes: 'High fluid intake. Easily digestible foods. No NSAIDs. Papaya leaf extract may help platelet count.',
    warmMessage: "Dengue is serious and we want you to prioritise recovery above everything else 🏥 Please follow your doctor's advice.",
    defaultActivity: 'Complete Bed Rest',
  },
  typhoid: {
    label: 'Typhoid', category: 'Fever & Infection',
    severity: 'SERIOUS', bmrMultiplier: 1.30,
    protein: 20, carbs: 55, fat: 25,
    healingNotes: 'Soft easily digested foods only. High carb to fuel prolonged fever. Low fibre initially.',
    warmMessage: "Typhoid recovery takes time and that's completely okay 🙏 Small meals, lots of rest, and you will get through this.",
    defaultActivity: 'Complete Bed Rest',
  },
  gastroenteritis: {
    label: 'Gastroenteritis / Food Poisoning', category: 'Fever & Infection',
    severity: 'MILD', bmrMultiplier: 1.10,
    protein: 18, carbs: 60, fat: 22,
    healingNotes: 'BRAT diet initially. Electrolyte replacement critical. Reintroduce protein gradually.',
    warmMessage: "Stomach bugs are miserable but short-lived 🥲 Start with small sips and bland food. You'll be back to normal soon.",
    defaultActivity: 'Complete Bed Rest',
  },
  uti: {
    label: 'UTI / Kidney Infection', category: 'Fever & Infection',
    severity: 'MILD', bmrMultiplier: 1.08,
    protein: 20, carbs: 55, fat: 25,
    healingNotes: 'High fluid intake. Continue normal diet unless fever present. Cranberry products may help.',
    warmMessage: "UTIs are uncomfortable but very treatable 🌸 Stay hydrated and take your antibiotics. You've got this.",
    defaultActivity: 'Normal Daily Life (No Workouts)',
  },
  malaria: {
    label: 'Malaria', category: 'Fever & Infection',
    severity: 'SERIOUS', bmrMultiplier: 1.40,
    protein: 22, carbs: 53, fat: 25,
    healingNotes: 'During fever spikes BMR can rise 33%. Iron-rich foods for anemia recovery. High calorie density.',
    warmMessage: "Malaria is one of those things you just have to ride out with proper care 💙 Your health comes first — everything else waits.",
    defaultActivity: 'Complete Bed Rest',
  },
  pneumonia: {
    label: 'Pneumonia', category: 'Fever & Infection',
    severity: 'SERIOUS', bmrMultiplier: 1.35,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'High protein for immune function and muscle preservation during extended bedrest.',
    warmMessage: "Pneumonia takes real recovery time — weeks sometimes. That's not failure, that's biology 🫁 Be gentle with yourself.",
    defaultActivity: 'Complete Bed Rest',
  },

  fracture_stress: {
    label: 'Stress Fracture', category: 'Bone Fractures',
    severity: 'MILD', bmrMultiplier: 1.10,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'Calcium 1500mg/day. Vitamin D 1000-4000 IU. Collagen synthesis needs vitamin C. Protein 1.5g/kg.',
    warmMessage: "Stress fractures happen to dedicated athletes — they're a sign you pushed hard 🦴 Rest now, come back stronger.",
    defaultActivity: 'Seated / Minimal Activity',
  },
  fracture_foot_toe: {
    label: 'Foot / Toe Fracture', category: 'Bone Fractures',
    severity: 'MILD', bmrMultiplier: 1.12,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'Calcium + Vitamin D critical. Upper body exercise often possible. Crutching increases energy 2-3×.',
    warmMessage: "Foot fractures are annoying but very healable 🦶 You can still train upper body. Let's work with what you've got.",
    defaultActivity: 'Crutching / Mobility Aid',
  },
  fracture_ankle: {
    label: 'Ankle Fracture', category: 'Bone Fractures',
    severity: 'MODERATE', bmrMultiplier: 1.15,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'Protein 1.5-2g/kg for bone matrix repair. Anti-inflammatory omega-3s. Calcium and D3 essential.',
    warmMessage: "Ankle fractures need patience but heal beautifully with the right nutrition 🦵 Upper body is fair game.",
    defaultActivity: 'Crutching / Mobility Aid',
  },
  fracture_tibia_fibula: {
    label: 'Tibia / Fibula Fracture', category: 'Bone Fractures',
    severity: 'MODERATE', bmrMultiplier: 1.18,
    protein: 28, carbs: 47, fat: 25,
    healingNotes: 'Major bone fractures need higher protein. Leucine supplementation supports bone callus formation.',
    warmMessage: "This is a big one, and you're handling it 💪 Focus on eating well — your body is rebuilding bone right now.",
    defaultActivity: 'Crutching / Mobility Aid',
  },
  fracture_femur: {
    label: 'Femur Fracture', category: 'Bone Fractures',
    severity: 'SERIOUS', bmrMultiplier: 1.30,
    protein: 30, carbs: 45, fat: 25,
    healingNotes: 'BMR increases 15-20% post-surgery. Very high protein. 25-30 kcal/kg minimum.',
    warmMessage: "Femur fractures are serious injuries and your recovery timeline is real 🏥 Nutrition is your most powerful tool right now.",
    defaultActivity: 'Complete Bed Rest',
  },
  fracture_wrist: {
    label: 'Wrist / Radius Fracture', category: 'Bone Fractures',
    severity: 'MILD', bmrMultiplier: 1.10,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'Calcium and D critical. Lower body exercise often fully possible.',
    warmMessage: "Wrist fractures don't have to stop you completely 💪 Legs are free — walking, cycling, lower body work is available.",
    defaultActivity: 'Lower Body Only',
  },
  fracture_hand_finger: {
    label: 'Hand / Finger Fracture', category: 'Bone Fractures',
    severity: 'MILD', bmrMultiplier: 1.08,
    protein: 22, carbs: 53, fat: 25,
    healingNotes: 'Collagen synthesis needs vitamin C. Most daily and fitness activities possible with care.',
    warmMessage: "Finger fractures are small injuries with big inconveniences 😄 Most of your workout is still accessible.",
    defaultActivity: 'Normal Daily Life (No Workouts)',
  },
  fracture_rib: {
    label: 'Rib Fracture', category: 'Bone Fractures',
    severity: 'MODERATE', bmrMultiplier: 1.15,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'Deep breathing exercises critical to prevent pneumonia. High protein. Avoid lying flat if possible.',
    warmMessage: "Rib fractures make everything uncomfortable — even breathing. That's temporary 🌬️ Small frequent meals are easiest.",
    defaultActivity: 'Seated / Minimal Activity',
  },
  fracture_clavicle: {
    label: 'Collarbone (Clavicle) Fracture', category: 'Bone Fractures',
    severity: 'MODERATE', bmrMultiplier: 1.12,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'Sling limits upper body. Lower body and cardio often maintained. Protein for bone healing.',
    warmMessage: "Clavicle fractures heal well — usually 6-8 weeks 🦴 Your legs are yours. Walking, squats, cycling — let's use them.",
    defaultActivity: 'Lower Body Only',
  },
  fracture_vertebra: {
    label: 'Vertebral / Spinal Fracture', category: 'Bone Fractures',
    severity: 'CRITICAL', bmrMultiplier: 1.35,
    protein: 30, carbs: 45, fat: 25,
    healingNotes: 'High calorie, high protein. Vitamin D3 + K2 for bone matrix. Constipation from immobility common — fibre critical.',
    warmMessage: "A spinal fracture is a major event — rest is the most productive thing you can do 🌿 You are not falling behind. You are healing.",
    defaultActivity: 'Complete Bed Rest',
  },
  fracture_pelvis: {
    label: 'Pelvic Fracture', category: 'Bone Fractures',
    severity: 'SERIOUS', bmrMultiplier: 1.30,
    protein: 28, carbs: 47, fat: 25,
    healingNotes: 'Major trauma — high calorie and protein needs. Iron if blood loss occurred.',
    warmMessage: "Pelvic fractures take real time and real rest — and that is completely valid 💙 Nutrition is your most active form of healing.",
    defaultActivity: 'Complete Bed Rest',
  },

  sprain_ankle_mild: {
    label: 'Ankle Sprain (Grade 1 — Mild)', category: 'Sprains & Strains',
    severity: 'MILD', bmrMultiplier: 1.05,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'Anti-inflammatory omega-3s for first week. Vitamin C for collagen. Upper body and core training possible.',
    warmMessage: "Ankle sprains are super common — Grade 1 means you'll be back soon 😄 Stay active where you can.",
    defaultActivity: 'Upper Body Only',
  },
  sprain_ankle_severe: {
    label: 'Ankle Sprain (Grade 2–3 — Severe)', category: 'Sprains & Strains',
    severity: 'MODERATE', bmrMultiplier: 1.12,
    protein: 28, carbs: 47, fat: 25,
    healingNotes: 'Grade 3 may involve ligament tear. High protein. Collagen peptides support ligament healing.',
    warmMessage: "Severe sprains can be as painful as fractures — your pain is real 💙 Upper body training is fully available.",
    defaultActivity: 'Upper Body Only',
  },
  sprain_knee: {
    label: 'Knee Sprain / Ligament Strain', category: 'Sprains & Strains',
    severity: 'MODERATE', bmrMultiplier: 1.12,
    protein: 28, carbs: 47, fat: 25,
    healingNotes: 'MCL sprains heal well. Protein 1.5-2g/kg. Omega-3s reduce inflammation. Swimming often possible.',
    warmMessage: "Knee sprains are frustrating but very manageable 🦵 Upper body is yours, and pool work may be an option.",
    defaultActivity: 'Upper Body Only',
  },
  acl_tear: {
    label: 'ACL Tear / Reconstruction', category: 'Sprains & Strains',
    severity: 'SERIOUS', bmrMultiplier: 1.20,
    protein: 30, carbs: 45, fat: 25,
    healingNotes: 'ACL reconstruction BMR +15-20%. High protein (2g/kg) to prevent quad atrophy. Leucine critical.',
    warmMessage: "ACL tears are one of the hardest sports injuries emotionally 💚 The recovery journey is long but every single step counts.",
    defaultActivity: 'Upper Body Only',
  },
  meniscus_tear: {
    label: 'Meniscus Tear', category: 'Sprains & Strains',
    severity: 'MODERATE', bmrMultiplier: 1.15,
    protein: 28, carbs: 47, fat: 25,
    healingNotes: 'Post-surgery: protein 2g/kg. Collagen peptides + vitamin C for cartilage. Cycling often cleared early.',
    warmMessage: "Meniscus injuries are tricky but very treatable 🏊 Cycling and swimming are often your best friends during recovery.",
    defaultActivity: 'Upper Body Only',
  },
  rotator_cuff_tear: {
    label: 'Rotator Cuff Tear', category: 'Sprains & Strains',
    severity: 'MODERATE', bmrMultiplier: 1.15,
    protein: 30, carbs: 45, fat: 25,
    healingNotes: 'Shoulder surgery: high protein 2g/kg. Omega-3s critical for tendon healing. Lower body usually maintained.',
    warmMessage: "Rotator cuff tears are more common than you think — you're in good company 💪 Your legs are free.",
    defaultActivity: 'Lower Body Only',
  },
  tendinitis: {
    label: 'Tendinitis / Tendinopathy', category: 'Sprains & Strains',
    severity: 'MILD', bmrMultiplier: 1.05,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'Collagen peptides + vitamin C for tendon repair. Reduce inflammatory foods.',
    warmMessage: "Tendinitis is your body asking for a reset 🎯 Modify around it, not through it.",
    defaultActivity: 'Normal Daily Life (No Workouts)',
  },
  muscle_strain_mild: {
    label: 'Muscle Strain (Grade 1)', category: 'Sprains & Strains',
    severity: 'MILD', bmrMultiplier: 1.08,
    protein: 28, carbs: 47, fat: 25,
    healingNotes: 'High protein to repair torn fibres. Creatine may help retention. Full recovery often 1-2 weeks.',
    warmMessage: "Grade 1 muscle strains recover fast with the right nutrition 💪 Protein is your best friend right now.",
    defaultActivity: 'Normal Daily Life (No Workouts)',
  },
  muscle_strain_severe: {
    label: 'Muscle Strain (Grade 2–3)', category: 'Sprains & Strains',
    severity: 'MODERATE', bmrMultiplier: 1.15,
    protein: 30, carbs: 45, fat: 25,
    healingNotes: 'Grade 3 (complete tear) may need surgery. Very high protein. Anti-inflammatory phase first 72hrs critical.',
    warmMessage: "Severe muscle strains hurt badly and that's valid 🌿 Rest the muscle, fuel the body. Recovery is the training.",
    defaultActivity: 'Seated / Minimal Activity',
  },
  hamstring_tear: {
    label: 'Hamstring Tear', category: 'Sprains & Strains',
    severity: 'MODERATE', bmrMultiplier: 1.15,
    protein: 30, carbs: 45, fat: 25,
    healingNotes: 'Protein 2g/kg. Upper body training usually fully available. Swimming often cleared.',
    warmMessage: "Hamstring tears are one of the most common sports injuries — you're not alone 💙 Upper body is free.",
    defaultActivity: 'Upper Body Only',
  },
  plantar_fasciitis: {
    label: 'Plantar Fasciitis', category: 'Sprains & Strains',
    severity: 'MILD', bmrMultiplier: 1.03,
    protein: 22, carbs: 53, fat: 25,
    healingNotes: 'Anti-inflammatory omega-3s. Collagen peptides helpful. Cycling and swimming are low-impact alternatives.',
    warmMessage: "Plantar fasciitis is chronic but manageable 🦶 The bike and pool are your best friends.",
    defaultActivity: 'Seated / Minimal Activity',
  },
  shin_splints: {
    label: 'Shin Splints (MTSS)', category: 'Sprains & Strains',
    severity: 'MILD', bmrMultiplier: 1.05,
    protein: 22, carbs: 53, fat: 25,
    healingNotes: 'Rest from running. Cycling and swimming fine. Calcium, vitamin D, protein to prevent stress fracture.',
    warmMessage: "Shin splints are your legs saying 'slow down' 🏃 Cross-training keeps you fit while they heal.",
    defaultActivity: 'Upper Body Only',
  },

  surgery_minor: {
    label: 'Minor Surgery (laparoscopic, arthroscopic)', category: 'Surgery & Post-Op',
    severity: 'MODERATE', bmrMultiplier: 1.20,
    protein: 28, carbs: 47, fat: 25,
    healingNotes: 'Surgery BMR +15-20%. Protein 2g/kg to prevent muscle wasting. Probiotics after antibiotics.',
    warmMessage: "Post-surgery is a full-time job and your only job is healing 🌿 Eat, rest, repeat.",
    defaultActivity: 'Seated / Minimal Activity',
  },
  surgery_major: {
    label: 'Major Surgery (abdominal, thoracic, joint)', category: 'Surgery & Post-Op',
    severity: 'SERIOUS', bmrMultiplier: 1.35,
    protein: 30, carbs: 45, fat: 25,
    healingNotes: 'Major surgery: BMR +20-35%. 25-30 kcal/kg minimum. Very high protein.',
    warmMessage: "Major surgery is a big deal and your body knows it 💙 Nutrition is your most powerful recovery tool.",
    defaultActivity: 'Complete Bed Rest',
  },
  surgery_knee_replacement: {
    label: 'Knee Replacement', category: 'Surgery & Post-Op',
    severity: 'SERIOUS', bmrMultiplier: 1.25,
    protein: 30, carbs: 45, fat: 25,
    healingNotes: 'Muscle loss 1% per day post knee surgery. High protein + creatine critical.',
    warmMessage: "Knee replacement recovery is a marathon, not a sprint 🏆 Protein at every meal. Walk when you can.",
    defaultActivity: 'Crutching / Mobility Aid',
  },

  concussion: {
    label: 'Concussion / TBI (Mild)', category: 'Head & Neurological',
    severity: 'MODERATE', bmrMultiplier: 1.15,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'Brain uses glucose primarily — adequate carbs critical. DHA omega-3 (2-3g/day) supports neural repair.',
    warmMessage: "Concussion recovery is invisible to others but very real 🧠 Everything needs to slow down. Your brain needs this rest.",
    defaultActivity: 'Complete Bed Rest',
  },
  migraine_cluster: {
    label: 'Severe Migraine / Cluster Headache', category: 'Head & Neurological',
    severity: 'MILD', bmrMultiplier: 1.08,
    protein: 20, carbs: 55, fat: 25,
    healingNotes: 'Magnesium-rich foods. Stable blood sugar (regular meals). Hydration critical.',
    warmMessage: "Migraines are debilitating — your experience is valid and not 'just a headache' 🌿",
    defaultActivity: 'Complete Bed Rest',
  },

  asthma_flare: {
    label: 'Asthma Flare / Bronchitis', category: 'Respiratory',
    severity: 'MILD', bmrMultiplier: 1.12,
    protein: 22, carbs: 53, fat: 25,
    healingNotes: 'Anti-inflammatory diet. Magnesium-rich foods support bronchodilation.',
    warmMessage: "Respiratory flare-ups are exhausting even when you look fine 😮‍💨 Rest and anti-inflammatory foods are your tools.",
    defaultActivity: 'Seated / Minimal Activity',
  },

  ibs_flare: {
    label: "IBS / Crohn's Flare", category: 'Digestive',
    severity: 'MILD', bmrMultiplier: 1.10,
    protein: 22, carbs: 53, fat: 25,
    healingNotes: 'Low-FODMAP during flare. Easily digestible proteins. Avoid raw vegetables initially.',
    warmMessage: "IBS flares are exhausting and often invisible to others 💙 Gentle foods, small portions, and patience.",
    defaultActivity: 'Seated / Minimal Activity',
  },

  burn_minor: {
    label: 'Minor Burn (1st / 2nd degree, small area)', category: 'Skin & Wound',
    severity: 'MODERATE', bmrMultiplier: 1.20,
    protein: 30, carbs: 45, fat: 25,
    healingNotes: 'Burns dramatically increase protein needs. Zinc and vitamin C critical. Calories 20% above baseline.',
    warmMessage: "Burns heal with proper care and excellent nutrition 🌿 Your body is rebuilding skin — it needs fuel.",
    defaultActivity: 'Normal Daily Life (No Workouts)',
  },
  burn_major: {
    label: 'Major Burn (3rd degree / large area)', category: 'Skin & Wound',
    severity: 'CRITICAL', bmrMultiplier: 1.50,
    protein: 35, carbs: 40, fat: 25,
    healingNotes: 'Major burns: BMR increases up to 50%. Extremely high protein (2.5-3g/kg). Aggressive calorie support critical.',
    warmMessage: "Major burns require intensive care and intensive nutrition 💙 Every meal is actively helping your body rebuild.",
    defaultActivity: 'Complete Bed Rest',
  },
  wound_post_surgery: {
    label: 'Post-Surgical Wound / Laceration', category: 'Skin & Wound',
    severity: 'MILD', bmrMultiplier: 1.10,
    protein: 28, carbs: 47, fat: 25,
    healingNotes: 'Vitamin C 500mg for collagen. Zinc for wound healing. Protein 1.5-2g/kg. Avoid alcohol.',
    warmMessage: "Wounds heal from the inside out — what you eat matters as much as the dressing 🌿",
    defaultActivity: 'Normal Daily Life (No Workouts)',
  },

  back_pain_acute: {
    label: 'Acute Lower Back Pain / Disc Issue', category: 'Back & Spine',
    severity: 'MILD', bmrMultiplier: 1.08,
    protein: 25, carbs: 50, fat: 25,
    healingNotes: 'Anti-inflammatory omega-3s. Magnesium for muscle relaxation. Gentle movement usually better than full rest.',
    warmMessage: "Back pain affects millions — you're not weak for struggling with it 🌿 Gentle movement when possible is usually better.",
    defaultActivity: 'Seated / Minimal Activity',
  },
  sciatica: {
    label: 'Sciatica / Nerve Pain', category: 'Back & Spine',
    severity: 'MILD', bmrMultiplier: 1.08,
    protein: 22, carbs: 53, fat: 25,
    healingNotes: 'B vitamins for nerve repair. Anti-inflammatory diet. Swimming often best option.',
    warmMessage: "Sciatica pain can be intense and exhausting 😔 Swimming and gentle walking are your allies.",
    defaultActivity: 'Seated / Minimal Activity',
  },

  anxiety_depression: {
    label: 'Anxiety / Depression Episode', category: 'Mental Health',
    severity: 'MILD', bmrMultiplier: 1.05,
    protein: 22, carbs: 53, fat: 25,
    healingNotes: 'Omega-3 DHA for brain health. Tryptophan-rich foods for serotonin. Magnesium for anxiety.',
    warmMessage: "Mental health days are real recovery days 💙 You haven't fallen off — you're taking care of the most important system.",
    defaultActivity: 'Normal Daily Life (No Workouts)',
  },

  diabetes_management: {
    label: 'Diabetes (Type 2) Management', category: 'Chronic Conditions',
    severity: 'MILD', bmrMultiplier: 1.05,
    protein: 25, carbs: 40, fat: 35,
    healingNotes: 'Lower carb, higher fat and protein to manage blood glucose. Fibre critical. Regular meal timing.',
    warmMessage: "Managing diabetes alongside fitness goals takes real skill 🎯 Lower-carb eating works in your favour here.",
    defaultActivity: 'Normal Daily Life (No Workouts)',
  },
  hypertension: {
    label: 'Hypertension / High Blood Pressure', category: 'Chronic Conditions',
    severity: 'MILD', bmrMultiplier: 1.03,
    protein: 20, carbs: 55, fat: 25,
    healingNotes: 'DASH diet principles. Low sodium. High potassium. Magnesium. Regular moderate exercise beneficial.',
    warmMessage: "Managing blood pressure through lifestyle is powerful medicine 💚 You have more control than you think.",
    defaultActivity: 'Normal Daily Life (No Workouts)',
  },
  anaemia: {
    label: 'Iron-deficiency Anaemia', category: 'Chronic Conditions',
    severity: 'MILD', bmrMultiplier: 1.08,
    protein: 22, carbs: 53, fat: 25,
    healingNotes: 'Iron-rich foods + vitamin C for absorption. Avoid calcium and tea with iron-rich meals.',
    warmMessage: "Anaemia fatigue is real and often underestimated 🍃 Iron + vitamin C is the combo. The right foods make a genuine difference.",
    defaultActivity: 'Normal Daily Life (No Workouts)',
  },
};

export const CONDITION_CATEGORIES = [
  'Fever & Infection',
  'Bone Fractures',
  'Sprains & Strains',
  'Surgery & Post-Op',
  'Head & Neurological',
  'Respiratory',
  'Digestive',
  'Skin & Wound',
  'Back & Spine',
  'Mental Health',
  'Chronic Conditions',
];
