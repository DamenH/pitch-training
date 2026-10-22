interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const pwa = $state({
  status: 'preparing' as 'preparing' | 'ready' | 'unavailable' | 'error',
  online: navigator.onLine,
  installed: window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  canInstall: false,
  updateReady: false,
});

let installPrompt: InstallPrompt | null = null;

export async function installApp() {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  pwa.canInstall = false;
  await prompt.prompt();
  await prompt.userChoice;
}

export async function prepareOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) {
    pwa.status = 'unavailable';
    return;
  }
  pwa.status = 'preparing';
  try {
    const base = new URL(import.meta.env.BASE_URL, document.baseURI);
    const registration = await navigator.serviceWorker.register(new URL('sw.js', base), {
      scope: base.pathname,
      updateViaCache: 'none',
    });
    const watchUpdate = () => {
      pwa.updateReady = Boolean(registration.waiting);
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        pwa.updateReady = Boolean(registration.waiting);
        if (worker.state === 'redundant' && !registration.active) pwa.status = 'error';
      });
    };
    registration.addEventListener('updatefound', watchUpdate);
    watchUpdate();
    await navigator.serviceWorker.ready;
    pwa.status = 'ready';
  } catch {
    pwa.status = 'error';
  }
}

export function initializePwa() {
  window.addEventListener('online', () => { pwa.online = true; });
  window.addEventListener('offline', () => { pwa.online = false; });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    pwa.canInstall = true;
  });
  window.addEventListener('appinstalled', () => {
    pwa.installed = true;
    pwa.canInstall = false;
    installPrompt = null;
  });
  void prepareOffline();
}
