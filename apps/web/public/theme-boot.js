// Pre-paint theme (V1): apply the stored theme before first paint so nobody flashes the wrong theme.
// Loaded as a classic, render-blocking <script src> in <head> (not inline) so the CSP can stay
// script-src 'self' with no 'unsafe-inline'. Keep in sync with src/theme.ts:
// new key pp.theme.v1 (A|B|C|K, default C); one-time migration from BWM's bwm.theme.v1 (neon → C, classic → K).
// V2: on Neon Lounge, applies the stored Lounge colour (pp.accent.v1 .vars, precomputed by src/accent.ts) and
// preloads the active theme's UI face so text swaps in early (fonts are self-hosted; CSP font-src 'self').
(function () {
  var COLORS = { A: '#141233', B: '#F3E9DA', C: '#0C0C10', K: '#0C0712' };
  var t = 'C';
  try {
    var cur = JSON.parse(localStorage.getItem('pp.theme.v1') || 'null');
    if (cur && COLORS.hasOwnProperty(cur.theme)) t = cur.theme;
    else {
      var oldRaw = localStorage.getItem('bwm.theme.v1');
      if (oldRaw !== null) {
        var old = null;
        try { old = JSON.parse(oldRaw); } catch (e) { /* corrupt → C */ }
        t = old && old.theme === 'classic' ? 'K' : 'C';
        try { localStorage.setItem('pp.theme.v1', JSON.stringify({ theme: t })); } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { /* storage blocked → C */ }
  var d = document.documentElement.dataset;
  d.theme = t;
  if (t === 'C') d.fx = 'neon';
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', COLORS[t]);
  if (t === 'C') {
    try {
      var acc = JSON.parse(localStorage.getItem('pp.accent.v1') || 'null');
      var vars = acc && acc.vars, st = document.documentElement.style;
      if (vars && st) for (var k in vars) {
        if (vars.hasOwnProperty(k) && /^--pp-[a-z0-9-]+$/.test(k) && typeof vars[k] === 'string' && /^[#a-zA-Z0-9(),.% -]{1,120}$/.test(vars[k])) st.setProperty(k, vars[k]);
      }
    } catch (e) { /* corrupt → Magenta (CSS default) */ }
  }
  try {
    var FONT = { A: 'nunito', B: 'figtree', C: 'space-grotesk', K: 'barlow' };
    var l = document.createElement('link');
    l.rel = 'preload'; l.as = 'font'; l.type = 'font/woff2'; l.crossOrigin = 'anonymous';
    l.href = '/fonts/' + FONT[t] + '-latin-400-normal.woff2';
    document.head.appendChild(l);
  } catch (e) { /* no DOM (tests) */ }
})();
