(function () {
  var t = setTimeout(function () {
    var el = document.getElementById('preloader-slow')
    if (el) el.hidden = false
  }, 5000)

  window.__preloaderTimeout = t

  // Safety: auto-remove preloader after 12s even if app never signals.
  window.__preloaderMaxTimeout = setTimeout(function () {
    var p = document.getElementById('preloader')
    if (p) {
      p.classList.add('fade-out')
      setTimeout(function () {
        p.remove()
      }, 300)
    }
  }, 12000)
})()
