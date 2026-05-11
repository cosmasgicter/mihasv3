/*
 * MIHAS preloader runtime.
 *
 * Keeps the branded loading card alive with gentle, reassuring rotating copy
 * so students on slow mobile networks stay engaged instead of bouncing.
 * Exposes window.__dismissPreloader() used by main.tsx once React mounts.
 *
 * Contract (must NOT change without updating src/main.tsx):
 *   - element id="preloader"
 *   - fade-out by adding the ".fade-out" class, then removing after 300ms
 *   - "taking longer than expected" row becomes visible after 5s
 *   - safety net forces removal after 12s even if the app never signals
 */
(function () {
  var rotating = [
    'Getting your application ready\u2026',
    'Checking available intakes\u2026',
    'Loading your programmes\u2026',
    'Almost there\u2026',
  ]
  var subEl = document.getElementById('mihas-pre-sub')
  var rotationIndex = 0
  var rotationTimer = null

  function nextCopy() {
    rotationIndex = (rotationIndex + 1) % rotating.length
    if (!subEl) return
    // Fade the existing copy out then swap, so the text doesn't flicker-cut.
    subEl.style.opacity = '0'
    setTimeout(function () {
      subEl.textContent = rotating[rotationIndex]
      subEl.style.opacity = '1'
    }, 180)
  }

  // Respect reduced-motion: no copy rotation, no churn.
  var reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (subEl && !reduceMotion) {
    // Rotate every 2.2s. Starts 1.2s in so the very first message has time
    // to register before we start changing it.
    setTimeout(function () {
      rotationTimer = setInterval(nextCopy, 2200)
    }, 1200)
  }

  // Show the "taking longer than expected" row after 5s — this is the
  // reassurance layer for truly slow connections.
  var slowTimer = setTimeout(function () {
    var slow = document.getElementById('preloader-slow')
    if (slow) slow.hidden = false
  }, 5000)
  window.__preloaderTimeout = slowTimer

  // Safety: if the app never calls __dismissPreloader (e.g. a fatal JS
  // error before mount), remove the preloader at 12s so the underlying
  // page is at least reachable.
  window.__preloaderMaxTimeout = setTimeout(function () {
    var p = document.getElementById('preloader')
    if (!p) return
    p.classList.add('fade-out')
    setTimeout(function () {
      if (p && p.parentNode) p.parentNode.removeChild(p)
    }, 400)
    if (rotationTimer) clearInterval(rotationTimer)
  }, 12000)
})()
