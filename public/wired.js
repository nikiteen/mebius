(function () {
  var wall = document.getElementById('wall');
  var form = document.getElementById('fragment-form');
  var status = document.getElementById('status');
  var staticButton = document.getElementById('static');
  var clock = document.getElementById('clock');
  var corruption = ['�', '░', '▒', '▓', '∴', '※', 'wire', 'null', 'lain', 'echo', '000', '///'];

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
    node.style.setProperty('--frag-blend', fragment.blend || 'normal');
    node.style.setProperty('--frag-blur', (Math.random() > 0.82 ? 0.6 : 0) + 'px');
    node.dataset.id = fragment.id;
    node.dataset.ghost = ghostText(fragment.message || fragment.originalName || 'image');
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
    var chars = text.split('');
    var every = 11 + (salt % 7);
    for (var i = every - 1; i < chars.length; i += every) {
      if (chars[i] !== ' ') chars[i] = Math.random() > 0.55 ? chars[i] : corruption[(salt + i) % corruption.length];
    }
    if (salt % 5 === 0) return text + ' ' + corruption[salt % corruption.length];
    return chars.join('');
  }

  function ghostText(text) {
    var clean = (text || '').slice(0, 28);
    return clean || corruption[Math.floor(Math.random() * corruption.length)];
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
