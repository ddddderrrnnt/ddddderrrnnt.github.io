/* toncaid VPN — connect page logic (v3: subscription via GitHub + hash detection) */
(function () {
  'use strict';

  // ---------- base64url ----------
  function b64urlEncode(s) {
    var bytes = unescape(encodeURIComponent(s));
    return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    try {
      return decodeURIComponent(
        atob(s).split('').map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      );
    } catch (e) { return null; }
  }

  // ---------- platform ----------
  function detectPlatform() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'desktop';
  }
  function detectTelegramIAB() {
    var ua = navigator.userAgent || '';
    return (
      /Telegram/i.test(ua) ||
      typeof window.TelegramWebviewProxy !== 'undefined' ||
      !!(window.Telegram && window.Telegram.WebView) ||
      !!(window.Telegram && window.Telegram.WebApp)
    );
  }
  function detectInstagramOrFB() {
    return /Instagram|FBAN|FBAV/i.test(navigator.userAgent || '');
  }

  // ---------- toast ----------
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2400);
  }

  // ---------- parse hash ----------
  var raw = location.hash.slice(1);
  var emptyState = document.getElementById('emptyState');
  var readyState = document.getElementById('readyState');
  var errorState = document.getElementById('errorState');

  if (!raw) { emptyState.hidden = false; return; }

  // Detect format: 24 hex (new subscription hash) or base64(vless) (old format)
  var isNewFormat = /^[0-9a-f]{24}$/i.test(raw);
  var vless = '';
  var subUrl = '';
  var yandexUrl = '';

  if (isNewFormat) {
    // New format: user_hash (24 hex)
    var userHash = raw.toLowerCase();
    subUrl = 'https://raw.githubusercontent.com/ddddderrrnnt/ddddderrrnnt.github.io/main/subs/' + userHash + '.txt';
    yandexUrl = 'https://translate.yandex.ru/translate?lang=en-ru&url=' + encodeURIComponent(subUrl);
    
    // We'll fetch subscription to get first vless for QR/display
    // (GitHub raw has CORS enabled)
    fetch(subUrl)
      .then(function(r) { return r.text(); })
      .then(function(text) {
        var lines = text.split('\n').filter(function(l) { return l.trim().startsWith('vless://'); });
        if (lines.length > 0) {
          vless = lines[0].trim();
          renderNewFormat(vless, subUrl, yandexUrl);
        } else {
          errorState.hidden = false;
        }
      })
      .catch(function() {
        errorState.hidden = false;
      });
  } else {
    // Old format: base64(vless)
    vless = b64urlDecode(raw);
    if (!vless || vless.indexOf('vless://') !== 0) {
      errorState.hidden = false;
      return;
    }
    renderOldFormat(vless);
  }

  function renderOldFormat(vlessLink) {
    readyState.hidden = false;
    document.getElementById('vlessText').textContent = vlessLink;

    // username from #remark
    var nm = 'друг';
    var hi = vlessLink.lastIndexOf('#');
    if (hi > -1) {
      try {
        var tag = decodeURIComponent(vlessLink.slice(hi + 1));
        var m = tag.match(/toncaid[-_]VPN[-_](.+)/i);
        if (m && m[1]) nm = m[1].trim();
      } catch (e) {}
    }
    document.getElementById('userName').textContent = nm;

    setupEnv(vlessLink);
    renderChooser(vlessLink, false);
    renderQR(vlessLink);
    setupCopyBtn(vlessLink);
  }

  function renderNewFormat(firstVless, rawSub, yandexSub) {
    readyState.hidden = false;

    // Extract username
    var nm = 'друг';
    var hi = firstVless.lastIndexOf('#');
    if (hi > -1) {
      try {
        var tag = decodeURIComponent(firstVless.slice(hi + 1));
        var m = tag.match(/toncaid[-_]VPN[-_](.+)/i);
        if (m && m[1]) nm = m[1].trim();
      } catch (e) {}
    }
    document.getElementById('userName').textContent = nm;

    // Show subscription URLs in copy card
    var copyCard = document.querySelector('.copy-card');
    var copyLabel = copyCard.querySelector('.copy-label');
    copyLabel.innerHTML = '<span class="block-num">3</span> SUBSCRIPTION URL';
    var copyCode = document.getElementById('vlessText');
    copyCode.textContent = rawSub;
    copyCode.title = 'Subscription URL';

    // Add Yandex backup hint
    var yandexHint = document.createElement('div');
    yandexHint.className = 'hint';
    yandexHint.style.marginTop = '10px';
    yandexHint.innerHTML = 
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>' +
      '<div><b>Резервная ссылка:</b><br><code style="font-size:11px;word-break:break-all;">' + yandexSub + '</code><br>' +
      '<small>Через Yandex Translate — работает под белыми списками РФ</small></div>';
    copyCard.appendChild(yandexHint);

    setupEnv(firstVless);
    renderChooser(rawSub, true);  // true = subscription mode
    renderQR(rawSub);
    setupCopyBtn(rawSub);
  }

  function setupEnv(vlessOrSub) {
    var platform = detectPlatform();
    var isTgIAB = detectTelegramIAB();
    var isIgIAB = detectInstagramOrFB();
    document.body.setAttribute('data-platform', platform);
    if (isTgIAB) document.body.setAttribute('data-tg-iab', '1');

    // Telegram WebApp ready
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.ready();
        try { window.Telegram.WebApp.expand(); } catch (e) {}
      }
    } catch (e) {}

    // IAB banner
    setupIabBanner(isTgIAB, isIgIAB, platform);
  }

  function setupIabBanner(isTgIAB, isIgIAB, platform) {
    var iabBanner = document.getElementById('iabBanner');
    var iabBannerText = document.getElementById('iabBannerText');
    var iabOpenBtn = document.getElementById('iabOpenBtn');
    var iabCopyBtn = document.getElementById('iabCopyBtn');

    if (!isTgIAB && !isIgIAB) return;
    iabBanner.hidden = false;
    var name = isTgIAB ? 'Telegram' : 'Instagram';
    var howToOpen = '';
    if (platform === 'ios') {
      howToOpen = 'Нажми <b>⋯</b> вверху → <b>«Открыть в Safari»</b>';
    } else if (platform === 'android') {
      howToOpen = 'Нажми <b>⋮</b> вверху → <b>«Открыть в браузере»</b>';
    } else {
      howToOpen = 'Открой эту ссылку во внешнем браузере (Chrome / Edge / Firefox)';
    }
    iabBannerText.innerHTML =
      'Ты в браузере <b>' + name + '</b> — он блокирует переходы в VPN-приложения. ' +
      howToOpen + ', потом жми «Импортировать». Или скопируй ссылку на эту страницу ↓';

    iabOpenBtn.addEventListener('click', function () {
      var url = location.href;
      try {
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
          window.Telegram.WebApp.openLink(url, { try_instant_view: false });
          return;
        }
      } catch (e) {}
      window.open(url, '_blank', 'noopener');
    });

    iabCopyBtn.addEventListener('click', function () {
      copyText(location.href, 'Ссылка на страницу скопирована');
    });
  }

  // ---------- helpers ----------
  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || 'Скопировано'); if (navigator.vibrate) navigator.vibrate(15); };
    var fail = function () { toast('Не удалось скопировать'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fbk);
    } else { fbk(); }
    function fbk() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy'); document.body.removeChild(ta);
        ok ? done() : fail();
      } catch (e) { fail(); }
    }
  }

  // ---------- deep links ----------
  var APPS = [
    {
      id: 'hiddify',
      name: 'Hiddify',
      sub: 'iOS · Android · ПК',
      platforms: ['ios', 'android', 'desktop'],
      color: '#bf5af2',
      icon: 'hiddify',
      install: {
        ios: 'https://apps.apple.com/app/hiddify-next/id6596777532',
        android: 'https://play.google.com/store/apps/details?id=app.hiddify.com',
        desktop: 'https://github.com/hiddify/hiddify-next/releases/latest'
      },
      scheme: function (url, isSub) {
        return isSub 
          ? 'hiddify://import/' + encodeURIComponent(url)
          : 'hiddify://install-config?url=' + encodeURIComponent(url);
      }
    },
    {
      id: 'v2rayng',
      name: 'v2rayNG',
      sub: 'Android · надёжный',
      platforms: ['android'],
      color: '#30d158',
      icon: 'android',
      install: { android: 'https://play.google.com/store/apps/details?id=com.v2ray.ang' },
      scheme: function (url, isSub) {
        return isSub
          ? 'v2rayng://install-sub?url=' + encodeURIComponent(url)
          : 'v2rayng://install-config?url=' + encodeURIComponent(url);
      }
    },
    {
      id: 'karing',
      name: 'Karing',
      sub: 'iOS · Android · ПК',
      platforms: ['ios', 'android', 'desktop'],
      color: '#ff453a',
      icon: 'karing',
      install: {
        ios: 'https://apps.apple.com/app/karing/id6472431552',
        android: 'https://play.google.com/store/apps/details?id=com.nebula.karing',
        desktop: 'https://github.com/KaringX/karing/releases/latest'
      },
      scheme: function (url, isSub) {
        return 'karing://install-config?url=' + encodeURIComponent(url);
      }
    },
    {
      id: 'streisand',
      name: 'Streisand',
      sub: 'iOS · популярный',
      platforms: ['ios'],
      color: '#5ac8fa',
      icon: 'ios',
      install: { ios: 'https://apps.apple.com/app/streisand/id6450534064' },
      scheme: function (url, isSub) {
        return isSub
          ? 'streisand://import/' + encodeURIComponent(url)
          : 'streisand://import/' + encodeURIComponent(url);
      }
    },
    {
      id: 'happ',
      name: 'Happ',
      sub: 'iOS · Android',
      platforms: ['ios', 'android'],
      color: '#ff9f0a',
      icon: 'happ',
      install: {
        ios: 'https://apps.apple.com/app/happ-proxy-utility/id6504287215',
        android: 'https://play.google.com/store/apps/details?id=com.happproxy'
      },
      scheme: function (url, isSub) {
        return 'happ://add/' + encodeURIComponent(url);
      }
    },
    {
      id: 'shadowrocket',
      name: 'Shadowrocket',
      sub: 'iOS · платный',
      platforms: ['ios'],
      color: '#64d2ff',
      icon: 'ios',
      install: { ios: 'https://apps.apple.com/app/shadowrocket/id932747118' },
      scheme: function (url, isSub) {
        return isSub
          ? 'sub://' + b64urlEncode(url)
          : 'sub://' + b64urlEncode(url);
      }
    },
    {
      id: 'singbox',
      name: 'sing-box',
      sub: 'iOS · Android · ПК',
      platforms: ['ios', 'android', 'desktop'],
      color: '#4dffaa',
      icon: 'generic',
      install: {
        ios: 'https://apps.apple.com/app/sing-box/id6451272673',
        android: 'https://github.com/SagerNet/sing-box/releases/latest',
        desktop: 'https://github.com/SagerNet/sing-box/releases/latest'
      },
      scheme: function (url, isSub) {
        return isSub
          ? 'sing-box://import-remote-profile?url=' + encodeURIComponent(url)
          : url;
      }
    }
  ];

  function iconSvg(kind) {
    if (kind === 'ios') {
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>';
    }
    if (kind === 'android') {
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.48l1.84-3.18a.4.4 0 0 0-.7-.4l-1.86 3.22a11.78 11.78 0 0 0-9.76 0L5.26 5.9a.4.4 0 0 0-.7.4L6.4 9.48A11.34 11.34 0 0 0 1 18h22a11.34 11.34 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 1.25-1.25A1.25 1.25 0 0 1 7 15.25zm10 0A1.25 1.25 0 1 1 18.25 14 1.25 1.25 0 0 1 17 15.25z"/></svg>';
    }
    if (kind === 'happ') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z"/><path d="m9 12 2 2 4-4"/></svg>';
    }
    if (kind === 'hiddify') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
    }
    if (kind === 'karing') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v5c0 5 3.5 8.5 9 10 5.5-1.5 9-5 9-10V7l-9-5z"/><path d="M12 8v8M8 12h8"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v14"/><path d="m6 10 6 6 6-6"/><path d="M5 22h14"/></svg>';
  }

  // ---------- render chooser ----------
  function renderChooser(urlOrVless, isSub) {
    var platform = detectPlatform();
    var chooserGrid = document.getElementById('chooserGrid');
    var sorted = APPS.slice().sort(function (a, b) {
      var ap = a.platforms.indexOf(platform) > -1 ? 0 : 1;
      var bp = b.platforms.indexOf(platform) > -1 ? 0 : 1;
      return ap - bp;
    });
    
    chooserGrid.innerHTML = sorted.map(function(app) {
      var installUrl = app.install ? (app.install[platform] || app.install.ios || app.install.android || app.install.desktop) : '';
      var installBtn = installUrl
        ? '<a class="ac-install" href="' + installUrl + '" target="_blank" rel="noopener" data-testid="install-' + app.id + '">Установить</a>'
        : '';
      return (
        '<div class="ac" data-app="' + app.id + '" data-testid="app-import-' + app.id + '" style="--ac-color:' + app.color + '">' +
          '<button class="ac-main" data-testid="app-import-btn-' + app.id + '">' +
            '<div class="ac-icon">' + iconSvg(app.icon) + '</div>' +
            '<div class="ac-body">' +
              '<div class="ac-name">' + app.name + '</div>' +
              '<div class="ac-sub">' + app.sub + '</div>' +
            '</div>' +
            '<div class="ac-arrow"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg></div>' +
          '</button>' +
          installBtn +
        '</div>'
      );
    }).join('');

    // attach handlers
    chooserGrid.querySelectorAll('.ac').forEach(function (card) {
      var id = card.getAttribute('data-app');
      var app = APPS.find(function (a) { return a.id === id; });
      var mainBtn = card.querySelector('.ac-main');
      mainBtn.addEventListener('click', function (e) {
        e.preventDefault();
        attemptOpen(app, urlOrVless, isSub);
      });
    });
  }

  function renderQR(urlOrVless) {
    try {
      /* global QRCode */
      new QRCode(document.getElementById('qrcode'), {
        text: urlOrVless,
        width: 124, height: 124,
        colorDark: '#001a10', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (e) { console.warn('QR error', e); }
  }

  function setupCopyBtn(urlOrVless) {
    var copyBtn = document.getElementById('copyBtn');
    var copyBtnText = document.getElementById('copyBtnText');
    copyBtn.addEventListener('click', function () {
      copyText(urlOrVless, 'Скопировано');
      copyBtn.classList.add('ok');
      copyBtnText.textContent = 'Скопировано ✓';
      setTimeout(function () {
        copyBtn.classList.remove('ok');
        copyBtnText.textContent = 'Скопировать ключ';
      }, 1800);
    });
    var codeEl = document.getElementById('vlessText');
    codeEl.style.cursor = 'pointer';
    codeEl.addEventListener('click', function () { copyBtn.click(); });
  }

  // ---------- attempt open ----------
  function attemptOpen(app, urlOrVless, isSub) {
    if (navigator.vibrate) navigator.vibrate(15);
    var url = app.scheme(urlOrVless, isSub);

    var isTgIAB = detectTelegramIAB();
    var isIgIAB = detectInstagramOrFB();
    
    if (isTgIAB || isIgIAB) {
      showIabFallback(app, urlOrVless);
      return;
    }

    var hidden = false;
    var onVis = function () { if (document.hidden) hidden = true; };
    document.addEventListener('visibilitychange', onVis);

    var start = Date.now();
    try { window.location.href = url; } catch (err) {}

    setTimeout(function () {
      document.removeEventListener('visibilitychange', onVis);
      if (!hidden && !document.hidden && Date.now() - start > 1500) {
        showAppFallback(app, urlOrVless);
      }
    }, 1800);
  }

  // ---------- fallback hints ----------
  function showIabFallback(app, urlOrVless) {
    var fallbackEl = document.getElementById('fallbackHint');
    fallbackEl.hidden = false;
    var isTgIAB = detectTelegramIAB();
    var copyHint = isTgIAB
      ? '1. Нажми <b>⋯</b> (или <b>⋮</b>) → <b>«Открыть в Safari/Chrome»</b><br>' +
        '2. На открывшейся странице выбери <b>' + app.name + '</b> снова<br>' +
        '3. Или скопируй ключ ниже и добавь его в приложении вручную'
      : '1. Открой эту страницу <b>в обычном браузере</b> (Chrome / Safari)<br>' +
        '2. Снова выбери <b>' + app.name + '</b>';
    fallbackEl.innerHTML =
      '<div class="fb-title">⚠️ ' + app.name + ' нельзя открыть из ' + (isTgIAB ? 'Telegram' : 'Instagram') + '-браузера</div>' +
      '<div class="fb-text">' + copyHint + '</div>' +
      '<div class="fb-actions">' +
        '<button class="fb-btn" id="fbCopyKey" data-testid="fb-copy-key">📋 Скопировать ключ</button>' +
        '<button class="fb-btn" id="fbCopyUrl" data-testid="fb-copy-url">🔗 Скопировать ссылку страницы</button>' +
      '</div>';
    fallbackEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('fbCopyKey').addEventListener('click', function () { copyText(urlOrVless, 'Ключ скопирован'); });
    document.getElementById('fbCopyUrl').addEventListener('click', function () { copyText(location.href, 'Ссылка скопирована'); });
  }

  function showAppFallback(app, urlOrVless) {
    var fallbackEl = document.getElementById('fallbackHint');
    fallbackEl.hidden = false;
    var platform = detectPlatform();
    var installUrl = app.install ? (app.install[platform] || '') : '';
    var installLine = installUrl
      ? '<a class="fb-btn" href="' + installUrl + '" target="_blank" rel="noopener" data-testid="fb-install">⬇️ Установить ' + app.name + '</a>'
      : '';
    fallbackEl.innerHTML =
      '<div class="fb-title">' + app.name + ' не открылся?</div>' +
      '<div class="fb-text">' +
        '1. Убедись, что приложение <b>' + app.name + '</b> установлено.<br>' +
        '2. Или скопируй ключ и добавь его в приложении вручную (<b>Импорт из буфера</b>).<br>' +
        '3. Также можно отсканировать QR-код ниже.' +
      '</div>' +
      '<div class="fb-actions">' +
        installLine +
        '<button class="fb-btn" id="fbCopyKey">📋 Скопировать ключ</button>' +
      '</div>';
    fallbackEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('fbCopyKey').addEventListener('click', function () { copyText(urlOrVless, 'Ключ скопирован'); });
  }
})();
