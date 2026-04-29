/**
 * Fun Facts Database
 * 60+ curated facts across Food, Workout, Nutrition Science, and Body Hacks.
 * Displayed in the FunFactsScreen when the user is offline.
 */

export const CATEGORIES = [
  { key: 'all', label: 'All', emoji: '✨' },
  { key: 'food', label: 'Food', emoji: '🍎' },
  { key: 'workout', label: 'Workout', emoji: '💪' },
  { key: 'nutrition', label: 'Nutrition', emoji: '🧬' },
  { key: 'body', label: 'Body Hacks', emoji: '🧠' },
];

export const FUN_FACTS = [
  // ── 🍎 FOOD FACTS ──────────────────────────────────────────────────────────
  { category: 'food', emoji: '🍎', title: 'Apples Float', body: 'Apples are 25% air, which is why they float in water. That also means they\'re less calorie-dense than they look — only 52 kcal per 100g.' },
  { category: 'food', emoji: '🍯', title: 'Honey Never Expires', body: 'Archaeologists found 3,000-year-old honey in Egyptian tombs that was still perfectly edible. Honey\'s low moisture and high acidity make it hostile to bacteria.' },
  { category: 'food', emoji: '🫘', title: 'Beans Are Protein Powerhouses', body: 'Black beans have roughly the same protein per calorie as beef. A cup of cooked black beans gives you 15g protein at just 227 calories.' },
  { category: 'food', emoji: '🍌', title: 'Bananas Are Berries', body: 'Botanically, bananas are berries — but strawberries aren\'t. A banana also packs 27g of fast-digesting carbs, making it a near-perfect pre-workout snack.' },
  { category: 'food', emoji: '🥚', title: 'Egg Whites vs Yolks', body: 'The white has 60% of the protein (3.6g) but the yolk contains ALL the fat-soluble vitamins (A, D, E, K) plus choline, which is critical for brain function.' },
  { category: 'food', emoji: '🥦', title: 'Broccoli Has More Protein Than Steak', body: 'Per calorie, broccoli has more protein than steak (11.1g vs 6.4g per 100 kcal). But you\'d need to eat 1.5kg of broccoli to match a 200g steak.' },
  { category: 'food', emoji: '🍫', title: 'Dark Chocolate Is a Superfood', body: 'Dark chocolate (70%+) contains iron, magnesium, and powerful antioxidants called flavanols. 20g daily has been linked to lower blood pressure in clinical studies.' },
  { category: 'food', emoji: '🌶️', title: 'Capsaicin Burns Calories', body: 'The compound that makes chilli peppers spicy — capsaicin — temporarily boosts your metabolic rate by 5-8%. It also reduces appetite by increasing satiety hormones.' },
  { category: 'food', emoji: '🥜', title: 'Peanuts Aren\'t Nuts', body: 'Peanuts are legumes (like lentils and beans). They grow underground and have more protein than any true tree nut — 26g per 100g.' },
  { category: 'food', emoji: '🍚', title: 'Cooling Rice Cuts Calories', body: 'When you cook rice and then cool it, some of the starch converts to "resistant starch" that your body can\'t fully digest. Reheating doesn\'t reverse it. Net result: ~10-15% fewer absorbed calories.' },
  { category: 'food', emoji: '🧀', title: 'Cheese Is Older Than Writing', body: 'Humans have been making cheese for at least 7,500 years — about 2,000 years before the invention of writing. Paneer has been a protein staple in India for millennia.' },
  { category: 'food', emoji: '🥑', title: 'Avocados Are Fatty Fruits', body: 'An avocado gets 77% of its calories from fat — mostly oleic acid, the same heart-healthy fat found in olive oil. One medium avocado has 240 calories.' },
  { category: 'food', emoji: '🍗', title: 'Chicken Breast Is 80% Water', body: 'Raw chicken breast is about 75-80% water by weight. That\'s why a 200g raw breast shrinks to roughly 150g when cooked — and the nutritional info per 100g changes dramatically.' },
  { category: 'food', emoji: '☕', title: 'Coffee Is a Performance Drug', body: 'Caffeine is the most widely consumed psychoactive substance on Earth. 3-6mg/kg body weight (roughly 2 cups) taken 30 min before exercise can improve performance by 3-5%.' },
  { category: 'food', emoji: '🫐', title: 'Blueberries Improve Memory', body: 'Studies show that eating blueberries daily for 12 weeks improved memory performance by 16% in older adults. The anthocyanins boost blood flow to the brain.' },

  // ── 💪 WORKOUT FACTS ────────────────────────────────────────────────────────
  { category: 'workout', emoji: '💪', title: 'Muscle Burns 3x More', body: 'At rest, 1kg of muscle burns about 13 calories per day, while 1kg of fat only burns about 4.5. Building 5kg of muscle increases your resting metabolism by ~40 kcal/day — that compounds to 14,600 kcal/year.' },
  { category: 'workout', emoji: '🏃', title: 'Running Burns After You Stop', body: 'After a high-intensity run, your body continues burning calories for up to 14 hours. This is called EPOC (Excess Post-Exercise Oxygen Consumption) — your metabolism stays elevated to recover.' },
  { category: 'workout', emoji: '🦴', title: 'Bones Get Stronger Too', body: 'Weight-bearing exercise doesn\'t just build muscle — it increases bone density. Astronauts lose 1-2% of bone mass per month in space because their bones have nothing to push against.' },
  { category: 'workout', emoji: '🧊', title: 'Cold Showers Aren\'t Magic', body: 'Cold exposure increases brown fat activity (which burns calories for heat), but the effect is tiny — roughly 15-30 extra calories. The mental discipline benefit is real though.' },
  { category: 'workout', emoji: '😴', title: 'Sleep Is a PED', body: 'Getting less than 6 hours of sleep reduces testosterone by 10-15% and increases cortisol by 37%. Both directly reduce muscle recovery and increase fat storage. Sleep is literally a performance-enhancing drug.' },
  { category: 'workout', emoji: '🫀', title: 'Your Heart Is the Hardest Worker', body: 'Your heart beats ~100,000 times per day, pumping 7,500 liters of blood. It\'s the most metabolically active organ and never takes a rest day — even when you do.' },
  { category: 'workout', emoji: '⏱️', title: 'HIIT vs Steady State', body: 'A 20-min HIIT session can burn as many calories as 40 min of steady-state cardio — but the real benefit is the afterburn effect (EPOC), which elevates your metabolism for hours after.' },
  { category: 'workout', emoji: '🏋️', title: 'Muscle Memory Is Real', body: 'When you build muscle, your cells gain extra nuclei (myonuclei) that never disappear — even after you stop training. This is why regaining lost muscle is much faster than building it the first time.' },
  { category: 'workout', emoji: '🚶', title: '10,000 Steps Is Marketing', body: 'The 10,000 step goal originated from a 1965 Japanese pedometer marketing campaign. Research shows that health benefits plateau around 7,500 steps. Quality of movement matters more than step count.' },
  { category: 'workout', emoji: '💧', title: 'Dehydration Kills Performance', body: 'Losing just 2% of your body weight in water reduces strength by 10% and endurance by 20%. For a 75kg person, that\'s only 1.5 liters of sweat — easily lost in a 45-min session without drinking.' },
  { category: 'workout', emoji: '🧘', title: 'Stretching Doesn\'t Prevent Injury', body: 'Static stretching before exercise actually reduces power output by up to 5%. Dynamic warm-ups (leg swings, arm circles) are more effective at preventing injuries.' },
  { category: 'workout', emoji: '🔥', title: 'Fidgeting Burns 350 kcal/day', body: 'NEAT (Non-Exercise Activity Thermogenesis) — fidgeting, standing, pacing — can vary by up to 2,000 kcal/day between individuals. Some people burn 350+ extra calories just by being restless.' },
  { category: 'workout', emoji: '🎵', title: 'Music Boosts Performance 15%', body: 'Listening to music during exercise can improve endurance by 15% and reduce perceived effort by 12%. The ideal tempo for running is 120-140 BPM.' },
  { category: 'workout', emoji: '📉', title: 'You Lose Strength in 2 Weeks', body: 'Noticeable strength loss begins after just 14 days of inactivity. But thanks to muscle memory (myonuclei), you can regain 4 weeks of lost progress in just 1 week of training.' },
  { category: 'workout', emoji: '🦵', title: 'Legs = Half Your Muscles', body: 'Your lower body contains over 50% of your total muscle mass. Leg workouts trigger the highest testosterone and growth hormone response of any exercise — which benefits your entire body.' },

  // ── 🧬 NUTRITION SCIENCE ────────────────────────────────────────────────────
  { category: 'nutrition', emoji: '🧬', title: 'Your BMR Burns 60-75% of Calories', body: 'Most of your daily calories aren\'t burned during exercise — they\'re burned just keeping you alive. Your brain alone consumes 20% of your BMR (about 400 kcal/day).' },
  { category: 'nutrition', emoji: '🔬', title: 'Protein Has a Thermic Tax', body: 'Your body spends 20-30% of protein calories just digesting it. Eat 100 kcal of chicken and your body uses 25 kcal to process it. Eat 100 kcal of butter and only 2 kcal is spent digesting. This is the Thermic Effect of Food (TEF) that your app tracks.' },
  { category: 'nutrition', emoji: '⚖️', title: '3,500 kcal ≈ 0.45kg of Fat', body: 'To lose roughly 0.45kg (1 lb) of body fat, you need a cumulative deficit of about 3,500 calories. A 500 kcal/day deficit = ~0.45kg/week. This is the math your deficit engine is built on.' },
  { category: 'nutrition', emoji: '🧊', title: 'Cold Water Burns Extra Calories', body: 'Drinking 500ml of ice-cold water forces your body to heat it to 37°C, burning about 17 extra calories. Small — but 8 glasses a day adds up to ~100 kcal/week for free.' },
  { category: 'nutrition', emoji: '🧠', title: 'Your Brain Runs on Glucose', body: 'Your brain consumes ~120g of glucose per day — that\'s nearly half of your total carb intake if you eat 250g/day. This is why extreme low-carb diets cause brain fog before ketone adaptation kicks in.' },
  { category: 'nutrition', emoji: '🫀', title: 'Fiber Feeds Your Gut Army', body: 'Your gut contains 38 trillion bacteria — slightly more than human cells. Dietary fiber is their primary food source. A healthy gut microbiome has been linked to lower body fat and better mood.' },
  { category: 'nutrition', emoji: '💉', title: 'Insulin Is Not the Enemy', body: 'Insulin is often blamed for fat gain, but it\'s simply a storage hormone. It rises after ALL meals — including protein. What matters is total calorie balance, not insulin spikes.' },
  { category: 'nutrition', emoji: '🥩', title: '1.6g/kg Is the Sweet Spot', body: 'Research shows that 1.6g of protein per kg of bodyweight per day maximizes muscle protein synthesis. Going above 2.2g/kg shows diminishing returns in nearly all studies.' },
  { category: 'nutrition', emoji: '🌙', title: 'Nighttime Eating Is Fine', body: 'Your body doesn\'t store more fat at night. Total daily calorie intake matters, not meal timing. Studies on shift workers confirm: a calorie at 10 PM is metabolized identically to one at 10 AM.' },
  { category: 'nutrition', emoji: '🧪', title: 'Vitamins Don\'t Give Energy', body: 'Vitamins don\'t contain calories and can\'t give you energy directly. They act as cofactors — enzymes need them to unlock energy FROM food. A vitamin pill without food does nothing for energy.' },
  { category: 'nutrition', emoji: '🍽️', title: 'Meal Frequency Doesn\'t Matter', body: '6 small meals vs 3 big meals? Research shows identical metabolic rates. "Stoking the metabolic fire" with frequent meals is a myth. Total daily intake is what counts.' },
  { category: 'nutrition', emoji: '🧂', title: 'Salt Isn\'t Always Bad', body: 'Athletes can lose 3-8g of sodium per hour of intense exercise through sweat. Restricting salt too aggressively during a cut can cause fatigue, cramps, and dizziness.' },
  { category: 'nutrition', emoji: '🫗', title: 'Alcohol Has a Hidden 4th Macro', body: 'Alcohol contains 7 kcal/g — almost as much as fat (9 kcal/g). But unlike fat, your body can\'t store alcohol, so it prioritizes burning it first — pausing all fat oxidation until the alcohol is processed.' },
  { category: 'nutrition', emoji: '🥛', title: 'Lactose Intolerance Is the Norm', body: '68% of the world\'s population loses the ability to digest lactose after childhood. Northern European populations are the genetic outliers who retained it.' },
  { category: 'nutrition', emoji: '🌾', title: 'Carbs Don\'t Make You Fat', body: 'No single macro makes you fat — calorie surplus does. Japan has one of the highest carb intakes globally (rice-based diet) and one of the lowest obesity rates.' },

  // ── 🧠 BODY HACKS ──────────────────────────────────────────────────────────
  { category: 'body', emoji: '🧠', title: 'Hunger Comes in Waves', body: 'Hunger isn\'t linear — it peaks and fades in ~20 minute waves. If you ride out a craving for 20 minutes, it often disappears completely. Your body was testing you, not starving.' },
  { category: 'body', emoji: '🍽️', title: 'Smaller Plates = Less Food', body: 'The Delboeuf illusion: food on a smaller plate looks like a bigger portion. Studies show people eat 22% less when using 10-inch plates instead of 12-inch plates.' },
  { category: 'body', emoji: '🪥', title: 'Brush Your Teeth to Kill Cravings', body: 'Brushing your teeth signals "eating is done" to your brain. The mint flavor also makes most foods taste terrible. It\'s a surprisingly effective late-night craving hack.' },
  { category: 'body', emoji: '📱', title: 'Blue Light Increases Hunger', body: 'Screen time before bed suppresses melatonin and increases ghrelin (hunger hormone) the next day by up to 14%. People who use phones in bed eat an average of 200 more calories the next day.' },
  { category: 'body', emoji: '🫁', title: 'You Exhale Your Fat', body: 'When you burn fat, 84% of it leaves your body as CO₂ through your lungs. The other 16% leaves as water (sweat, urine). You literally breathe out your weight loss.' },
  { category: 'body', emoji: '🪞', title: 'Mirror Eating Reduces Intake', body: 'Eating in front of a mirror reduces food consumption by up to 22-32%. Seeing yourself eat makes you more self-aware and mindful of portions.' },
  { category: 'body', emoji: '🧊', title: 'Your Body Fights Weight Loss', body: 'After losing weight, your body reduces leptin (fullness hormone) and increases ghrelin (hunger hormone) for up to 12 months. This is called "metabolic adaptation" — your body literally fights to regain the weight.' },
  { category: 'body', emoji: '😤', title: 'Stress Makes You Store Belly Fat', body: 'Cortisol (stress hormone) specifically promotes visceral fat storage around your midsection. Chronic stress can increase abdominal fat even without a calorie surplus.' },
  { category: 'body', emoji: '🚰', title: 'Thirst Mimics Hunger', body: '37% of people mistake thirst for hunger. The hypothalamus controls both signals and sometimes confuses them. Next time you\'re "hungry" an hour after eating — drink water first and wait 15 minutes.' },
  { category: 'body', emoji: '👃', title: 'Smelling Food Satisfies Cravings', body: 'Research shows that smelling a food for 2+ minutes can partially satisfy the craving without eating it. Your brain gets some of the dopamine reward from the aroma alone.' },
  { category: 'body', emoji: '🎯', title: 'Decision Fatigue Ruins Diets', body: 'The average person makes 200+ food decisions per day. By evening, your willpower is depleted (ego depletion). This is why most binge eating happens after 8 PM — not because of night metabolism.' },
  { category: 'body', emoji: '🤝', title: 'Social Eating Adds 44% More', body: 'Studies show people eat 44% more food when dining with friends vs. alone. It\'s not weakness — it\'s a deeply wired primate behavior. Being aware of it is the first step.' },
  { category: 'body', emoji: '🏷️', title: 'Labels Change How Food Tastes', body: 'In blind taste tests, people rate identical wine as "better" when told it costs $90 vs $10. The same applies to food labels — "organic" and "low-fat" labels make people perceive food as tastier and eat more.' },
  { category: 'body', emoji: '⏰', title: '20 Minutes to Feel Full', body: 'It takes 20 minutes for satiety hormones (CCK, PYY) to reach your brain after eating. Eating slowly and chewing thoroughly can reduce total intake by 15-20% at every single meal.' },
  { category: 'body', emoji: '😴', title: 'Sleep Debt Makes You Eat 385 More', body: 'A single night of poor sleep (< 6 hours) causes you to eat an average of 385 extra calories the next day. Over a week, that\'s 2,695 kcal — almost a full day of food.' },
];

/**
 * Fisher-Yates shuffle — returns a new shuffled array each time.
 */
export function shuffleFacts(facts) {
  const arr = [...facts];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
