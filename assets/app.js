/* toncaid VPN — connect page v4 */
(function () {
  'use strict';

  var GITHUB_RAW = 'https://raw.githubusercontent.com/ddddderrrnnt/ddddderrrnnt.github.io/main/subs/';
  var BRANDING_UUID = '00000000-0000-0000-0000-000000000000';

  /* ── utils ── */
  function b64urlEncode(s) {
    var bytes = unescape(encodeURIComponent(s));
    return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function detectPlatform() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'desktop';
  }

  function detectTelegramIAB() {
    if (typeof window.TelegramWebviewProxy !== 'undefined') return true;
    return /Telegram\/\d/i.test(navigator.userAgent || '');
  }

  function detectInstagramOrFB() {
    return /Instagram|FBAN|FBAV/i.test(navigator.userAgent || '');
  }

  /* ── toast ── */
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ── copy ── */
  function copyText(text, msg) {
    var done = function () { toast(msg || 'Скопировано'); if (navigator.vibrate) navigator.vibrate(15); };
    var fail = function () { toast('Не удалось скопировать'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done, fail); });
    } else { fallbackCopy(text, done, fail); }
    function fallbackCopy(t, ok, err) {
      try {
        var ta = document.createElement('textarea');
        ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        var res = document.execCommand('copy');
        document.body.removeChild(ta);
        res ? ok() : err();
      } catch (e) { err(); }
    }
  }

  /* ── states ── */
  var $ = function (id) { return document.getElementById(id); };
  var loadingState = $('loadingState');
  var emptyState   = $('emptyState');
  var errorState   = $('errorState');
  var readyState   = $('readyState');

  function showState(el) {
    [loadingState, emptyState, errorState, readyState].forEach(function (s) {
      s.hidden = s !== el;
    });
  }

  showState(loadingState);

  /* ── parse URL ── */
  var raw = location.hash.slice(1);
  if (!raw) { showState(emptyState); return; }

  var isNewFormat = /^[0-9a-f]{24}$/i.test(raw);

  if (!isNewFormat) {
    /* old format: base64url(vless) */
    var decoded = b64urlDecodeOld(raw);
    if (!decoded || decoded.indexOf('vless://') !== 0) { showState(errorState); return; }
    initWithVless(decoded, '', false);
  } else {
    var userHash = raw.toLowerCase();
    var subUrl   = GITHUB_RAW + userHash + '.txt';
    var infoUrl  = GITHUB_RAW + userHash + '.json';

    /* fetch both in parallel */
    Promise.all([
      fetch(subUrl).then(function (r) { return r.ok ? r.text() : Promise.reject(); }),
      fetch(infoUrl).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (results) {
      var subText  = results[0];
      var subInfo  = results[1];
      var lines    = parseVlessLines(subText);
      /* skip branding line */
      var realLines = lines.filter(function (l) { return l.indexOf(BRANDING_UUID) === -1; });
      if (realLines.length === 0) { showState(errorState); return; }
      initWithVless(realLines[0], subUrl, true, subInfo);
    }).catch(function () { showState(errorState); });
  }

  /* ── parse subscription text ── */
  function parseVlessLines(text) {
    var t = (text || '').trim();
    var decoded = t;
    if (t.indexOf('vless://') === -1 && t.indexOf('vmess://') === -1) {
      try { decoded = atob(t); } catch (e) { decoded = t; }
    }
    return decoded.split('\n').filter(function (l) { return l.trim().startsWith('vless://') || l.trim().startsWith('vmess://'); });
  }

  function b64urlDecodeOld(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    try {
      return decodeURIComponent(atob(s).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (e) { return null; }
  }

  /* ── main init ── */
  function initWithVless(firstVless, subUrl, isSub, subInfo) {
    var platform = detectPlatform();
    var isTgIAB  = detectTelegramIAB();
    var isIgIAB  = detectInstagramOrFB();

    /* username from vless tag */
    var username = 'друг';
    var hi = firstVless.lastIndexOf('#');
    if (hi > -1) {
      try {
        var tag = decodeURIComponent(firstVless.slice(hi + 1));
        var m = tag.match(/toncaid[-_\s]VPN[-_\s](.+)/i) || tag.match(/VPN[-_\s](.+)/i);
        if (m && m[1]) username = m[1].trim();
      } catch (e) {}
    }

    showState(readyState);

    renderSubCard(username, subInfo);
    setupIabBanner(isTgIAB, isIgIAB, platform);
    renderAppGrid(isSub ? subUrl : firstVless, isSub, platform);
    renderQR(isSub ? subUrl : firstVless);
    renderCopySection(isSub ? subUrl : firstVless);
  }

  /* ── subscription card ── */
  function renderSubCard(username, info) {
    $('userName').textContent = username;

    if (!info) {
      $('subType').textContent = 'Подписка';
      $('subType').className = 'sub-type active';
      $('subExpires').textContent = '';
      return;
    }

    var daysLeft = info.days_left !== undefined ? info.days_left : null;
    var expiresAt = info.expires_at || null;
    var subType = info.subscription_type || 'paid';
    var active = info.active !== false;

    /* label */
    var label = '';
    var cls = '';
    if (!active || (daysLeft !== null && daysLeft <= 0)) {
      label = 'Подписка истекла'; cls = 'inactive';
    } else if (subType === 'trial') {
      label = 'Пробный период'; cls = 'trial';
    } else {
      label = 'Активна'; cls = 'active';
    }
    var typeEl = $('subType');
    typeEl.textContent = label;
    typeEl.className = 'sub-type ' + cls;

    /* expiry date */
    if (expiresAt) {
      var d = new Date(expiresAt * 1000);
      var opts = { day: 'numeric', month: 'long', year: 'numeric' };
      $('subExpires').textContent = 'До ' + d.toLocaleDateString('ru-RU', opts);
    }

    /* ring */
    var totalDays = subType === 'trial' ? 7 : 30;
    if (info.total_days) totalDays = info.total_days;
    var days = daysLeft !== null ? Math.max(0, daysLeft) : null;
    $('daysNum').textContent = days !== null ? days : '∞';

    if (days !== null) {
      var pct = Math.min(1, days / totalDays);
      var circumference = 2 * Math.PI * 27; /* r=27 → 169.6 */
      var offset = circumference * (1 - pct);
      var ringFg = $('ringFg');
      ringFg.setAttribute('stroke-dashoffset', circumference);
      ringFg.className = 'ring-fg ' + cls;
      /* animate after paint */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          ringFg.style.strokeDashoffset = offset;
        });
      });
    }
  }

  /* ── IAB banner ── */
  function setupIabBanner(isTgIAB, isIgIAB, platform) {
    if (!isTgIAB && !isIgIAB) return;
    var banner = $('iabBanner');
    banner.hidden = false;
    var name = isTgIAB ? 'Telegram' : 'Instagram';
    var tip = platform === 'ios'
      ? 'Нажми <b>⋯</b> вверху → <b>«Открыть в Safari»</b>'
      : platform === 'android'
      ? 'Нажми <b>⋮</b> вверху → <b>«Открыть в браузере»</b>'
      : 'Открой эту страницу во внешнем браузере';
    $('iabText').innerHTML = 'Ты в браузере <b>' + name + '</b> — он блокирует переходы в VPN-приложения. ' + tip + ', затем снова выбери приложение.';
    $('iabOpenBtn').onclick = function () { window.open(location.href, '_blank', 'noopener'); };
    $('iabCopyBtn').onclick = function () { copyText(location.href, 'Ссылка скопирована'); };
  }

  /* ── apps ── */
  var APPS = [
    {
      id: 'hiddify', name: 'Hiddify', platforms: ['ios','android','desktop'],
      sub: 'iOS · Android · ПК', color: '#bf5af2',
      install: { ios: 'https://apps.apple.com/app/hiddify-next/id6596777532', android: 'https://play.google.com/store/apps/details?id=app.hiddify.com', desktop: 'https://github.com/hiddify/hiddify-next/releases/latest' },
      scheme: function (url, isSub) { return isSub ? 'hiddify://import/' + encodeURIComponent(url) : 'hiddify://install-config?url=' + encodeURIComponent(url); }
    },
    {
      id: 'v2rayng', name: 'v2rayNG', platforms: ['android'],
      sub: 'Android', color: '#30d158',
      install: { android: 'https://play.google.com/store/apps/details?id=com.v2ray.ang' },
      scheme: function (url, isSub) { return isSub ? 'v2rayng://install-sub?url=' + encodeURIComponent(url) : 'v2rayng://install-config?url=' + encodeURIComponent(url); }
    },
    {
      id: 'karing', name: 'Karing', platforms: ['ios','android','desktop'],
      sub: 'iOS · Android · ПК', color: '#ff453a',
      install: { ios: 'https://apps.apple.com/app/karing/id6472431552', android: 'https://play.google.com/store/apps/details?id=com.nebula.karing', desktop: 'https://github.com/KaringX/karing/releases/latest' },
      scheme: function (url) { return 'karing://install-config?url=' + encodeURIComponent(url); }
    },
    {
      id: 'streisand', name: 'Streisand', platforms: ['ios'],
      sub: 'iOS', color: '#5ac8fa',
      install: { ios: 'https://apps.apple.com/app/streisand/id6450534064' },
      scheme: function (url) { return 'streisand://import/' + encodeURIComponent(url); }
    },
    {
      id: 'happ', name: 'Happ', platforms: ['ios','android'],
      sub: 'iOS · Android', color: '#ff9f0a',
      install: { ios: 'https://apps.apple.com/app/happ-proxy-utility/id6504287215', android: 'https://play.google.com/store/apps/details?id=com.happproxy' },
      scheme: function (url) { return 'happ://add/' + encodeURIComponent(url); }
    },
    {
      id: 'shadowrocket', name: 'Shadowrocket', platforms: ['ios'],
      sub: 'iOS · платный', color: '#64d2ff',
      install: { ios: 'https://apps.apple.com/app/shadowrocket/id932747118' },
      scheme: function (url, isSub) { return 'sub://' + b64urlEncode(url); }
    },
    {
      id: 'singbox', name: 'sing-box', platforms: ['ios','android','desktop'],
      sub: 'iOS · Android · ПК', color: '#4dffaa',
      install: { ios: 'https://apps.apple.com/app/sing-box/id6451272673', android: 'https://github.com/SagerNet/sing-box/releases/latest', desktop: 'https://github.com/SagerNet/sing-box/releases/latest' },
      scheme: function (url, isSub) { return isSub ? 'sing-box://import-remote-profile?url=' + encodeURIComponent(url) : url; }
    }
  ];

  /* icon svgs */
  var ICONS = {
    hiddify: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>',
    v2rayng: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.48l1.84-3.18a.4.4 0 00-.7-.4l-1.86 3.22a11.78 11.78 0 00-9.76 0L5.26 5.9a.4.4 0 00-.7.4L6.4 9.48A11.34 11.34 0 001 18h22a11.34 11.34 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 111.25-1.25A1.25 1.25 0 017 15.25zm10 0A1.25 1.25 0 1118.25 14 1.25 1.25 0 0117 15.25z"/></svg>',
    karing:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L3 7v5c0 5 3.5 8.5 9 10 5.5-1.5 9-5 9-10V7l-9-5z"/><path d="M12 8v8M8 12h8"/></svg>',
    streisand:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>',
    happ:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z"/><path d="m9 12 2 2 4-4"/></svg>',
    shadowrocket: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>',
    singbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>'
  };

  /* ── render app grid ── */
  function renderAppGrid(url, isSub, platform) {
    var grid = $('appGrid');
    var sorted = APPS.slice().sort(function (a, b) {
      var ap = a.platforms.indexOf(platform) > -1 ? 0 : 1;
      var bp = b.platforms.indexOf(platform) > -1 ? 0 : 1;
      return ap - bp;
    });

    grid.innerHTML = sorted.map(function (app) {
      var installUrl = app.install
        ? (app.install[platform] || app.install.ios || app.install.android || app.install.desktop || '')
        : '';
      var installHtml = installUrl
        ? '<a class="app-install" href="' + installUrl + '" target="_blank" rel="noopener">⬇ Установить ' + app.name + '</a>'
        : '';
      return (
        '<div class="app-card" data-id="' + app.id + '">' +
          '<button class="app-main" type="button">' +
            '<div class="app-icon" style="background:' + app.color + '1a;color:' + app.color + '">' +
              (ICONS[app.id] || ICONS.hiddify) +
            '</div>' +
            '<div class="app-info">' +
              '<div class="app-name">' + app.name + '</div>' +
              '<div class="app-platforms">' + app.sub + '</div>' +
            '</div>' +
            '<div class="app-arrow">' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
            '</div>' +
          '</button>' +
          installHtml +
        '</div>'
      );
    }).join('');

    grid.querySelectorAll('.app-card').forEach(function (card) {
      var id  = card.getAttribute('data-id');
      var app = APPS.find(function (a) { return a.id === id; });
      card.querySelector('.app-main').addEventListener('click', function () {
        attemptOpen(app, url, isSub);
      });
    });
  }

  /* ── attempt deep link ── */
  function attemptOpen(app, url, isSub) {
    if (navigator.vibrate) navigator.vibrate(15);
    var isTgIAB = detectTelegramIAB();
    var isIgIAB = detectInstagramOrFB();
    if (isTgIAB || isIgIAB) { showFallback(app, url, true); return; }

    var scheme = app.scheme(url, isSub);
    var hidden = false;
    var onVis = function () { if (document.hidden) hidden = true; };
    document.addEventListener('visibilitychange', onVis);
    try { window.location.href = scheme; } catch (e) {}

    setTimeout(function () {
      document.removeEventListener('visibilitychange', onVis);
      if (!hidden && !document.hidden) { showFallback(app, url, false); }
    }, 1800);
  }

  /* ── fallback ── */
  function showFallback(app, url, isIab) {
    var el = $('fallbackHint');
    el.hidden = false;
    var isTgIAB = detectTelegramIAB();
    var platform = detectPlatform();
    var installUrl = app.install
      ? (app.install[platform] || app.install.ios || app.install.android || app.install.desktop || '')
      : '';

    var bodyHtml = '';
    if (isIab) {
      bodyHtml = isTgIAB
        ? '1. Нажми <b>⋯</b> (или <b>⋮</b>) → <b>«Открыть в Safari/Chrome»</b><br>2. На открывшейся странице выбери <b>' + app.name + '</b> снова<br>3. Или скопируй ссылку подписки и добавь вручную'
        : '1. Открой страницу в <b>обычном браузере</b> (Chrome / Safari)<br>2. Снова выбери <b>' + app.name + '</b>';
    } else {
      bodyHtml = '1. Убедись что <b>' + app.name + '</b> установлен на устройстве<br>2. Или скопируй ссылку подписки (раздел 03) и добавь вручную через «Импорт из буфера»<br>3. Также можно отсканировать QR-код';
    }

    el.innerHTML =
      '<div class="fallback-title">' + (isIab ? '⚠ ' : '') + app.name + (isIab ? ' нельзя открыть из этого браузера' : ' не открылся?') + '</div>' +
      '<div class="fallback-text">' + bodyHtml + '</div>' +
      '<div class="fallback-actions">' +
        (installUrl ? '<a class="fb-btn" href="' + installUrl + '" target="_blank" rel="noopener">Установить</a>' : '') +
        '<button class="fb-btn" id="fbCopyBtn">Скопировать ссылку</button>' +
        '<button class="fb-btn" id="fbCloseBtn">Закрыть</button>' +
      '</div>';

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('fbCopyBtn').onclick = function () { copyText(url, 'Ссылка скопирована'); };
    $('fbCloseBtn').onclick = function () { el.hidden = true; };
  }

  /* ── QR ── */
  function renderQR(url) {
    try {
      new QRCode($('qrcode'), {
        text: url, width: 100, height: 100,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (e) {}
  }

  /* ── copy section ── */
  function renderCopySection(url) {
    $('subUrlText').textContent = url;
    var btn = $('copyBtn');
    var icon = $('copyIcon');
    var checkSvg = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    var copySvg = icon.outerHTML;
    function doCopy() {
      copyText(url, 'Ссылка скопирована');
      btn.classList.add('ok');
      icon.outerHTML = checkSvg;
      setTimeout(function () {
        btn.classList.remove('ok');
        document.querySelector('.copy-btn svg').outerHTML = document.querySelector('.copy-icon-restore') ? '' : '';
        btn.innerHTML = checkSvg.replace('<svg', '<svg id="copyIcon"');
        setTimeout(function () {
          btn.innerHTML = '<svg id="copyIcon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>';
        }, 100);
      }, 1800);
    }
    btn.onclick = doCopy;
    $('subUrlText').onclick = doCopy;
  }

})();
