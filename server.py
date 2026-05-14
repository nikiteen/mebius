#!/usr/bin/env python3
import json
import mimetypes
import os
import random
import secrets
import sqlite3
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default as email_policy
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
DATA = ROOT / 'data'
UPLOADS = DATA / 'uploads'
DB_FILE = DATA / 'wired.sqlite'
PORT = int(os.environ.get('PORT', '3000'))
MAX_UPLOAD = 8 * 1024 * 1024
MAX_MESSAGE = 255

DATA.mkdir(exist_ok=True)
UPLOADS.mkdir(parents=True, exist_ok=True)

COLORS = ['#9cff9c', '#74ff74', '#32ff55', '#b8ffb8', '#00d83a', '#d9ffd9', '#667f66']
BLENDS = ['normal', 'screen', 'lighten', 'difference', 'hard-light']
GHOSTS = [
    'present day... present time... CARRIER 14400',
    'who is watching the wire sleep? SN-0000-AF31C0',
    'i remember you from a dead address // /home/anon/.cache',
    'NO BODY / ONLY SIGNAL ▌▌¦|¦▐█░¦',
    'the room is darker when connected ÃƒÂmemory',
    'login: anonymous   password: ********   ttyS0',
    'm e m o r y  leaks through the wall %00 %00',
    'are you still there? ATZ OK NO CARRIER',
    'all images are ghosts before upload CRC_ERR',
    'protocol error // tenderness found 譁ｰ縺励',
    'IRQ=07 DMA=01 null null null',
    'MACHINE ID 6E-19-FE-00 // lonely packet',
    '||||¦▌▐█░¦||¦ barcode prayer',
    '蜷咲ｰ門ｿｽ old text did not survive',
]


def connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode = WAL')
    return conn


def init_db():
    with connection() as db:
        db.execute(
            '''
            CREATE TABLE IF NOT EXISTS fragments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              kind TEXT NOT NULL CHECK(kind IN ('text', 'image', 'mixed')),
              message TEXT,
              image_path TEXT,
              original_name TEXT,
              mime_type TEXT,
              x INTEGER NOT NULL,
              y INTEGER NOT NULL,
              z INTEGER NOT NULL,
              width INTEGER,
              opacity REAL NOT NULL,
              rotation REAL NOT NULL,
              font_size INTEGER NOT NULL,
              letter_spacing REAL NOT NULL,
              color TEXT NOT NULL,
              blend TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            '''
        )
        count = db.execute('SELECT COUNT(*) AS n FROM fragments').fetchone()['n']
        if count == 0:
            for index, message in enumerate(GHOSTS, start=1):
                visual = random_visual(has_image=False, z=index)
                db.execute(
                    '''
                    INSERT INTO fragments
                      (kind, message, x, y, z, width, opacity, rotation,
                       font_size, letter_spacing, color, blend, created_at)
                    VALUES
                      ('text', :message, :x, :y, :z, NULL, :opacity, :rotation,
                       :font_size, :letter_spacing, :color, :blend, :created_at)
                    ''',
                    {**visual, 'message': message, 'created_at': now_iso()},
                )


def random_visual(has_image, z):
    return {
        'x': random.randint(-180, 1380),
        'y': random.randint(28, 920),
        'z': z,
        'width': random.randint(90, 420) if has_image else None,
        'opacity': round(random.random() * 0.55 + (0.2 if has_image else 0.3), 2),
        'rotation': round(random.random() * 12 - 6, 2),
        'font_size': random.randint(11, 22 if has_image else 34),
        'letter_spacing': round(random.random() * 5 - 1.5, 2),
        'color': random.choice(COLORS),
        'blend': random.choice(BLENDS),
    }


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def row_to_fragment(row):
    return {
        'id': row['id'],
        'kind': row['kind'],
        'message': row['message'],
        'imagePath': row['image_path'],
        'originalName': row['original_name'],
        'x': row['x'],
        'y': row['y'],
        'z': row['z'],
        'width': row['width'],
        'opacity': row['opacity'],
        'rotation': row['rotation'],
        'fontSize': row['font_size'],
        'letterSpacing': row['letter_spacing'],
        'color': row['color'],
        'blend': row['blend'],
        'createdAt': row['created_at'],
    }


