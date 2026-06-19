# Documentation — Aetherion

## Language / Lingua

The UI supports **English** and **Italian** via the `APP_LANG` environment variable in `docker-compose.yml`:

```yaml
environment:
  - APP_LANG=eng   # English
  - APP_LANG=it    # Italian
```

Then rebuild: `docker compose up -d --build`

## Translating the UI / Adding a new language

All user-facing strings are in JSON files inside `lang/`:

| File | Content |
|------|---------|
| `lang/eng.json` | English translations (all UI strings) |
| `lang/it.json` | Italian translations |
| `lang/loader.js` | Loads the correct JSON based on `APP_LANG` |

### How it works

Server-rendered pages (wiki, login, settings) use `t(key)` to look up the current language.
Static pages (map, editor, settings HTML) use `{{key}}` placeholders replaced by `renderHtml()` at serve time.

### Adding a new language

1. Copy `lang/eng.json` to `lang/fr.json` (or any language code)
2. Translate all values
3. Set `APP_LANG=fr` in `docker-compose.yml`
4. Rebuild: `docker compose up -d --build`

No code changes needed.

---

## Settings panel

Access `/settings` (admin login required) to customize the site without editing files:

| Section | What you can change |
|---------|---------------------|
| **World Name** | Changes the site title and navbar brand text |
| **Map** | Upload a new map image, set width and height in pixels |
| **Favicon** | Upload your own site icon (SVG, PNG, ICO, max 2MB) |
| **Social Sharing** | Custom og:title, og:description, og:image for link previews |
| **Colors** | Gold, background, text colors with live theme preview |

All changes are saved to `branding.json` and applied immediately.

---

## Branding API

Branding data is stored in `branding.json` and served via:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/branding` | GET | Returns current branding |
| `/api/branding` | POST | Update branding fields (worldName, mapWidth, colors, etc.) |
| `/api/branding/map` | POST | Upload a new map image |
| `/api/branding/favicon` | POST | Upload a new favicon |
| `/api/branding/og-image` | POST | Upload a social sharing image |

---

## Customizing the theme (colors)

### Via the settings panel (recommended)

Go to `/settings` → **Colors** section. Changes apply to all pages in real time.

### Via `branding.json`

```json
{
    "worldName": "Aetherion",
    "mapImage": "mappa.svg",
    "mapWidth": 7648,
    "mapHeight": 3808,
    "favicon": "favicon.svg",
    "ogTitle": "",
    "ogDescription": "",
    "ogImage": "",
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

### Fonts

- **Cinzel** — headings and menus (Google Fonts)
- **Cormorant Garamond** — body text (Google Fonts)

To change them, update the Google Fonts link and `font-family` in `server.js` (wikiLayout) or the map HTML files.

---

## Adding wiki pages

Wiki pages are `.md` files in the `wiki/` directory. Two ways to create them:

1. **From the browser** (admin): go to `/wiki/`, click "New Page" or visit `/wiki/page_name/edit`
2. **Directly**: create a file `wiki/page_name.md` with Markdown content

Supports all basic Markdown syntax:
- `# Heading`, `## Subheading`
- `**bold**`, `*italic*`
- `- list`, `1. numbered list`
- `[link](url)`, `![image](url)`
- `| tables |`

---

## Adding markers to the map

### From the browser (admin)

1. Go to `/map/edit`
2. Fill in the location name and description fields
3. Click "Start placing marker"
4. Click on the map at the desired location
5. Click "Save to Server"

### Editing `markers.json` directly

```json
{
    "lat": 1500,
    "lng": 3200,
    "name": "Place Name",
    "desc": "Brief description",
    "wiki": "/wiki/page_name"
}
```

Coordinates `lat` and `lng` are in pixels relative to the map image (7648×3808).

---

## markers.json structure

```json
[
    {
        "lat": 892,
        "lng": 2382,
        "name": "Place Name",
        "desc": "",
        "wiki": ""
    }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `lat` | number | Y coordinate (pixels) |
| `lng` | number | X coordinate (pixels) |
| `name` | string | Display name |
| `desc` | string | Description (optional) |
| `wiki` | string | Wiki page link (e.g. `/wiki/city`) |

---

## Base map

The file `map/mappa.svg` is an SVG generated with [Azgaar's Fantasy Map Generator](https://azgaar.github.io/Fantasy-Map-Generator/).

Native size: 1912×952px  
Displayed at: 7648×3808px (4× scale)

To replace it:
1. Generate a new map with Azgaar (or any other image)
2. Upload via `/settings` → **Map** section
3. Or save as `map/mappa.svg` and set the dimensions in `/settings`

---

## Wiki versioning (backups)

Every time you save a wiki page, the server automatically creates a backup in `wiki/versions/<page_name>/<timestamp>.md.bak`.

- Maximum 50 backups per page
- Viewable at `/wiki/<page>/versions`
- Restorable from the same page

---

## Image upload

Images uploaded via the wiki editor are stored in `wiki/images/`.

Supported formats: PNG, JPG, GIF, SVG, WEBP (configurable in `server.js`).

---

## OG / Social sharing

Each wiki page generates dynamic Open Graph meta tags:

| Tag | Source |
|-----|--------|
| `og:title` | Custom from `/settings` or falls back to page title |
| `og:description` | Custom from `/settings` or falls back to wiki description |
| `og:image` | Custom from `/settings` or falls back to favicon |

Configure them at `/settings` → **Social Sharing**.

---

## Default credentials

| Variable | Default | File |
|----------|---------|------|
| `ADMIN_USER` | `admin` | `.env` |
| `ADMIN_PASS` | `admin` | `.env` |
| `SESSION_SECRET` | `aetherion-secret-change-me` | `.env` |
| `APP_LANG` | `eng` | `docker-compose.yml` |

To change: edit `docker-compose.yml` and rebuild.

---

## Dependencies

| Package | Version | Usage |
|---------|---------|-------|
| express | ^4.21 | Web server |
| express-session | ^1.18 | Admin sessions |
| marked | ^15.0 | Markdown rendering |
| multer | ^1.4 | Image upload |

Client-side CDN:
- **Leaflet** 1.9.4 — interactive map
- **BlockNote** 0.25 — Notion-style block-based wiki editor (React, built into `client/editor`)
- **Tailwind CSS** 3.x — utility CSS
- **Alpine.js** 3.x — loader state
- **Google Fonts** — Cinzel + Cormorant Garamond
