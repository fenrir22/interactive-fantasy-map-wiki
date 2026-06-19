

# Interactive fantasy map with integrated wiki — all in a single Docker container.

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)

## Screenshots

| Interactive Map | Wiki Page |
|:---:|:---:|
| ![Map](map/images/mappaInterattiva.png) | ![Wiki](map/images/wiki.png) |

| Map Editor | Wiki Editor |
|:---:|:---:|
| ![Map Editor](map/images/editormapp.png) | ![Wiki Editor](map/images/EditorArticoli.png) |

## Live Demo

**[👉 interactive-fantasy-map-wiki.hf.space](https://fenrir2232-interactive-fantasy-map-wiki.hf.space)**

**Default credentials:** `admin` / `admin`

## Features

- **Interactive map** — Leaflet with CRS.Simple, zoom and pan, compass, place search
- **Integrated wiki** — Markdown pages with BlockNote editor (React/Notion-style), image upload, version history
- **Side panel** — click a marker on the map to read its linked wiki article
- **Map editor** — create, edit, delete markers; import/merge/export JSON; save to server
- **Admin panel** — protected login to edit the wiki and the map
- **Settings panel** — customize world name, map image & dimensions, favicon, social sharing (og:title, og:description, og:image), colors with live preview
- **Dynamic OG tags** — each wiki page gets custom open-graph metadata for rich link previews
- **Translation system** — all UI strings in JSON files; add a new language by creating a single `lang/xx.json` file

## Documentation

Full guide on translating the UI, customizing the theme, adding markers, creating wiki pages, and more: [`DOCS.md`](DOCS.md)

## Getting Started

```bash
docker compose up -d
```

Open in your browser:

| Page | URL |
|------|------|
| Map | http://localhost:3000/map/ |
| Wiki | http://localhost:3000/wiki/ |
| Settings (admin) | http://localhost:3000/settings |

## Development without Docker

```bash
npm install
node server.js
```

## Configuration

Create a `.env` file (or copy from `.env.example`):

```env
ADMIN_USER=admin
ADMIN_PASS=your_password
SESSION_SECRET=some_random_string
APP_LANG=eng
```

Then rebuild: `docker compose up -d --build`

### Language

The UI supports **English** and **Italian** via `APP_LANG`. Set it in `docker-compose.yml`:

```yaml
environment:
  - APP_LANG=eng   # English
  - APP_LANG=it    # Italian
```

Then `docker compose up -d --build`.

All user-facing strings (navigation, buttons, placeholders, dates, alerts, map UI, editor UI, settings) switch language automatically. The wiki content (markdown files) is not affected.

### Adding a new language

1. Copy `lang/eng.json` to `lang/fr.json` (or any language code)
2. Translate all values in the new file
3. Set `APP_LANG=fr` in `docker-compose.yml`
4. Rebuild: `docker compose up -d --build`

That's it — no code changes needed.

### Settings

Access `/settings` (admin login required) to customize:

| Setting | Description |
|---------|-------------|
| World Name | Changes the site title and navbar brand |
| Map | Upload a new map image, set width/height in pixels |
| Favicon | Upload your own site icon (SVG, PNG, ICO, max 2MB) |
| Social Sharing | Custom og:title, og:description, og:image for link previews |
| Colors | Live preview of gold, background, text colors with real-time theme preview |

## Project Structure

```
.
├── map/                   # Map files (viewer, editor, SVG, markers JSON)
│   ├── index.html         # Public map viewer
│   ├── editor.html        # Marker editor (admin)
│   ├── settings.html      # Branding & settings panel (admin)
│   ├── markers.json       # Marker data
│   └── mappa.svg          # Base map image
├── wiki/                  # Wiki pages in Markdown
│   ├── images/            # Uploaded images
│   └── versions/          # Version backups
├── lang/                  # Translation files
│   ├── eng.json           # English translations (all UI strings)
│   ├── it.json            # Italian translations
│   ├── loader.js          # Translation loader
│   └── maps.js            # HTML template renderer
├── server.js              # Express server
├── branding.json          # Customizable site branding
├── Dockerfile             # Node 20 Alpine build
├── docker-compose.yml     # Container orchestration
├── .env.example           # Configuration template
└── package.json
```

## License

MIT © 2026

This software is provided "as is", without warranty of any kind.
