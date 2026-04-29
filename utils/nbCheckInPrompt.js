export function buildNBCheckInPrompt(exceeded, onConfirm) {
  const answerLabel = exceeded ? 'went over' : 'stayed within';

  return {
    variant: 'info',
    title: 'quick warrior heads-up',
    message: `if we lock "${answerLabel}" for today, your protein streak stays safe. tiny catch: even if you smash your protein goal later, today's warrior score won't increase. streak protected, points paused. still wanna submit it?`,
    actions: [
      {
        label: `lock in ${answerLabel}`,
        tone: 'primary',
        onPress: onConfirm,
      },
      {
        label: 'lemme log protein first',
        tone: 'secondary',
      },
    ],
  };
}
