// Pre-paint theme: apply the stored theme before first paint so a Neon Royale user never flashes Classic.
// Loaded as a classic, render-blocking <script src> in <head> (not inline) so the CSP can stay
// script-src 'self' with no 'unsafe-inline'. Keep in sync with src/theme.ts (key bwm.theme.v1).
try {
  var t = JSON.parse(localStorage.getItem('bwm.theme.v1') || 'null');
  if (t && t.theme === 'neon') {
    document.documentElement.dataset.theme = 'neon';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', '#070914');
  }
} catch (e) { /* absent/corrupt → Classic (no attribute) */ }
