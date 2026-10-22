/** Give browser/system chrome one explicit color, including on browsers that
 * don't select between theme-color tags with media attributes reliably. */
export function initializeTheme() {
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const sync = () => {
    const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (background && themeColor) themeColor.content = background;
  };
  sync();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
  // Reapply after returning from the home screen or device settings.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
  });
}
