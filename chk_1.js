
// Bump this together with version.json and sw.js's CACHE_NAME on every release.
window.TQ_APP_VERSION = 'v49';
(function(){
  var pv = document.getElementById('profile-version'); if (pv) pv.textContent = window.TQ_APP_VERSION;
  if (!('serviceWorker' in navigator)) return;
  var banner = document.getElementById('tq-update-banner');
  var refreshing = false;
  var newerVersion = null;

  // Belt-and-braces update check: besides the service worker's own update cycle, ask the
  // server for version.json directly (unique URL each time, so no browser/CDN cache can
  // hand back an old answer). If it names a newer release than the one running, offer
  // the update straight away — even if the service worker hasn't noticed yet.
  function checkVersionFile(){
    try {
      fetch('version.json?t='+Date.now(), { cache:'no-store' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
        var num = function(v){ return parseInt(String(v||'').replace(/\D+/g,''), 10) || 0; };
        if (j && j.version && num(j.version) > num(window.TQ_APP_VERSION)){ newerVersion = j.version; banner.classList.add('show'); }
      }).catch(function(){});
    } catch(e){}
  }
  function checkNow(reg){ if (reg) reg.update().catch(function(){}); checkVersionFile(); }

  navigator.serviceWorker.register('sw.js').then(function(reg){
    checkNow(reg);
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'visible') checkNow(reg);
    });
    window.addEventListener('focus', function(){ checkNow(reg); });
    window.addEventListener('pageshow', function(){ checkNow(reg); });
    // Standalone/home-screen launches don't always fire visibilitychange reliably on
    // every platform, so also poll periodically while the app is open.
    setInterval(function(){ checkNow(reg); }, 45000);

    function trackInstalling(worker){
      worker.addEventListener('statechange', function(){
        if (worker.state === 'installed' && navigator.serviceWorker.controller){
          banner.classList.add('show');
        }
      });
    }
    if (reg.waiting && navigator.serviceWorker.controller) banner.classList.add('show');
    if (reg.installing) trackInstalling(reg.installing);
    reg.addEventListener('updatefound', function(){ trackInstalling(reg.installing); });
  }).catch(function(e){ console.log('SW registration skipped:', e); });

  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  banner.addEventListener('click', function(){
    if (banner.dataset.busy === '1') return; // ignore repeat taps mid-update
    banner.dataset.busy = '1';
    banner.classList.add('updating');
    banner.textContent = '🔄 Updating… hang tight';

    var finished = false;
    function finishAndReload(){
      if (finished) return;
      finished = true;
      banner.classList.remove('updating');
      banner.classList.add('updated');
      banner.textContent = '✅ Updated! Restarting the app…';
      setTimeout(function(){
        try { var u = new URL(window.location.href); u.searchParams.set('v', newerVersion || String(Date.now())); window.location.replace(u.toString()); }
        catch(e){ window.location.reload(); }
      }, 700);
    }

    try {
      navigator.serviceWorker.getRegistration().then(function(reg){
        if (reg && reg.waiting){ reg.waiting.postMessage('SKIP_WAITING'); setTimeout(finishAndReload, 900); return; }
        // Nothing waiting yet (the version file spotted the release first): fetch the new
        // service worker now and hand over as soon as it has installed.
        if (reg){
          reg.update().catch(function(){});
          var tries = 0, iv = setInterval(function(){
            tries++;
            if (reg.waiting){ clearInterval(iv); reg.waiting.postMessage('SKIP_WAITING'); setTimeout(finishAndReload, 700); }
            else if (tries > 10){ clearInterval(iv); finishAndReload(); }
          }, 250);
        } else finishAndReload();
      }).catch(finishAndReload);
    } catch(e){ finishAndReload(); }
    // Absolute last-resort fallback so a tap can never end up doing nothing.
    setTimeout(finishAndReload, 3000);
  });
})();
