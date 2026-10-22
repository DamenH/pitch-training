import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initializePwa } from './lib/pwa.svelte';
import { initializeTheme } from './lib/theme';
import { initializeIncomingFiles } from './lib/incoming.svelte';
import { setAudioSession } from './lib/native';
import { resumeAudio } from './audio/context';

initializeTheme();
initializePwa();
initializeIncomingFiles();
setAudioSession('playback');

// iOS Safari only applies :active (key and button press feedback) once a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

// Sounds start on touch-down, before the browser counts a gesture as user activation.
// Unlock audio on the first completed gesture so later presses play immediately.
const unlock = () => {
  void resumeAudio();
  for (const type of ['pointerup', 'keydown'] as const) window.removeEventListener(type, unlock, true);
};
for (const type of ['pointerup', 'keydown'] as const) window.addEventListener(type, unlock, true);

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

export default mount(App, { target });
