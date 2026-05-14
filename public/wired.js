(function () {
  var wall = document.getElementById('wall');
  var form = document.getElementById('fragment-form');
  var status = document.getElementById('status');
  var staticButton = document.getElementById('static');
  var clock = document.getElementById('clock');
  var corruption = ['�', '░', '▒', '▓', '∴', '※', 'wire', 'null', 'lain', 'echo', '000', '///', '縺', '蜷', '譁', '□', '▌', '¦', 'Ã©', 'Ð', 'ﾐ', 'ﾉ', '≡', '⌁', '▓▒░WIRE░▒▓'];
  var terminalNoise = ['[carrier lost]', 'ATZ OK', 'IRQ=07 DMA=01', 'SYS:NULL', 'baud 14400', 'NO CARRIER', 'memchk:bad', 'login ttyS0', 'CRC_ERR', 'packet ghost', 'LAYER_ERR_09', '////SIGNAL LOST////'];
  var artifacts = ['01001011', 'LAYER_ERR_09', '////SIGNAL LOST////', '▓▒░WIRE░▒▓', 'X-09-11-ALPHA', '1999999999999', '||||||||||||||||||', '::|:|::||:|:|::|:', '0x00FACADE', 'NULL_ROUTE', 'tty/ghost', 'SEGMENT_13_BAD'];
  var fonts = [
    '"Fixedsys", "Terminal", monospace',
    '"Perfect DOS VGA 437", "IBM Plex Mono", monospace',
    '"Lucida Console", Monaco, monospace',
    '"Courier New", Courier, monospace',
    '"OCR A Std", "OCR A", monospace',
    '"MS Gothic", "Osaka-Mono", monospace',
    '"Andale Mono", "Courier New", monospace',
    '"VT323", "Courier New", monospace',
    '"Share Tech Mono", "Lucida Console", monospace',
    '"Consolas", "Courier New", monospace',
    '"Monaco", "Lucida Console", monospace',
    '"Menlo", "Andale Mono", monospace',
    '"Courier", "Courier New", monospace',
    '"Px437 IBM VGA8", "Fixedsys", monospace',
    '"Web437 IBM VGA 8x16", "Terminal", monospace'
  ];

  boot();

  function boot() {
    fetch('/api/fragments')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        wall.innerHTML = '';
        data.fragments.forEach(renderFragment);
        status.textContent = data.fragments.length + ' memories loaded';
      })
      .catch(function () {
        status.textContent = 'database ghost not responding';
      });

    form.addEventListener('submit', transmit);
    staticButton.addEventListener('click', breakLink);
    window.addEventListener('resize', fitWall);
    fitWall();
    setInterval(tick, 1000);
    setInterval(whisper, 4500);
    tick();
  }

  function transmit(event) {
    event.preventDefault();
    var data = new FormData(form);
    var message = (data.get('message') || '').toString().trim();
    var image = data.get('image');

    if (!message && (!image || !image.name)) {
      status.textContent = 'empty signal rejected';
      return;
    }

    status.textContent = 'uploading into memory...';
    fetch('/api/fragments', { method: 'POST', body: data })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (body) { throw new Error(body.error || 'failed'); });
        return res.json();
      })
      .then(function (body) {
        renderFragment(body.fragment);
        form.reset();
        status.textContent = 'fragment #' + body.fragment.id + ' persisted';
      })
      .catch(function (err) {
        status.textContent = err.message || 'transmission failed';
      });
  }

  function renderFragment(fragment) {
    var node = document.createElement('div');
    node.className = 'fragment ' + fragment.kind;
    node.style.left = fragment.x + 'px';
    node.style.top = fragment.y + 'px';
    node.style.setProperty('--frag-z', fragment.z);
    node.style.setProperty('--frag-opacity', fragment.opacity);
    node.style.setProperty('--frag-rotation', fragment.rotation + 'deg');
    node.style.setProperty('--frag-font-size', fragment.fontSize + 'px');
    node.style.setProperty('--frag-letter-spacing', fragment.letterSpacing + 'px');
    node.style.setProperty('--frag-font-weight', fragment.fontWeight || 400);
    node.style.setProperty('--frag-color', fragment.color);
    var decay = seeded(fragment.id);
    node.style.setProperty('--frag-blend', fragment.blend || 'normal');
    node.style.setProperty('--frag-blur', (decay() > 0.72 ? (decay() * 1.2).toFixed(2) : 0) + 'px');
    node.style.setProperty('--frag-font', fonts[Math.floor(decay() * fonts.length)]);
    node.style.setProperty('--frag-scale-x', (0.42 + decay() * 2.4).toFixed(2));
    node.style.setProperty('--frag-scale-y', (0.72 + decay() * 0.78).toFixed(2));
    node.style.setProperty('--frag-word-opacity', (0.42 + decay() * 0.58).toFixed(2));
    node.dataset.id = fragment.id;
    node.dataset.ghost = ghostText(fragment.message || fragment.originalName || 'image', fragment.id);
    node.dataset.terminal = terminalGhost(fragment);
    if (decay() > 0.62) node.className += ' eroded';
    if (decay() > 0.70) node.className += ' barcode';
    if (decay() > 0.80) node.className += ' terminal-noise';
    if (decay() > 0.86) node.className += ' unreadable';
    node.title = fragment.createdAt + ' / fragment ' + fragment.id;

    if (fragment.imagePath) {
      var img = document.createElement('img');
      img.src = fragment.imagePath;
      img.alt = fragment.originalName || 'uploaded image fragment';
      img.loading = 'lazy';
      node.style.setProperty('--frag-width', fragment.width + 'px');
      node.appendChild(img);
    }

    if (fragment.message) {
      var words = document.createElement('span');
      words.className = 'words';
      words.textContent = corrupt(fragment.message, fragment.id);
      node.appendChild(words);
    }

    if (!fragment.imagePath && !fragment.message) {
      node.textContent = 'empty ghost';
    }

    wall.appendChild(node);
  }

  function corrupt(text, salt) {
    var rng = seeded(salt * 17 + text.length);
    var chars = text.split('');
    var every = 4 + Math.floor(rng() * 13);
    for (var i = 0; i < chars.length; i++) {
      if (chars[i] === ' ') continue;
      if (i % every === every - 1 && rng() > 0.35) chars[i] = corruption[Math.floor(rng() * corruption.length)];
      if (rng() > 0.965) chars[i] = chars[i] + corruption[Math.floor(rng() * corruption.length)];
    }

    var out = chars.join('');
    if (rng() > 0.35) out += ' ' + serial(salt, rng);
    if (rng() > 0.48) out += ' ' + artifacts[Math.floor(rng() * artifacts.length)];
    if (rng() > 0.58) out = encodingScar(out, rng);
    if (rng() > 0.66) out += ' ' + barcode(rng);
    if (rng() > 0.78) out = terminalNoise[Math.floor(rng() * terminalNoise.length)] + ' // ' + out;
    if (rng() > 0.84) out = rotUnreadable(out, rng);
    return out;
  }

  function ghostText(text, salt) {
    var rng = seeded((salt || 1) * 31);
    var clean = (text || '').slice(0, 22);
    if (rng() > 0.55) clean = encodingScar(clean, rng);
    return clean || corruption[Math.floor(rng() * corruption.length)] + serial(salt || 0, rng);
  }

  function terminalGhost(fragment) {
    var rng = seeded(fragment.id * 97);
    return terminalNoise[Math.floor(rng() * terminalNoise.length)] + ' ' + serial(fragment.id, rng) + ' ' + artifacts[Math.floor(rng() * artifacts.length)] + ' ' + barcode(rng);
  }

  function serial(salt, rng) {
    var hex = '0123456789ABCDEF';
    var value = 'SN-' + pad4((salt * 37) % 10000) + '-';
    for (var i = 0; i < 6; i++) value += hex[Math.floor(rng() * hex.length)];
    return value;
  }

  function barcode(rng) {
    var bars = ['|', '¦', '▌', '▐', '█', '░'];
    var value = '';
    for (var i = 0; i < 18 + Math.floor(rng() * 16); i++) value += bars[Math.floor(rng() * bars.length)];
    return value;
  }

  function encodingScar(text, rng) {
    var scars = ['ÃƒÂ', 'â–ˆ', 'ï¿½', '縺励', '譁ｰ', '螟壹', '%00', '\\x1b', '�', 'Ã‚Â', 'ãƒ»', 'ﾂ', 'â†’'];
    if (!text) return scars[Math.floor(rng() * scars.length)];
    var at = Math.floor(rng() * text.length);
    return text.slice(0, at) + scars[Math.floor(rng() * scars.length)] + text.slice(at);
  }

  function rotUnreadable(text, rng) {
    var veil = ['█', '▓', '░', '�', '□', '0', '1'];
    return text.split('').map(function (char, index) {
      if (char === ' ' || rng() < 0.58) return char;
      if (index % 5 === 0) return '';
      return veil[Math.floor(rng() * veil.length)];
    }).join('');
  }

  function fitWall() {
    var baseWidth = 1600;
    var baseHeight = 1100;
    var chrome = 22;
    var usableHeight = Math.max(320, window.innerHeight - chrome);
    var scale = Math.min(1, window.innerWidth / baseWidth, usableHeight / baseHeight);
    var offsetX = Math.max(0, (window.innerWidth - baseWidth * scale) / 2);
    var offsetY = chrome + Math.max(0, (usableHeight - baseHeight * scale) / 2);
    document.documentElement.style.setProperty('--wall-scale', scale.toFixed(4));
    document.documentElement.style.setProperty('--wall-offset-x', offsetX.toFixed(1) + 'px');
    document.documentElement.style.setProperty('--wall-offset-y', offsetY.toFixed(1) + 'px');
  }

  function seeded(seed) {
    var state = (seed || 1) >>> 0;
    return function () {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function breakLink() {
    status.textContent = corruption[Math.floor(Math.random() * corruption.length)] + ' link is only decorative';
    document.body.style.transform = 'translate(' + random(-2, 2) + 'px,' + random(-2, 2) + 'px)';
    setTimeout(function () { document.body.style.transform = ''; }, 180);
  }

  function whisper() {
    if (!wall.children.length) return;
    var node = wall.children[Math.floor(Math.random() * wall.children.length)];
    node.style.opacity = Math.min(1, Number(node.style.opacity || 0.6) + 0.18);
    setTimeout(function () { node.style.opacity = ''; }, 600);
  }

  function tick() {
    var now = new Date();
    clock.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function pad4(n) { return ('0000' + n).slice(-4); }
  function random(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
}());
