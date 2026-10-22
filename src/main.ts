import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { initializePwa } from './lib/pwa.svelte';
import { initializeTheme } from './lib/theme';

initializeTheme();
initializePwa();

// iOS Safari only applies :active (key and button press feedback) once a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

export default mount(App, { target });