class WiredHandler(SimpleHTTPRequestHandler):
    server_version = 'MebiusLocal/0.1'

    def translate_path(self, path):
        path = unquote(path.split('?', 1)[0].split('#', 1)[0])
        if path.startswith('/uploads/'):
            relative = path.removeprefix('/uploads/').lstrip('/')
            return safe_local_path(UPLOADS, relative)
        if path == '/':
            return str(PUBLIC / 'index.html')
        return safe_local_path(PUBLIC, path.lstrip('/'))

    def do_GET(self):
        if self.path.split('?', 1)[0] == '/api/fragments':
            self.send_fragments()
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split('?', 1)[0] == '/api/fragments':
            self.receive_fragment()
            return
        self.send_error(HTTPStatus.NOT_FOUND, 'dead link')

    def send_fragments(self):
        with connection() as db:
            rows = db.execute(
                '''
                SELECT id, kind, message, image_path, original_name, x, y, z, width,
                       opacity, rotation, font_size, letter_spacing, color, blend, created_at
                FROM fragments ORDER BY id ASC
                '''
            ).fetchall()
        self.send_json({'fragments': [row_to_fragment(row) for row in rows]})

    def receive_fragment(self):
        length = int(self.headers.get('content-length') or '0')
        if length > MAX_UPLOAD + 16384:
            self.send_json({'error': 'signal too large'}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return

        content_type = self.headers.get('content-type', '')
        body = self.rfile.read(length)
        fields, files = parse_multipart(body, content_type)

        message = clean_message(fields.get('message') or fields.get('txt_in') or '')
        image_field = files.get('image')
        saved_path = None
        image_path = None
        original_name = None
        mime_type = None

        try:
            if image_field is not None and image_field.get('filename'):
                original_name = Path(image_field['filename']).name[:180]
                mime_type = image_field.get('content_type') or mimetypes.guess_type(original_name)[0] or 'application/octet-stream'
                if not mime_type.startswith('image/'):
                    self.send_json({'error': 'images only'}, HTTPStatus.BAD_REQUEST)
                    return
                suffix = safe_suffix(original_name, mime_type)
                saved_name = f'{int(datetime.now().timestamp())}-{secrets.token_hex(8)}{suffix}'
                saved_path = UPLOADS / saved_name
                with saved_path.open('wb') as out:
                    out.write(image_field['content'])
                if saved_path.stat().st_size > MAX_UPLOAD:
                    saved_path.unlink(missing_ok=True)
                    self.send_json({'error': 'image too large'}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
                    return
                image_path = f'/uploads/{saved_name}'

            if not message and not image_path:
                self.send_json({'error': 'empty signal'}, HTTPStatus.BAD_REQUEST)
                return

            kind = 'mixed' if message and image_path else 'image' if image_path else 'text'
            with connection() as db:
                z = db.execute('SELECT COALESCE(MAX(z), 0) + 1 AS z FROM fragments').fetchone()['z']
                visual = random_visual(has_image=bool(image_path), z=z)
                cursor = db.execute(
                    '''
                    INSERT INTO fragments
                      (kind, message, image_path, original_name, mime_type, x, y, z, width,
                       opacity, rotation, font_size, letter_spacing, color, blend, created_at)
                    VALUES
                      (:kind, :message, :image_path, :original_name, :mime_type, :x, :y, :z, :width,
                       :opacity, :rotation, :font_size, :letter_spacing, :color, :blend, :created_at)
                    ''',
                    {
                        **visual,
                        'kind': kind,
                        'message': message or None,
                        'image_path': image_path,
                        'original_name': original_name,
                        'mime_type': mime_type,
                        'created_at': now_iso(),
                    },
                )
                row = db.execute(
                    '''
                    SELECT id, kind, message, image_path, original_name, x, y, z, width,
                           opacity, rotation, font_size, letter_spacing, color, blend, created_at
                    FROM fragments WHERE id = ?
                    ''',
                    (cursor.lastrowid,),
                ).fetchone()
            self.send_json({'fragment': row_to_fragment(row)}, HTTPStatus.CREATED)
        except Exception:
            if saved_path:
                saved_path.unlink(missing_ok=True)
            raise

    def send_json(self, body, status=HTTPStatus.OK):
        data = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def list_directory(self, path):
        self.send_error(HTTPStatus.FORBIDDEN, 'directory listing disabled')
        return None

    def log_message(self, fmt, *args):
        print('%s - %s' % (self.address_string(), fmt % args))


def safe_local_path(base, relative):
    base = base.resolve()
    target = (base / relative).resolve()
    if target == base or base in target.parents:
        return str(target)
    return str(base / '__outside_the_wire__')


def parse_multipart(body, content_type):
    if not content_type.startswith('multipart/form-data'):
        return {}, {}
    message = BytesParser(policy=email_policy).parsebytes(
        b'Content-Type: ' + content_type.encode('utf-8') + b'\r\n'
        + b'MIME-Version: 1.0\r\n\r\n'
        + body
    )
    fields = {}
    files = {}
    for part in message.iter_parts():
        disposition = part.get('content-disposition', '')
        if 'form-data' not in disposition:
            continue
        name = part.get_param('name', header='content-disposition')
        filename = part.get_param('filename', header='content-disposition')
        if not name:
            continue
        content = part.get_payload(decode=True) or b''
        if filename:
            files[name] = {
                'filename': filename,
                'content_type': part.get_content_type(),
                'content': content,
            }
        else:
            charset = part.get_content_charset() or 'utf-8'
            fields[name] = content.decode(charset, errors='replace')
    return fields, files


def clean_message(value):
    return ' '.join(str(value).replace('\x00', ' ').split())[:MAX_MESSAGE]


def safe_suffix(name, mime_type):
    suffix = Path(name).suffix.lower()
    if suffix in {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'}:
        return suffix
    return {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'image/svg+xml': '.svg',
    }.get(mime_type, '.img')


if __name__ == '__main__':
    init_db()
    httpd = ThreadingHTTPServer(('', PORT), WiredHandler)
    print(f'wired wall listening on http://localhost:{PORT}')
    print(f'database: {DB_FILE}')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nclosing the wire')
