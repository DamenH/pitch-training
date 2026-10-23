export type IdentifyMode = 'notes' | 'octaves';

export const identifyMode = $state<{ value: IdentifyMode }>({ value: 'notes' });

export function toggleIdentifyMode(): void {
  identifyMode.value = identifyMode.value === 'notes' ? 'octaves' : 'notes';
}
