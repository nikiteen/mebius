(function () {
  var wall = document.getElementById('wall');
  var form = document.getElementById('fragment-form');
  var status = document.getElementById('status');
  var staticButton = document.getElementById('static');
  var clock = document.getElementById('clock');
  var corruption = ['�', '░', '▒', '▓', '∴', '※', 'wire', 'null', 'lain', 'echo', '000', '///', '縺', '蜷', '譁', '□', '▌', '¦', 'Ã©', 'Ð', 'ﾐ'];
  var terminalNoise = ['[carrier lost]', 'ATZ OK', 'IRQ=07 DMA=01', 'SYS:NULL', 'baud 14400', 'NO CARRIER', 'memchk:bad', 'login ttyS0', 'CRC_ERR', 'packet ghost'];
  var fonts = [
    '"Fixedsys", "Terminal", monospace',
    '"Perfect DOS VGA 437", "IBM Plex Mono", monospace',
    '"Lucida Console", Monaco, monospace',
    '"Courier New", Courier, monospace',
    '"OCR A Std", "OCR A", monospace',
    '"MS Gothic", "Osaka-Mono", monospace',
    '"Andale Mono", "Courier New", monospace',
    '"VT323", "Courier New", monospace',
    '"Share Tech Mono", "Lucida Console", monospace'
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
    if (decay() > 0.68) node.className += ' eroded';
    if (decay() > 0.74) node.className += ' barcode';
    if (decay() > 0.82) node.className += ' terminal-noise';
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
    if (rng() > 0.55) out += ' ' + serial(salt, rng);
    if (rng() > 0.72) out = encodingScar(out, rng);
    if (rng() > 0.78) out += ' ' + barcode(rng);
    if (rng() > 0.88) out = terminalNoise[Math.floor(rng() * terminalNoise.length)] + ' // ' + out;
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
    return terminalNoise[Math.floor(rng() * terminalNoise.length)] + ' ' + serial(fragment.id, rng) + ' ' + barcode(rng);
  }

  function serial(salt, rng) {
    var hex = '0123456789ABCDEF';
    var value = 'SN-' + pad((salt * 37) % 10000) + '-';
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
    var scars = ['ÃƒÂ', 'â–ˆ', 'ï¿½', '縺励', '譁ｰ', '螟壹', '%00', '\\x1b', '�'];
    if (!text) return scars[Math.floor(rng() * scars.length)];
    var at = Math.floor(rng() * text.length);
    return text.slice(0, at) + scars[Math.floor(rng() * scars.length)] + text.slice(at);
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
  function random(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
}());
