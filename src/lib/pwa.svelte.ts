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
  refreshing: false,
  refreshError: '',
});

let installPrompt: InstallPrompt | null = null;
let appRegistration: ServiceWorkerRegistration | null = null;

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
    appRegistration = registration;
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

function waitForInstall(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error('The update took too long. Please try again.')), 45000);
    function finish(error?: Error) {
      clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
      if (error) reject(error);
      else resolve();
    }
    function changed() {
      if (worker.state === 'installed' || worker.state === 'activated') finish();
      else if (worker.state === 'redundant') finish(new Error('Couldn’t download the update. Your current offline version is still available.'));
    }
    worker.addEventListener('statechange', changed);
    changed();
  });
}

/** Explicitly update the app shell without touching settings, history or saved scores. */
export async function updateAndReload() {
  if (pwa.refreshing) return;
  pwa.refreshError = '';
  if (!navigator.onLine) {
    pwa.refreshError = 'Connect to the internet to update the app.';
    return;
  }
  pwa.refreshing = true;
  try {
    if (!appRegistration) await prepareOffline();
    if (!appRegistration) throw new Error('App updates aren’t available in this browser.');
    const registration = appRegistration;
    // updateViaCache: 'none' ensures this checks the server, not the HTTP cache.
    await registration.update();
    if (registration.installing) await waitForInstall(registration.installing);
    const worker = registration.waiting;
    if (worker) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => finish(new Error('Couldn’t activate the update. Please try again.')), 15000);
        function finish(error?: Error) {
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener('controllerchange', changed);
          if (error) reject(error);
          else resolve();
        }
        function changed() {
          if (navigator.serviceWorker.controller === worker) finish();
        }
        navigator.serviceWorker.addEventListener('controllerchange', changed);
        worker.postMessage({ type: 'ACTIVATE_UPDATE' });
        changed();
      });
    }
    window.location.reload();
  } catch (error) {
    console.warn('Unable to update app.', error);
    pwa.refreshError = 'Couldn’t update the app. Check your connection and try again. Your saved data and current offline version are still available.';
  } finally {
    pwa.refreshing = false;
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
