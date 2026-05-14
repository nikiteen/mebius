# Mebius Local Wired Wall

A small local-first anonymous digital wall: text and image fragments are uploaded into a single accumulating page, saved in SQLite, and rendered forever in fixed, overlapping, CRT-corrupted positions.

This is intentionally not a modern app. It is plain HTML, CSS, browser JavaScript, Python standard-library HTTP, SQLite, and local file storage.

## Run locally

```bash
python3 server.py
```

Open <http://localhost:3000>.

## What persists

- SQLite database: `data/wired.sqlite`
- Uploaded images: `data/uploads/`

Both are local to your machine. Delete `data/wired.sqlite` to reset the wall. Delete files inside `data/uploads/` to clear uploaded image files.

## Project structure

```text
server.py              Dependency-free Python server, upload endpoint, SQLite setup, random position/style generator
public/index.html      Single-page wired wall markup
public/style.css       CRT, phosphor, scanline, flicker, fixed-canvas, and fragment styling
public/wired.js        Fetches fragments, renders them, fits the fixed canvas, and submits uploads
data/uploads/          Local image storage directory
```

## Endpoints

- `GET /api/fragments` returns all stored fragments in permanent order.
- `POST /api/fragments` accepts `multipart/form-data` with:
  - `message` optional short text, max 255 characters
  - `image` optional image file, max 8 MB

Text-only, image-only, and mixed fragments are all accepted. Each new fragment receives a random absolute position, z-index, opacity, rotation, and visual treatment before it is saved.

## Editing the feeling

The easiest files to change by hand are:

- `public/style.css` for glow, flicker, scanlines, fixed screen-space, unreadability, font stretching, and old-web form behavior.
- `server.py` `random_visual()` for coordinate ranges, opacity, z-index behavior, and image widths.
- `public/wired.js` `corruption`, `terminalNoise`, and `fonts` for broken symbols, serial/barcode ghosts, and bitmap/terminal typography.
