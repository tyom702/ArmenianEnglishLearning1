import { ListeningExercise } from '../types';

export function isChoiceListeningExercise(exercise: ListeningExercise): boolean {
  return (
    exercise.type === 'choice' &&
    Array.isArray(exercise.options) &&
    exercise.options.length > 0
  );
}

export function normalizeListeningAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"«»()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateListeningAnswer(
  exercise: ListeningExercise,
  typedInput: string,
  selectedOption: string | null
): boolean {
  if (isChoiceListeningExercise(exercise)) {
    return selectedOption === exercise.missingWord;
  }
  const cleanTyped = normalizeListeningAnswer(typedInput);
  const cleanTarget = normalizeListeningAnswer(exercise.missingWord || exercise.phraseEn);
  return cleanTyped.length > 0 && cleanTyped === cleanTarget;
}
