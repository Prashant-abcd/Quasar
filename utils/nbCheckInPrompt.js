export function buildNBCheckInPrompt(exceeded, onConfirm) {
  const answerLabel = exceeded ? 'went over' : 'stayed within';

  return {
    variant: 'info',
    title: 'lock in today\'s check-in?',
    message: exceeded
      ? `we'll log today as "went over" — this helps our system learn your patterns and look out for you on similar days in the future. you can't change this later today.`
      : `nice one 💪 we'll log today as "stayed within" — this helps our system learn when you're most consistent. you can't change this later today.`,
    actions: [
      {
        label: `lock in ${answerLabel}`,
        tone: 'primary',
        onPress: onConfirm,
      },
      {
        label: 'not yet',
        tone: 'secondary',
      },
    ],
  };
}
