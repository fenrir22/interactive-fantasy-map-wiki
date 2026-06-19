# Documentation

## Table of Contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Data persistence](#data-persistence)
- [Wiki system](#wiki-system)
- [Interactive map](#interactive-map)
- [Map markers](#map-markers)
- [Admin panel](#admin-panel)
- [Settings & branding](#settings--branding)
- [Theme customization](#theme-customization)
- [Translations](#translations)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Quick start

```bash
docker compose up -d
```

Then open http://localhost:3000

| Page | URL |
|------|-----|
| Map viewer | `/map/` |
| Wiki home | `/wiki/` |
| Login | `/login/` |
| Map editor (admin) | `/map/edit` |
| Settings (admin) | `/settings` |

**Default credentials:** `admin` / `admin`

---

## Configuration

All configuration is done via environment variables in `docker-compose.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_USER` | `admin` | Admin username |
| `ADMIN_PASS` | `admin` | Admin password |
| `SESSION_SECRET` | `aetherion-secret-change-me` | Session encryption key |
| `APP_LANG` | `eng` | UI language (`eng`, `it`, or custom) |
| `DATA_PATH` | `__dirname` | Base path for all user data |
| `PORT` | `3000` | Server port |

Example:

```yaml
environment:
  - ADMIN_USER=admin
  - ADMIN_PASS=your_secure_password
  - SESSION_SECRET=random_string_here
  - APP_LANG=eng
  - DATA_PATH=/app/data
```

### Port mapping

To change the host port, edit the `ports` section:

```yaml
ports:
  - "8080:3000"   # host:container
```

---

## Data persistence

All user data lives under a single configurable path (`DATA_PATH`):

| Data | Location |
|------|----------|
| Wiki pages (Markdown) | `{DATA_PATH}/wiki/` |
| Wiki images | `{DATA_PATH}/wiki/images/` |
| Wiki version backups | `{DATA_PATH}/wiki/versions/` |
| Map HTML templates | `{DATA_PATH}/map/` |
| Map image (SVG) | `{DATA_PATH}/map/mappa.svg` |
| Marker data | `{DATA_PATH}/map/markers.json` |
| Branding config | `{DATA_PATH}/branding.json` |

**On first run with a custom `DATA_PATH`**, the application automatically copies default files (map HTML, wiki pages, branding) into the data directory. An empty volume works out of the box.

### Volume setup

```yaml
volumes:
  - ./data:/app/data   # persist data on the host
```

---

## Wiki system

Wiki pages are plain Markdown files (`.md`) stored under `wiki/`.

### Creating a page

**From the browser** (logged in as admin):
- Go to `/wiki/` and click **"New Page"**
- Or navigate directly to `/wiki/page_name/edit`

**Manually:**
- Create a `wiki/page_name.md` file with Markdown content

### Editing a page

1. Navigate to the page
2. Click **"Edit"** (admin only)
3. Use the BlockNote editor (Notion-style blocks)
4. Click **"Save"**

### Page tree

The wiki home (`/wiki/`) shows a navigable tree of all pages and folders. You can:
- Click to navigate
- Drag and drop to reorganize (admin)
- Create folders and sub-pages

### Folder support

Pages can be organized into folders. A page at `wiki/regions/elven_forest.md` is accessible at `/wiki/regions/elven_forest`.

Create folders from the wiki home via the **"New Folder"** button (admin).

### Version history

Every save creates a backup. View and restore versions at `/wiki/page_name/versions`.

- Up to 50 backups per page
- Each backup is timestamped
- Restore reverts to any previous version

### Markdown syntax

```markdown
# Heading
## Subheading
**bold** *italic*
- list item
1. numbered item
[link](url)
![image](url)
| col1 | col2 |
```

---

## Interactive map

The map uses **Leaflet** with `CRS.Simple` for pixel-based coordinate systems (ideal for fantasy maps).

### Features

- **Pan & zoom** — mouse drag and scroll wheel
- **Compass** — rotates with the map in the bottom-right corner
- **Place search** — filter markers by name
- **Marker side panel** — click a marker to read its linked wiki article
- **Fullscreen mode** — click the expand button

### Changing the map image

1. Go to `/settings` (admin)
2. Under **Map**, upload a new image
3. Set the image width and height in pixels
4. Click **Save**

Or replace `map/mappa.svg` directly and update dimensions in `/settings`.

---

## Map markers

Markers are stored in `map/markers.json` as a JSON array.

### Adding markers (browser)

1. Go to `/map/edit` (admin)
2. Enter a **name** and optional **description**
3. Optionally link a **wiki page** (e.g., `/wiki/capital`)
4. Click **"Start placing marker"**
5. Click on the map at the desired location
6. Repeat for more markers
7. Click **"Save to Server"**

### Marker JSON format

```json
[
    {
        "lat": 1500,
        "lng": 3200,
        "name": "Ironforge",
        "desc": "Dwarven mountain city",
        "wiki": "/wiki/ironforge"
    }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `lat` | number | Y coordinate in pixels |
| `lng` | number | X coordinate in pixels |
| `name` | string | Display name on the map |
| `desc` | string | Short description (optional) |
| `wiki` | string | Link to a wiki page (optional) |

### Import / Export

In `/map/edit`, use the **Import** and **Export** buttons to upload or download `markers.json`.

### Coordinate system

Coordinates are in pixels relative to the map image. The default map (`mappa.svg`) is 7648×3808 px.

---

## Admin panel

### Login

Navigate to `/login/` and enter your credentials. Sessions persist until logout or browser close.

### Map editor

Accessible at `/map/edit`. Allows you to:
- Place, drag, and delete markers
- Edit marker names, descriptions, and wiki links
- Import and export marker JSON
- Save changes to the server

### Settings panel

Accessible at `/settings`. Covers branding, map, favicon, social sharing, and colors.

---

## Settings & branding

### World name

Changes the site title, navbar text, and page titles. Set in `/settings`.

### Favicon

Upload your own icon. Supported formats: SVG, PNG, ICO, JPG, WEBP (max 2MB).

### Social sharing (Open Graph)

Customize link previews when sharing URLs:

| Tag | Purpose |
|-----|---------|
| `og:title` | Card title |
| `og:description` | Card description |
| `og:image` | Card image |

Configure at `/settings` → **Social Sharing**.

### OG tags per page

Each wiki page generates dynamic Open Graph tags. Wiki pages without custom settings fall back to the global defaults.

---

## Theme customization

### Via the settings panel

Go to `/settings` → **Colors**. Changes apply site-wide in real time.

### Via `branding.json`

```json
{
    "worldName": "Aetherion",
    "mapImage": "mappa.svg",
    "mapWidth": 7648,
    "mapHeight": 3808,
    "favicon": "favicon.svg",
    "colors": {
        "gold": "#c9a84c",
        "goldLight": "#e8c44a",
        "goldDark": "#8a6e2b",
        "bgDeep": "#080c1a",
        "textPrimary": "#f0e6d3",
        "textSecondary": "#a8987a",
        "borderGlow": "rgba(201, 168, 76, 0.15)",
        "radius": "12px"
    }
}
```

### Color reference

| Variable | Default | Description |
|----------|---------|-------------|
| `gold` | `#c9a84c` | Primary accent |
| `goldLight` | `#e8c44a` | Hover / highlight |
| `goldDark` | `#8a6e2b` | Shadows / borders |
| `bgDeep` | `#080c1a` | Page background |
| `textPrimary` | `#f0e6d3` | Main text |
| `textSecondary` | `#a8987a` | Muted text |
| `borderGlow` | `rgba(201,168,76,0.15)` | Border / glow |
| `radius` | `12px` | Card border radius |

### Fonts

- **Cinzel** — headings, navigation, buttons
- **Cormorant Garamond** — body text

To change them, update the Google Fonts link and `font-family` values in `server.js` and the map HTML files.

---

## Translations

### Supported languages

| Code | Language |
|------|----------|
| `eng` | English |
| `it` | Italian |

### Adding a new language

1. Copy `lang/eng.json` to `lang/fr.json`
2. Translate all string values
3. Set `APP_LANG=fr` in `docker-compose.yml`
4. Rebuild: `docker compose up -d --build`

No code changes needed.

### How it works

Server-rendered pages use `t('key')` to look up the current language. Static HTML templates use `{{key}}` placeholders replaced at serve time by `renderHtml()`.

---

## API reference

### Branding

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/branding` | Get current branding |
| POST | `/api/branding` | Update branding fields |
| POST | `/api/branding/map` | Upload map image |
| POST | `/api/branding/favicon` | Upload favicon |
| POST | `/api/branding/og-image` | Upload OG image |

### Wiki

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wiki-pages` | Get full page tree |
| GET | `/api/wiki/{path}/content` | Get page content |
| POST | `/api/wiki/move` | Move / rename a page or folder |
| POST | `/api/wiki/folders` | Create a folder |
| POST | `/api/wiki/delete-folder` | Delete an empty folder |
| POST | `/api/wiki/order` | Save page/folder order |
| POST | `/wiki/{path}` | Save page content |

### Session & auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/session` | Check if logged in |
| GET | `/api/client-keys` | Get translation keys for client-side |
| GET | `/api/blocknote-locale` | Get BlockNote editor locale |

### Markers

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/markers` | Save markers array |

### Uploads

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/wiki/_upload` | Upload image (returns URL) |

---

## Project structure

```
.
├── data/                    # User data (auto-created, git-ignored)
│   ├── wiki/                # Wiki pages, images, versions
│   ├── map/                 # Map assets, markers, uploaded files
│   └── branding.json        # Site branding configuration
├── map/                     # Map source HTML templates
│   ├── index.html           # Public map viewer
│   ├── editor.html          # Marker editor (admin)
│   ├── settings.html        # Settings panel (admin)
│   ├── mappa.svg            # Default map image
│   ├── markers.json         # Default marker data
│   └── images/              # README screenshots
├── wiki/                    # Default wiki pages (code)
│   ├── TestPage.md          # Example page
│   └── .order.json          # Page ordering
├── lang/                    # Translation files
│   ├── eng.json             # English
│   ├── it.json              # Italian
│   ├── loader.js            # Translation loader
│   └── maps.js              # Template renderer utilities
├── client/editor/           # BlockNote editor (React + Vite)
├── server.js                # Express server
├── Dockerfile               # Multi-stage Node 20 Alpine build
├── docker-compose.yml       # Container orchestration
└── package.json
```

---

## Troubleshooting

### Blank page or "Aetherion — Interactive Map" only

The page HTML loads but CDN resources (Leaflet, Tailwind, Alpine.js, Google Fonts) may be blocked. Check:

- Internet access from the browser
- Firewall / proxy settings
- Browser console for blocked resource errors

### 404 on map assets (mappa.svg, markers.json, favicon.svg)

If using a custom `DATA_PATH`, the first startup copies default files. If you started with an older version that didn't copy all assets:

```bash
# Stop, delete data, and restart fresh
docker compose down
rm -rf data/
docker compose up -d
```

### Can't log in

- Default credentials: `admin` / `admin`
- Check `ADMIN_USER` and `ADMIN_PASS` in `docker-compose.yml`
- Session secret should be unique per instance

### Port already in use

Edit the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"
```

### Wiki editor doesn't load

The editor is a React app built from `client/editor/`. If assets are missing, rebuild:

```bash
docker compose build --no-cache
docker compose up -d
```

### Changes not persisting after restart

Ensure the volume is mounted correctly in `docker-compose.yml`:

```yaml
volumes:
  - ./data:/app/data
```

Without a volume, all data is lost when the container is removed.

### How to reset everything

```bash
docker compose down -v
rm -rf data/
docker compose pull
docker compose up -d
```
