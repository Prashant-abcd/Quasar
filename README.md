# AdaptCal

AdaptCal is an Expo + Firebase calorie tracking app that builds an adaptive calorie plan from the user's body stats, goal weight, and workout routine.

## Features

- Email sign-up and login with Firebase Auth
- Multi-step onboarding that calculates BMR, TDEE, workout burn, and a daily calorie target
- Dashboard with calorie, macro, and weight-goal progress
- Meal logging with a built-in food database and barcode lookup
- Weight check-ins that automatically recalculate the plan
- Progress screen with weight history and 7-day calorie logging trends

## Tech Stack

- Expo Router
- React Native
- Firebase Authentication
- Cloud Firestore
- Expo Camera
- React Native SVG

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm start
```

3. Open it on Android, iOS, or the web from the Expo menu.

## Project Structure

- `app/`: routes and screens
- `config/`: Firebase setup
- `utils/`: shared helpers
- `assets/`: static assets

## Notes

- Firebase config currently lives in `config/firebaseConfig.js`.
- Meal logs are stored by local calendar day, so daily totals now align with the user's device date instead of UTC boundaries.
