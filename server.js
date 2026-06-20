const express = require('express');
const session = require('express-session');
const marked = require('marked');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const yaml = require('js-yaml');
const { t, translations, lang, langCode, clientKeys } = require('./lang/loader');
// maps.js kept for potential future use

const DATA_PATH = process.env.DATA_PATH || __dirname;
const IMG_DIR = path.join(DATA_PATH, 'wiki', 'images');
const MAP_DIR = path.join(DATA_PATH, 'map');
const BRANDING_FILE = path.join(DATA_PATH, 'branding.json');

const imgStorage = multer.diskStorage({
    destination: IMG_DIR,
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: imgStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error(t('upload_error')));
    }
});

const mapUpload = multer({
    storage: multer.diskStorage({
        destination: MAP_DIR,
        filename: (req, file, cb) => {
            cb(null, 'custom_map' + path.extname(file.originalname));
        }
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) cb(null, true);
        else cb(new Error('Invalid map file format'));
    }
});

function applyBranding(html) {
  const branding = loadBranding();
  return html
    .replace(/\[\[worldName\]\]/g, branding.worldName)
    .replace(/\[\[mapImage\]\]/g, branding.mapImage)
    .replace(/\[\[favicon\]\]/g, branding.favicon)
    .replace(/\[\[ogTitle\]\]/g, branding.ogTitle)
    .replace(/\[\[ogDescription\]\]/g, branding.ogDescription)
    .replace(/\[\[ogImage\]\]/g, branding.ogImage);
}

function renderHtml(html) {
  const translated = html.replace(/\{\{(\w+)\}\}/g, function(match, key) {
    return t(key) || match;
  });
  return applyBranding(translated);
}

function faviconType(filename) {
    if (!filename) return 'image/svg+xml';
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.ico') return 'image/x-icon';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    return 'image/svg+xml';
}

function loadBranding() {
    try {
        const data = JSON.parse(fs.readFileSync(BRANDING_FILE, 'utf-8'));
        if (!data.favicon) data.favicon = 'favicon.svg';
        if (!data.ogTitle) data.ogTitle = '';
        if (!data.ogDescription) data.ogDescription = '';
        if (!data.ogImage) data.ogImage = '';
        if (!data.wikiSubtitle) data.wikiSubtitle = '';
        return data;
    } catch {
        return {
            worldName: 'Aetherion',
            mapImage: 'mappa.svg',
            mapWidth: 7648,
            mapHeight: 3808,
            favicon: 'favicon.svg',
            ogTitle: '',
            ogDescription: '',
            ogImage: '',
            wikiSubtitle: '',
            colors: {
                gold: '#c9a84c',
                goldLight: '#e8c44a',
                goldDark: '#8a6e2b',
                bgDeep: '#080c1a',
                textPrimary: '#f0e6d3',
                textSecondary: '#a8987a',
                borderGlow: 'rgba(201, 168, 76, 0.15)',
                radius: '12px'
            }
        };
    }
}

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
const WIKI_DIR = path.join(DATA_PATH, 'wiki');
const WIKI_ORDER_FILE = path.join(WIKI_DIR, '.order.json');

function loadOrder() {
    try {
        const data = fs.readFileSync(WIKI_ORDER_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

function saveOrder(order) {
    fs.writeFileSync(WIKI_ORDER_FILE, JSON.stringify(order, null, 2), 'utf-8');
}

function sanitizeWikiPath(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let normalized = decodeURIComponent(raw)
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/\.\./g, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .trim();
    const segments = normalized.split('/')
        .map(seg => seg.trim().replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_'))
        .filter(seg => seg.length > 0 && seg !== '.' && seg !== '..');
    return segments.join('/');
}

function isInsideWiki(checkPath) {
    const root = path.resolve(WIKI_DIR) + path.sep;
    return path.resolve(checkPath).startsWith(root);
}

function safeWikiFilePath(rawPage) {
    const rel = sanitizeWikiPath(rawPage);
    if (!rel) return null;
    const full = path.resolve(WIKI_DIR, rel + '.md');
    if (!isInsideWiki(full)) return null;
    return full;
}

function safeWikiDirPath(rawDir) {
    const rel = sanitizeWikiPath(rawDir);
    if (!rel) return null;
    const full = path.resolve(WIKI_DIR, rel);
    if (!isInsideWiki(full)) return null;
    return full;
}

function pageDisplayName(rawPage) {
    const rel = sanitizeWikiPath(rawPage);
    if (!rel) return '';
    return path.basename(rel).replace(/_/g, ' ');
}

function pageUrlPath(rawPage) {
    return sanitizeWikiPath(rawPage);
}

function buildWikiTree(dir, relPrefix) {
    const order = loadOrder();
    return buildWikiTreeWithOrder(dir, relPrefix, order);
}

function buildWikiTreeWithOrder(dir, relPrefix, order) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const children = [];
    for (const entry of entries) {
        if (entry.name === 'versions' || entry.name === 'images' || entry.name === '.order.json') continue;
        const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            const folderChildren = buildWikiTreeWithOrder(path.join(dir, entry.name), relPath, order);
            children.push({ type: 'folder', name: entry.name, path: relPath, children: folderChildren });
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            const pageName = entry.name.replace(/\.md$/, '');
            const pagePath = relPrefix ? `${relPrefix}/${pageName}` : pageName;
            children.push({ type: 'page', name: pageName, path: pagePath });
        }
    }
        const orderKey = relPrefix || '';
        const orderedNames = Array.isArray(order[orderKey]) ? order[orderKey] : [];
        const orderIndex = new Map(orderedNames.map((name, i) => [name, i]));
        return children.sort((a, b) => {
            if (!relPrefix && a.name === 'home') return -1;
            if (!relPrefix && b.name === 'home') return 1;
            const ia = orderIndex.get(a.name);
            const ib = orderIndex.get(b.name);
            if (ia !== undefined && ib !== undefined) return ia - ib;
            if (ia !== undefined) return -1;
            if (ib !== undefined) return 1;
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });
}

function listWikiPages(dir, relPrefix, out) {
    if (!fs.existsSync(dir)) return out;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === 'versions' || entry.name === 'images') continue;
        const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            listWikiPages(path.join(dir, entry.name), relPath, out);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            out.push(relPath.replace(/\.md$/, ''));
        }
    }
    return out;
}

function wikiVersionsDirPath(rawPage) {
    const rel = sanitizeWikiPath(rawPage);
    if (!rel) return null;
    const vDir = path.resolve(WIKI_DIR, 'versions', rel);
    if (!isInsideWiki(vDir)) return null;
    return vDir;
}

function ensureWikiVersionsDir(rawPage) {
    const vDir = wikiVersionsDirPath(rawPage);
    if (!vDir) return null;
    fs.mkdirSync(vDir, { recursive: true });
    return vDir;
}

function cleanupEmptyFolders(dir) {
    const root = path.resolve(WIKI_DIR);
    let current = path.resolve(dir);
    while (current !== root && current.startsWith(root)) {
        try {
            const entries = fs.readdirSync(current);
            if (entries.length === 0) {
                fs.rmdirSync(current);
                current = path.dirname(current);
            } else {
                break;
            }
        } catch (e) {
            break;
        }
    }
}

function parseFrontmatter(md) {
    const m = md.match(/^---\n([\s\S]*?)\n---\n*/);
    if (!m) return { attrs: {}, content: md };
    try {
        const attrs = yaml.load(m[1]) || {};
        return { attrs, content: md.slice(m[0].length) };
    } catch {
        return { attrs: {}, content: md };
    }
}

function renderWikilinks(html, currentPage) {
    return html.replace(/\[\[([^\]]+)\]\]/g, (m, raw) => {
        const parts = raw.split('|');
        const target = parts[0].trim().replace(/\s+/g, '_');
        const label = parts[1] ? parts[1].trim() : parts[0].trim();
        const href = '/wiki/' + encodeURIComponent(target);
        const cls = (currentPage && target === currentPage) ? 'wikilink self' : 'wikilink';
        return `<a href="${href}" class="${cls}">${label}</a>`;
    });
}

function generateToc(body) {
    const headings = [];
    const re = /<h([1-6])\b[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m;
    while ((m = re.exec(body)) !== null) {
        const level = parseInt(m[1]);
        const id = m[2];
        const text = m[3].replace(/<[^>]+>/g, '');
        headings.push({ level, id, text });
    }
    if (headings.length < 2) return '';
    let html = '<nav class="wiki-toc"><h3>' + t('toc_title') + '</h3><ol>';
    for (const h of headings) {
        html += `<li style="margin-left:${(h.level - 1) * 16}px"><a href="#${h.id}">${h.text}</a></li>`;
    }
    html += '</ol></nav>';
    return html;
}

function infoboxHtml(attrs) {
    const keys = Object.keys(attrs).filter(k => k !== 'title' && k !== 'subtitle' && k !== 'tags');
    if (!keys.length && !attrs.title && !attrs.subtitle) return '';
    const tags = Array.isArray(attrs.tags) ? attrs.tags.map(t => `<span class="infobox-tag">${t}</span>`).join('') : '';
    let html = '<aside class="infobox">';
    if (attrs.title) html += `<h2 class="infobox-title">${attrs.title}</h2>`;
    if (attrs.subtitle) html += `<p class="infobox-subtitle">${attrs.subtitle}</p>`;
    if (tags) html += `<div class="infobox-tags">${tags}</div>`;
    for (const k of keys) {
        const v = Array.isArray(attrs[k]) ? attrs[k].join(', ') : String(attrs[k]);
        html += `<div class="infobox-row"><span class="infobox-key">${k}</span><span class="infobox-val">${v}</span></div>`;
    }
    html += '</aside>';
    return html;
}

let backlinksCache = {};
let backlinksDirty = true;

function buildBacklinks() {
    if (!backlinksDirty) return;
    backlinksCache = {};
    const pages = [];
    listWikiPages(WIKI_DIR, '', pages);
    for (const p of pages) {
        const fp = safeWikiFilePath(p);
        if (!fp || !fs.existsSync(fp)) continue;
        const content = fs.readFileSync(fp, 'utf-8');
        const refs = content.match(/\[\[([^\]]+)\]\]/g) || [];
        for (const ref of refs) {
            const target = ref.slice(2, -2).split('|')[0].trim().replace(/\s+/g, '_');
            if (!backlinksCache[target]) backlinksCache[target] = [];
            if (!backlinksCache[target].includes(p)) backlinksCache[target].push(p);
        }
    }
    backlinksDirty = false;
}

function markBacklinksDirty() { backlinksDirty = true; }

function renderMarkdown(md, currentPage) {
    const { attrs, content } = parseFrontmatter(md);
    const raw = marked.parse(content, { gfm: true });
    const body = renderWikilinks(raw, currentPage);
    return { attrs, body, content };
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'aetherion-secret-change-me',
    resave: false,
    saveUninitialized: false,
}));

function isAdmin(req) {
    return req.session && req.session.admin === true;
}

function requireAdmin(req, res, next) {
    if (isAdmin(req)) return next();
    res.redirect('/login/?redirect=' + encodeURIComponent(req.originalUrl));
}

function wikiLayout(title, content, admin) {
    const branding = loadBranding();
    const c = branding.colors;
    const navRight = admin
        ? `<a href="/map/">${t('nav_map')}</a><a href="/wiki/">${t('nav_wiki')}</a><a href="/map/edit">${t('nav_editor')}</a><a href="/settings">${t('nav_settings')}</a><a href="/logout/" style="color:#7a7a7a">${t('nav_logout')}</a>`
        : `<a href="/map/">${t('nav_map')}</a><a href="/wiki/">${t('nav_wiki')}</a><a href="/login/">${t('nav_login')}</a>`;
    const html = `<!DOCTYPE html>
<html lang="${langCode}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t('meta_title_wiki', { title: branding.worldName + ' — ' + title })}</title>
    <link rel="icon" type="${faviconType(branding.favicon || 'favicon.svg')}" href="/map/${branding.favicon || 'favicon.svg'}">
    <meta property="og:title" content="${branding.ogTitle || t('meta_title_wiki', { title: branding.worldName + ' — ' + title })}">
    <meta property="og:description" content="${branding.ogDescription || t('meta_desc_wiki', { title })}">
    <meta property="og:image" content="${branding.ogImage ? '/map/' + branding.ogImage : '/map/' + branding.favicon}">
    <meta property="og:url" content="/wiki/">
    <meta name="twitter:card" content="summary">
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
            --gold: ${c.gold};
            --gold-light: ${c.goldLight};
            --gold-dark: ${c.goldDark};
            --bg-deep: ${c.bgDeep};
            --bg-card: rgba(12, 16, 32, 0.72);
            --bg-editor: rgba(10, 14, 28, 0.55);
            --text-primary: ${c.textPrimary};
            --text-secondary: ${c.textSecondary};
            --border-glow: ${c.borderGlow};
            --border-glow-strong: rgba(201, 168, 76, 0.28);
            --radius: ${c.radius};
        }
        html { scroll-behavior: smooth; }
        body {
            font-family: 'Cormorant Garamond', Georgia, serif;
            background:
                radial-gradient(ellipse at 20% 0%, rgba(201, 168, 76, 0.04) 0%, transparent 45%),
                radial-gradient(ellipse at 80% 100%, rgba(201, 168, 76, 0.03) 0%, transparent 40%),
                ${c.bgDeep};
            color: var(--text-primary);
            line-height: 1.7;
            min-height: 100vh;
        }
        .wiki-nav {
            display: flex; align-items: center; justify-content: space-between;
            height: 58px;
            padding: 0 28px;
            background: rgba(8, 12, 26, 0.78);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border-bottom: 1px solid var(--border-glow);
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.45);
            position: sticky; top: 0; z-index: 100;
        }
        .wiki-nav::after {
            content: ''; position: absolute; bottom: -1px; left: 5%; right: 5%; height: 1px;
            background: linear-gradient(90deg, transparent, var(--gold-dark), var(--gold), var(--gold-dark), transparent);
            opacity: 0.5;
        }
        .nav-brand { display: flex; align-items: center; gap: 14px; }
        .nav-logo {
            width: 32px; height: 32px; border-radius: 6px;
            object-fit: contain;
            background: radial-gradient(circle at 35% 35%, var(--gold-light), var(--gold-dark));
            box-shadow: 0 0 14px rgba(201, 168, 76, 0.25);
        }
        .wiki-nav a {
            font-family: 'Cinzel', serif; color: var(--gold); text-decoration: none;
            font-size: 0.85rem; letter-spacing: 1.2px; transition: all 0.25s ease;
            text-shadow: 0 0 10px rgba(201, 168, 76, 0.12);
        }
        .wiki-nav a:hover { color: var(--gold-light); }
        .wiki-nav .nav-links { display: flex; gap: 22px; align-items: center; }
        .wiki-wrap { max-width: 920px; margin: 0 auto; padding: 42px 24px 90px; }
        .wiki-card {
            background: var(--bg-editor);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid var(--border-glow);
            border-radius: var(--radius);
            box-shadow: 0 12px 50px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.03);
            padding: 44px 52px;
            position: relative;
        }
        .wiki-card::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
            background: linear-gradient(90deg, transparent, rgba(201, 168, 76, 0.3), transparent);
            border-radius: var(--radius) var(--radius) 0 0;
        }
        .wiki-title {
            font-family: 'Cinzel', serif; font-size: 2rem; color: var(--gold);
            margin: 0 0 10px; letter-spacing: 2px;
            border-bottom: 1px solid var(--border-glow); padding-bottom: 12px;
            text-shadow: 0 0 16px rgba(201, 168, 76, 0.14);
        }
        .wiki-meta { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 30px; font-style: italic; }
        .wiki-content h1, .wiki-content h2, .wiki-content h3 {
            font-family: 'Cinzel', serif; color: var(--gold); margin: 30px 0 12px; letter-spacing: 1px;
        }
        .wiki-content h1 { font-size: 1.7rem; border-bottom: 1px solid var(--border-glow); padding-bottom: 8px; }
        .wiki-content h2 { font-size: 1.35rem; }
        .wiki-content h3 { font-size: 1.1rem; }
        .wiki-content p { margin: 14px 0; font-size: 1.08rem; }
        .wiki-content a { color: var(--gold); text-decoration: underline; text-underline-offset: 3px; }
        .wiki-content a:hover { color: var(--gold-light); }
        .wiki-content ul, .wiki-content ol { margin: 12px 0; padding-left: 28px; }
        .wiki-content li { margin: 6px 0; }
        .wiki-content blockquote {
            border-left: 3px solid var(--gold); padding: 12px 22px; margin: 18px 0;
            background: rgba(201, 168, 76, 0.04); font-style: italic; color: #b8b4a8;
            border-radius: 0 8px 8px 0;
        }
        .wiki-content code {
            font-family: 'Fira Code', monospace; background: rgba(255,255,255,0.06);
            padding: 2px 8px; border-radius: 4px; font-size: 0.92em; color: var(--gold-light);
        }
        .wiki-content pre {
            background: rgba(0,0,0,0.35); padding: 18px 24px; border-radius: 8px;
            overflow-x: auto; margin: 18px 0; border: 1px solid var(--border-glow);
        }
        .wiki-content pre code { background: none; padding: 0; color: var(--text-primary); }
        .wiki-content img { max-width: 100%; border-radius: 8px; margin: 16px 0; border: 1px solid var(--border-glow); box-shadow: 0 6px 24px rgba(0,0,0,0.35); }
        .wiki-content table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .wiki-content th, .wiki-content td {
            padding: 10px 14px; border: 1px solid var(--border-glow); text-align: left;
        }
        .wiki-content th {
            font-family: 'Cinzel', serif; background: rgba(201,168,76,0.06);
            color: var(--gold); font-size: 0.85rem; letter-spacing: 1px;
        }
        .wiki-content td { background: rgba(255,255,255,0.02); }
        .wiki-content hr { border: none; border-top: 1px solid var(--border-glow); margin: 32px 0; }
        .wiki-edit-btn, .wiki-back-btn, .wiki-del-btn {
            font-family: 'Cinzel', serif; font-size: 0.72rem; letter-spacing: 1.2px;
            text-transform: uppercase; padding: 8px 18px; border-radius: 6px;
            cursor: pointer; transition: all 0.25s ease;
            text-decoration: none; border: 1px solid transparent;
            background: transparent; position: relative; overflow: hidden;
            display: inline-flex; align-items: center; justify-content: center;
        }
        .wiki-edit-btn, .wiki-back-btn { color: var(--gold); border-color: rgba(201,168,76,0.35); background: rgba(201,168,76,0.06); }
        .wiki-edit-btn:hover, .wiki-back-btn:hover { background: rgba(201,168,76,0.12); border-color: rgba(201,168,76,0.55); box-shadow: 0 0 16px rgba(201,168,76,0.1); }
        .wiki-del-btn { color: #c97a7a; border-color: rgba(180,60,60,0.35); background: rgba(180,60,60,0.06); }
        .wiki-del-btn:hover { background: rgba(180,60,60,0.12); border-color: rgba(180,60,60,0.55); }
        .edit-form { margin-top: 30px; }
        .edit-form textarea {
            width: 100%; min-height: 400px; font-family: 'Fira Code', monospace; font-size: 0.9rem;
            padding: 16px; background: rgba(0,0,0,0.3); color: var(--text-primary);
            border: 1px solid var(--border-glow); border-radius: 8px; resize: vertical;
        }
        .edit-form textarea:focus { outline: none; border-color: var(--gold); }
        .edit-form .btn-row { display: flex; gap: 12px; margin-top: 12px; }
        .edit-form input[type="submit"] {
            font-family: 'Cinzel', serif; font-size: 0.75rem; letter-spacing: 1.2px; text-transform: uppercase;
            padding: 10px 26px; border: 1px solid var(--gold); border-radius: 6px;
            cursor: pointer; background: var(--gold); color: #0a0e1a;
            font-weight: 700; transition: all 0.25s ease;
        }
        .edit-form input[type="submit"]:hover { background: var(--gold-light); box-shadow: 0 0 16px rgba(201,168,76,0.14); }
        .edit-form input[type="submit"].secondary { background: transparent; color: var(--gold); }
        .edit-form input[type="submit"].secondary:hover { background: rgba(201,168,76,0.1); }
        .error-404 { text-align: center; padding: 80px 20px; }
        .error-404 h2 { font-family: 'Cinzel', serif; font-size: 3rem; color: var(--gold); margin-bottom: 16px; text-shadow: 0 0 20px rgba(201,168,76,0.2); }
        .error-404 p { color: var(--text-secondary); font-size: 1.1rem; }
        .error-404 a { color: var(--gold); }
        .login-form { max-width: 380px; margin: 60px auto; text-align: center; }
        .login-form h2 { margin-bottom: 30px; }
        .login-form input[type="text"], .login-form input[type="password"] {
            width: 100%; padding: 12px 16px; margin-bottom: 16px;
            background: rgba(0,0,0,0.3); color: var(--text-primary); border: 1px solid var(--border-glow);
            border-radius: 8px; font-family: 'Cormorant Garamond', serif; font-size: 1rem;
            transition: border-color 0.2s;
        }
        .login-form input:focus { outline: none; border-color: var(--gold); }
        .login-form input[type="submit"] {
            width: 100%; padding: 12px; margin-top: 8px;
            border: none; border-radius: 8px;
            background: linear-gradient(135deg, var(--gold-dark), var(--gold));
            color: #0a0e1a; font-family: 'Cinzel', serif;
            font-size: 0.85rem; font-weight: 700; letter-spacing: 2px;
            text-transform: uppercase; cursor: pointer;
            transition: all 0.25s ease;
        }
        .login-form input[type="submit"]:hover { background: linear-gradient(135deg, var(--gold), var(--gold-light)); box-shadow: 0 0 20px rgba(201,168,76,0.18); }
        .login-form input[type="submit"]:active { transform: scale(0.98); }
        .login-error { color: #c97a7a; font-size: 0.9rem; margin-top: 16px; font-style: italic; }
        .sidebar-sep {
            display:flex; align-items:center; gap:14px; margin:28px 0 18px;
            color:var(--text-secondary); font-size:0.75rem; font-family:'Cinzel',serif; letter-spacing:1px;
        }
        .sidebar-sep::after { content:''; flex:1; height:1px; background:var(--border-glow); }
        .guide-badge {
            display:inline-block; font-size:0.62rem; letter-spacing:1px;
            padding:3px 10px; border-radius:4px;
            background:rgba(201,168,76,0.12); color:var(--gold);
            font-family:'Cinzel',serif; margin-left:auto;
        }
        .page-list { list-style:none; padding:0; margin:0; }
        .page-list li { margin:0; }
        .page-list a {
            display:flex; align-items:center; gap:14px;
            padding:14px 18px; margin:6px 0;
            border-left:2px solid var(--border-glow);
            border-radius:0 8px 8px 0;
            color:var(--text-primary); text-decoration:none;
            font-size:1.06rem; transition:all .25s ease;
            background:rgba(255,255,255,0.01);
        }
        .page-list a:hover {
            border-left-color:var(--gold);
            background:rgba(201,168,76,0.06);
            color:var(--gold);
            padding-left: 22px;
        }
        .page-list a::before {
            content:'›'; font-family:'Cinzel',serif; color:var(--gold);
            font-size:1.1rem; opacity:0.6; flex-shrink:0;
        }
        .page-list a:hover::before { opacity:1; }
        .wiki-tree { list-style:none; padding:0; margin:0; }
        .wiki-tree ul {
            list-style:none;
            padding-left: 26px;
            margin: 0;
            position: relative;
        }
        .wiki-tree ul::before {
            content: '';
            position: absolute;
            left: 10px;
            top: 0;
            bottom: 0;
            width: 1px;
            background: linear-gradient(180deg, var(--border-glow-strong), var(--border-glow) 60%, transparent);
        }
        .wiki-tree-root { border: 1px solid var(--border-glow); border-radius: var(--radius); padding: 16px 18px; transition: all .25s ease; position: relative; }
        .wiki-tree-root.drag-over { background: rgba(201,168,76,0.08); border-color: var(--gold); box-shadow: inset 0 0 24px rgba(201,168,76,0.06); }
        .tree-root-label { display:block; font-family:'Cinzel',serif; color:var(--text-secondary); font-size:0.72rem; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:12px; }
        .wiki-tree li { margin: 0; position: relative; }
        .wiki-tree .tree-item {
            display:flex; align-items:center; gap:10px;
            padding: 9px 12px; margin: 3px 0;
            border-radius: 8px;
            color: var(--text-primary); text-decoration: none;
            font-size: 1.04rem; transition: all .2s ease;
            background: rgba(255,255,255,0.01);
            border: 1px solid transparent;
            cursor: default; user-select: none;
            position: relative;
        }
        .wiki-tree .tree-item:hover {
            background: rgba(201,168,76,0.06);
            border-color: var(--border-glow);
        }
        .wiki-tree .tree-item:focus-visible {
            outline: 2px solid var(--gold);
            outline-offset: -2px;
            background: rgba(201,168,76,0.08);
        }
        .wiki-tree .tree-item.dragging {
            opacity: 0.35;
            box-shadow: 0 8px 28px rgba(0,0,0,0.4);
        }
        .wiki-tree .tree-item.drag-over {
            background: rgba(201,168,76,0.1);
            border-color: var(--gold);
            box-shadow: inset 0 0 18px rgba(201,168,76,0.06);
        }
        .wiki-tree .tree-item .tree-handle {
            width: 18px; height: 18px; display:flex; align-items:center; justify-content:center;
            color: rgba(168,152,122,0.35); cursor: grab; flex-shrink: 0;
            transition: color .2s ease;
        }
        .wiki-tree .tree-item .tree-handle:hover { color: var(--gold); }
        .wiki-tree .tree-item .tree-handle:active { cursor: grabbing; }
        .wiki-tree .tree-item .tree-icon {
            width: 20px; height: 20px; display:flex; align-items:center; justify-content:center;
            color: var(--gold); flex-shrink: 0; font-size: 0.95rem;
        }
        .wiki-tree .tree-item .tree-toggle {
            width: 22px; height: 22px; display:flex; align-items:center; justify-content:center;
            border-radius: 5px; color: var(--gold); transition: transform .2s ease; flex-shrink: 0;
            cursor: pointer; background: transparent; border: none; padding: 0; font: inherit;
        }
        .wiki-tree .tree-item .tree-toggle:hover { background: rgba(201,168,76,0.1); }
        .wiki-tree .tree-item .tree-toggle:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
        .wiki-tree .tree-item.collapsed .tree-toggle { transform: rotate(-90deg); }
        .wiki-tree .tree-item .tree-label {
            flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .wiki-tree .tree-item .tree-label a { color: inherit; text-decoration: none; }
        .wiki-tree .tree-item .tree-actions {
            margin-left: auto; display:flex; gap: 6px; opacity: 0; transition: opacity .2s;
        }
        .wiki-tree .tree-item:hover .tree-actions { opacity: 1; }
        .wiki-tree .tree-actions button, .wiki-tree .tree-actions a {
            background: transparent; border: none; color: var(--text-secondary);
            cursor: pointer; font-size: 0.7rem; font-family: 'Cinzel', serif;
            letter-spacing: 0.6px; text-transform: uppercase; text-decoration: none;
            padding: 4px 8px; border-radius: 4px; transition: all .2s;
        }
        .wiki-tree .tree-actions button:hover, .wiki-tree .tree-actions a:hover { color: var(--gold); background: rgba(201,168,76,0.1); }
        .wiki-tree .tree-empty {
            padding: 10px 14px 10px 48px; color: var(--text-secondary); font-style: italic;
            font-size: 0.92rem; opacity: 0.65;
        }
        .tree-drop-line {
            position: absolute;
            left: 26px;
            right: 8px;
            height: 2px;
            background: var(--gold);
            box-shadow: 0 0 8px rgba(201,168,76,0.5);
            border-radius: 1px;
            pointer-events: none;
            z-index: 10;
            opacity: 0;
            transition: opacity .1s ease;
        }
        .tree-drop-line.active { opacity: 1; }
        .wiki-tree .tree-rename {
            display:flex; gap: 8px; align-items:center; flex: 1;
        }
        .wiki-tree .tree-rename input {
            flex:1; padding: 6px 10px; background: rgba(0,0,0,0.25);
            border: 1px solid var(--border-glow-strong); border-radius: 5px;
            color: var(--text-primary); font-family: 'Cormorant Garamond', serif; font-size: 1rem;
        }
        .wiki-tree .tree-rename input:focus { outline: none; border-color: var(--gold); }
        .wiki-tree .tree-rename button {
            padding: 5px 12px; border: 1px solid var(--gold); border-radius: 5px;
            background: var(--gold); color: #0a0e1a; font-family: 'Cinzel', serif;
            font-size: 0.68rem; letter-spacing: 0.5px; text-transform: uppercase;
            cursor: pointer; font-weight: 700;
        }
        .folder-form { display:flex; gap: 10px; margin-top: 10px; }
        .folder-form input[type="text"] {
            flex:1; padding: 10px 14px;
            background:rgba(0,0,0,0.25); color:var(--text-primary);
            border:1px solid var(--border-glow); border-radius:6px;
            font-family:'Cormorant Garamond',serif; font-size:1rem;
        }
        .folder-form input[type="text"]:focus { outline:none; border-color:var(--gold); }
        .folder-form input[type="submit"] {
            font-family:'Cinzel',serif; font-size:0.75rem; letter-spacing:1px; text-transform: uppercase;
            padding:10px 22px; border:1px solid var(--gold); border-radius:6px;
            cursor:pointer; background:var(--gold); color:#0a0e1a;
            font-weight:700; transition:all .25s ease; white-space:nowrap;
        }
        .folder-form input[type="submit"]:hover { background:var(--gold-light); box-shadow: 0 0 16px rgba(201,168,76,0.14); }
        .wiki-subtitle {
            font-size:1.08rem; color:var(--text-secondary); margin-bottom:28px;
            font-style:italic;
        }
        .create-actions {
            display:flex; gap:8px; margin:10px 0 18px;
        }
        .create-trigger {
            display:flex; align-items:center; gap:8px;
            padding:8px 12px; background:transparent; border:none;
            color:var(--text-secondary); font-family:'Cinzel',serif;
            font-size:0.78rem; letter-spacing:0.6px; text-transform:uppercase;
            cursor:pointer; border-radius:6px; transition:all .2s ease;
        }
        .create-trigger:hover {
            background:rgba(201,168,76,0.08); color:var(--gold);
        }
        .create-icon {
            font-size:0.95rem; opacity:0.85;
        }
        .create-inline {
            display:none; gap:10px; align-items:center;
            margin-top:12px; padding:10px 12px;
            background:rgba(0,0,0,0.18);
            border:1px solid var(--border-glow);
            border-radius:8px;
        }
        .create-inline input[type="text"] {
            flex:1; padding:9px 12px;
            background:rgba(0,0,0,0.25); color:var(--text-primary);
            border:1px solid var(--border-glow); border-radius:5px;
            font-family:'Cormorant Garamond',serif; font-size:1rem;
        }
        .create-inline input[type="text"]:focus { outline:none; border-color:var(--gold); }
        .create-inline-actions { display:flex; gap:8px; }
        .create-submit, .create-cancel {
            padding:8px 14px; border-radius:5px;
            font-family:'Cinzel',serif; font-size:0.68rem;
            letter-spacing:0.6px; text-transform:uppercase;
            cursor:pointer; transition:all .2s;
        }
        .create-submit {
            background:var(--gold); border:1px solid var(--gold);
            color:#0a0e1a; font-weight:700;
        }
        .create-submit:hover { background:var(--gold-light); }
        .create-cancel {
            background:transparent; border:1px solid var(--border-glow-strong);
            color:var(--text-secondary);
        }
        .create-cancel:hover { border-color:var(--gold); color:var(--gold); }
        .wiki-search {
            margin-bottom:18px;
        }
        .wiki-search input[type="search"] {
            width:100%; padding:12px 18px;
            background:rgba(0,0,0,0.22); color:var(--text-primary);
            border:1px solid var(--border-glow); border-radius:8px;
            font-family:'Cormorant Garamond',serif; font-size:1.05rem;
            transition:all .25s ease;
        }
        .wiki-search input[type="search"]:focus {
            outline:none; border-color:var(--gold);
            box-shadow:0 0 18px rgba(201,168,76,0.08);
        }
        .page-count { font-size:0.85rem; color:var(--text-secondary); margin-bottom:20px; }
        .footer-credits {
            position:fixed; bottom:14px; right:18px;
            font-size:0.8rem; color:rgba(168,152,122,0.4);
            font-style:italic; letter-spacing:0.5px;
            z-index:999; pointer-events:none;
            font-family:'Cormorant Garamond',serif;
        }
        .skip-link {
            position: absolute; left: -9999px; top: auto; width: 1px; height: 1px; overflow: hidden;
        }
        .skip-link:focus {
            position: fixed; left: 16px; top: 16px; width: auto; height: auto;
            z-index: 10000;
            padding: 12px 18px;
            background: var(--bg-card); color: var(--gold);
            border: 2px solid var(--gold); border-radius: 8px;
            font-family: 'Cinzel', serif; font-size: 0.85rem; font-weight: 700;
            text-decoration: none; box-shadow: 0 8px 28px rgba(0,0,0,0.5);
        }
        :focus-visible {
            outline: 2px solid var(--gold);
            outline-offset: 2px;
        }
        .sr-only {
            position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
            overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        .wiki-layout { display: flex; gap: 28px; align-items: flex-start; }
        .wiki-main { flex: 1; min-width: 0; }
        .wiki-sidebar { width: 260px; flex-shrink: 0; }
        .infobox { background: rgba(0,0,0,0.2); border: 1px solid var(--border-glow); border-radius: var(--radius); padding: 18px; margin-bottom: 20px; }
        .infobox-title { font-family: 'Cinzel', serif; font-size: 1.1rem; color: var(--gold); margin-bottom: 4px; }
        .infobox-subtitle { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 10px; font-style: italic; }
        .infobox-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
        .infobox-tag { font-size: 0.65rem; padding: 2px 8px; border-radius: 4px; background: rgba(201,168,76,0.1); color: var(--gold); font-family: 'Cinzel', serif; letter-spacing: 0.5px; }
        .infobox-row { display: flex; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 0.85rem; }
        .infobox-key { width: 90px; flex-shrink: 0; color: var(--text-secondary); font-family: 'Cinzel', serif; font-size: 0.72rem; letter-spacing: 0.5px; text-transform: uppercase; }
        .infobox-val { flex: 1; color: var(--text-primary); }
        .wiki-toc { margin-bottom: 24px; }
        .wiki-toc h3 { font-family: 'Cinzel', serif; font-size: 0.75rem; color: var(--text-secondary); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px; }
        .wiki-toc ol { list-style: none; padding: 0; margin: 0; }
        .wiki-toc li { margin: 3px 0; font-size: 0.85rem; }
        .wiki-toc a { color: var(--text-secondary); text-decoration: none; transition: color .2s; }
        .wiki-toc a:hover { color: var(--gold); }
        .wiki-backlinks { margin-top: 20px; }
        .wiki-backlinks h3 { font-family: 'Cinzel', serif; font-size: 0.75rem; color: var(--text-secondary); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px; }
        .wiki-backlinks ul { list-style: none; padding: 0; margin: 0; }
        .wiki-backlinks li { margin: 4px 0; font-size: 0.85rem; }
        .wiki-backlinks a { color: var(--text-secondary); text-decoration: none; transition: color .2s; }
        .wiki-backlinks a:hover { color: var(--gold); }
        .wikilink.self { color: var(--text-primary); pointer-events: none; text-decoration: none; }
        @media (max-width: 860px) { .wiki-layout { flex-direction: column; } .wiki-sidebar { width: 100%; } }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.15); border-radius: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.25); border-radius: 4px; border: 2px solid transparent; background-clip: content-box; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(201,168,76,0.45); background-clip: content-box; }
        @media (max-width: 760px) {
            .wiki-nav { padding: 0 16px; }
            .wiki-wrap { padding: 24px 16px 70px; }
            .wiki-card { padding: 28px 24px; }
            .wiki-title { font-size: 1.6rem; }
            .wiki-nav .nav-links { gap: 14px; }
        }
    </style>
</head>
<body>
    <a class="skip-link" href="#main-content">${t('a11y_skip_to_content')}</a>
    <nav class="wiki-nav" aria-label="${t('a11y_nav_main')}">
        <div class="nav-brand">
            <img class="nav-logo" src="/map/${branding.favicon || 'favicon.svg'}" alt="${branding.worldName || 'Aetherion'}">
            <a href="/wiki/" aria-label="${t('nav_brand').replace('[[worldName]]', branding.worldName || 'Aetherion')}">${branding.worldName} Wiki</a>
        </div>
        <div class="nav-links">${navRight}</div>
    </nav>
    <main id="main-content" class="wiki-wrap"><div class="wiki-card">${content}</div></main>
    <div class="footer-credits">${t('footer_credits')}</div>
</body>
</html>`;
    return applyBranding(html);
}

app.get('/map/', (req, res) => {
    const filePath = path.join(MAP_DIR, 'index.html');
    const content = fs.readFileSync(filePath, 'utf-8');
    res.send(renderHtml(content));
});

app.use('/map', express.static(MAP_DIR));

app.use('/wiki/images', express.static(IMG_DIR));

app.post('/wiki/_upload', requireAdmin, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: t('upload_error') });
    res.json({ url: '/wiki/images/' + req.file.filename });
});

app.post('/api/markers', requireAdmin, (req, res) => {
    const markers = req.body.markers;
    if (!Array.isArray(markers)) return res.status(400).json({ error: 'Markers array required' });
    fs.writeFileSync(path.join(MAP_DIR, 'markers.json'), JSON.stringify(markers, null, 2), 'utf-8');
    res.json({ ok: true, count: markers.length });
});

app.get('/api/client-keys', (req, res) => {
    res.json(clientKeys());
});

app.get('/api/blocknote-locale', (req, res) => {
    const localeMap = { it: 'it', en: 'en', de: 'de', fr: 'fr', es: 'es', pt: 'pt', ru: 'ru', pl: 'pl', nl: 'nl', ja: 'ja', ko: 'ko', ar: 'ar', zh: 'zh', no: 'no', uk: 'uk', vi: 'vi', hr: 'hr', is: 'is', fa: 'fa', he: 'he', sk: 'sk', 'zh-tw': 'zh-tw', uz: 'uz' };
    res.json({ locale: localeMap[lang] || 'en' });
});

app.get('/api/session', (req, res) => {
    res.json({ admin: isAdmin(req) });
});

app.get('/api/wiki-pages', (req, res) => {
    const tree = buildWikiTree(WIKI_DIR, '');
    res.json(tree);
});

app.post('/api/wiki/folders', requireAdmin, (req, res) => {
    const folderPath = sanitizeWikiPath(req.body.path);
    if (!folderPath) return res.status(400).json({ error: 'Invalid folder path' });
    const dirPath = safeWikiDirPath(folderPath);
    if (!dirPath) return res.status(400).json({ error: 'Invalid folder path' });
    fs.mkdirSync(dirPath, { recursive: true });
    res.json({ ok: true, path: folderPath });
});

app.post('/api/wiki/move', requireAdmin, (req, res) => {
    const source = sanitizeWikiPath(req.body.source);
    const targetParent = sanitizeWikiPath(req.body.target || '');
    const type = req.body.type === 'folder' ? 'folder' : 'page';
    if (!source) return res.status(400).json({ error: 'Invalid source' });

    const sourceName = path.basename(source);
    const targetName = sanitizeWikiPath(req.body.name || sourceName) || sourceName;

    if (type === 'page') {
        const sourceFile = safeWikiFilePath(source);
        const targetFile = safeWikiFilePath(targetParent ? `${targetParent}/${targetName}` : targetName);
        if (!sourceFile || !targetFile) return res.status(400).json({ error: 'Invalid path' });
        if (!fs.existsSync(sourceFile)) return res.status(404).json({ error: 'Source not found' });
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        fs.renameSync(sourceFile, targetFile);

        const sourceVDir = wikiVersionsDirPath(source);
        const targetVDir = wikiVersionsDirPath(targetParent ? `${targetParent}/${targetName}` : targetName);
        if (sourceVDir && targetVDir && fs.existsSync(sourceVDir)) {
            fs.mkdirSync(path.dirname(targetVDir), { recursive: true });
            fs.renameSync(sourceVDir, targetVDir);
        }
        cleanupEmptyFolders(path.dirname(sourceFile));
        cleanupEmptyFolders(path.dirname(sourceVDir));
        return res.json({ ok: true, path: targetParent ? `${targetParent}/${targetName}` : targetName });
    }

    const sourceDir = safeWikiDirPath(source);
    const targetDir = safeWikiDirPath(targetParent ? `${targetParent}/${targetName}` : targetName);
    if (!sourceDir || !targetDir) return res.status(400).json({ error: 'Invalid path' });
    if (!fs.existsSync(sourceDir)) return res.status(404).json({ error: 'Source not found' });
    if (targetDir.startsWith(sourceDir + path.sep) || targetDir === sourceDir) {
        return res.status(400).json({ error: 'Cannot move folder into itself' });
    }
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.renameSync(sourceDir, targetDir);

    const sourceVDir = wikiVersionsDirPath(source);
    const targetVDir = wikiVersionsDirPath(targetParent ? `${targetParent}/${targetName}` : targetName);
    if (sourceVDir && targetVDir && fs.existsSync(sourceVDir)) {
        fs.mkdirSync(path.dirname(targetVDir), { recursive: true });
        fs.renameSync(sourceVDir, targetVDir);
    }
    cleanupEmptyFolders(path.dirname(sourceDir));
    cleanupEmptyFolders(path.dirname(sourceVDir));
    return res.json({ ok: true, path: targetParent ? `${targetParent}/${targetName}` : targetName });
});

app.post('/api/wiki/delete-folder', requireAdmin, (req, res) => {
    const folderPath = sanitizeWikiPath(req.body.path);
    if (!folderPath) return res.status(400).json({ error: 'Invalid folder path' });
    const dirPath = safeWikiDirPath(folderPath);
    if (!dirPath) return res.status(400).json({ error: 'Invalid folder path' });
    if (!fs.existsSync(dirPath)) return res.status(404).json({ error: 'Folder not found' });
    const entries = fs.readdirSync(dirPath);
    if (entries.length > 0) return res.status(400).json({ error: 'Folder is not empty' });
    fs.rmdirSync(dirPath);
    cleanupEmptyFolders(path.dirname(dirPath));
    res.json({ ok: true });
});

app.post('/api/wiki/order', requireAdmin, (req, res) => {
    const parent = sanitizeWikiPath(req.body.parent || '');
    const items = Array.isArray(req.body.items) ? req.body.items.map(sanitizeWikiPath).filter(Boolean) : [];
    const order = loadOrder();
    order[parent] = items;
    saveOrder(order);
    res.json({ ok: true });
});

app.get('/api/branding', (req, res) => {
    res.json(loadBranding());
});

app.post('/api/branding', requireAdmin, (req, res) => {
    const data = req.body;
    const current = loadBranding();
    const updated = {
        worldName: data.worldName || current.worldName,
        mapImage: current.mapImage,
        mapWidth: data.mapWidth || current.mapWidth,
        mapHeight: data.mapHeight || current.mapHeight,
        favicon: data.favicon || current.favicon,
        ogTitle: data.ogTitle !== undefined ? data.ogTitle : (current.ogTitle || ''),
        ogDescription: data.ogDescription !== undefined ? data.ogDescription : (current.ogDescription || ''),
        ogImage: data.ogImage !== undefined ? data.ogImage : (current.ogImage || ''),
        wikiSubtitle: data.wikiSubtitle !== undefined ? data.wikiSubtitle : (current.wikiSubtitle || ''),
        colors: {
            gold: data.colors?.gold || current.colors.gold,
            goldLight: data.colors?.goldLight || current.colors.goldLight,
            goldDark: data.colors?.goldDark || current.colors.goldDark,
            bgDeep: data.colors?.bgDeep || current.colors.bgDeep,
            textPrimary: data.colors?.textPrimary || current.colors.textPrimary,
            textSecondary: data.colors?.textSecondary || current.colors.textSecondary,
            borderGlow: data.colors?.borderGlow || current.colors.borderGlow,
            radius: data.colors?.radius || current.colors.radius,
        }
    };
    fs.writeFileSync(BRANDING_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    res.json({ ok: true });
});

const faviconUpload = multer({
    storage: multer.diskStorage({
        destination: MAP_DIR,
        filename: function (req, file, cb) {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, 'favicon' + ext);
        }
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.svg', '.png', '.ico', '.jpg', '.jpeg', '.webp'].includes(ext)) cb(null, true);
        else cb(new Error('Invalid favicon format'));
    }
});

app.post('/api/branding/favicon', requireAdmin, faviconUpload.single('favicon'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const branding = loadBranding();
    branding.favicon = req.file.filename;
    fs.writeFileSync(BRANDING_FILE, JSON.stringify(branding, null, 2), 'utf-8');
    res.json({ ok: true, filename: req.file.filename });
});

const ogUpload = multer({
    storage: multer.diskStorage({
        destination: MAP_DIR,
        filename: function (req, file, cb) {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, 'og-image' + ext);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) cb(null, true);
        else cb(new Error('Invalid image format'));
    }
});

app.post('/api/branding/og-image', requireAdmin, ogUpload.single('ogImage'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const branding = loadBranding();
    branding.ogImage = req.file.filename;
    fs.writeFileSync(BRANDING_FILE, JSON.stringify(branding, null, 2), 'utf-8');
    res.json({ ok: true, filename: req.file.filename });
});

app.post('/api/branding/map', requireAdmin, mapUpload.single('mapImage'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const branding = loadBranding();
    branding.mapImage = req.file.filename;
    fs.writeFileSync(BRANDING_FILE, JSON.stringify(branding, null, 2), 'utf-8');
    res.json({ ok: true, filename: req.file.filename });
});

app.get('/settings', requireAdmin, (req, res) => {
    const branding = loadBranding();
    const settingsPage = fs.readFileSync(path.join(MAP_DIR, 'settings.html'), 'utf-8');
    res.send(renderHtml(settingsPage));
});

app.get('/map/edit', requireAdmin, (req, res) => {
    const filePath = path.join(MAP_DIR, 'editor.html');
    const content = fs.readFileSync(filePath, 'utf-8');
    res.send(renderHtml(content));
});

function countPages(nodes) {
    let n = 0;
    for (const node of nodes) {
        if (node.type === 'page') n++;
        if (node.children) n += countPages(node.children);
    }
    return n;
}

function renderWikiTree(nodes, admin, level = 0) {
    if (!nodes || nodes.length === 0) return '';
    const isRoot = level === 0;
    const treeAttrs = isRoot ? ' role="tree" aria-label="' + t('a11y_wiki_tree') + '"' : '';
    const ulClass = isRoot ? 'wiki-tree' : 'wiki-tree-branch';
    let html = '<ul class="' + ulClass + '"' + treeAttrs + '>';
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const isFolder = node.type === 'folder';
        const isHome = node.path === 'home' && level === 0 && node.type === 'page';
        const childrenHtml = isFolder ? renderWikiTree(node.children, admin, level + 1) : '';
        const isEmptyFolder = isFolder && (!node.children || node.children.length === 0);
        const display = node.name.replace(/_/g, ' ');
        const parentPath = node.path.includes('/') ? node.path.replace(/\/[^/]+$/, '') : '';
        const dragAttrs = admin && !isHome ? `draggable="true"` : '';
        const dropAttrs = isFolder ? 'data-drop="true"' : (admin && !isHome ? `data-drop="parent" data-parent="${parentPath}"` : '');
        const handle = admin && !isHome ? '<span class="tree-handle" role="img" aria-label="' + t('a11y_tree_move_handle') + '">≡</span>' : '<span class="tree-handle" aria-hidden="true" style="visibility:hidden">≡</span>';
        const toggle = isFolder
            ? `<button type="button" class="tree-toggle" aria-expanded="true" aria-label="${t('a11y_tree_collapse')}">▾</button>`
            : '<span class="tree-toggle" aria-hidden="true" style="visibility:hidden">▾</span>';
        const icon = isFolder ? '<span class="tree-icon" aria-hidden="true">📁</span>' : (isHome ? '<span class="tree-icon" aria-hidden="true">✦</span>' : '<span class="tree-icon" aria-hidden="true">◈</span>');
        const label = isHome
            ? `<span class="tree-label"><a href="/wiki/${node.path}">${t('home_guide')}</a></span><span class="guide-badge">${t('home_guide_badge')}</span>`
            : (isFolder
                ? `<span class="tree-label" title="${node.path}">${display}</span>`
                : `<span class="tree-label" title="${node.path}"><a href="/wiki/${node.path}">${display}</a></span>`);
        const actions = admin ? `<span class="tree-actions">
            ${isFolder ? `<button type="button" class="tree-rename-btn" data-path="${node.path}" aria-label="${t('a11y_tree_action_rename')}: ${display}" draggable="false">${t('home_rename_folder')}</button>` : `<a href="/wiki/${node.path}/edit" aria-label="${t('a11y_tree_action_edit')}: ${display}" draggable="false">${t('page_view_edit')}</a>`}
        </span>` : '';
        const itemClass = isFolder ? 'tree-item folder' : 'tree-item page';
        const expandedAttr = isFolder ? ' aria-expanded="true"' : '';
        const ariaLabel = (isFolder ? t('a11y_tree_folder') : t('a11y_tree_page')) + ': ' + (isHome ? t('home_guide') : display);
        const tabIndex = (level === 0 && i === 0) ? '0' : '-1';
        html += `<li role="none">
            <div class="${itemClass}" role="treeitem" aria-level="${level + 1}" aria-selected="false" tabindex="${tabIndex}" aria-label="${ariaLabel}"${expandedAttr} data-path="${node.path}" data-type="${node.type}" ${dragAttrs} ${dropAttrs}>
                ${handle}
                ${toggle}
                ${icon}
                ${label}
                ${actions}
            </div>
            ${isEmptyFolder ? `<div class="tree-empty" role="status">${t('home_folder_empty')}</div>` : ''}
            ${childrenHtml}
        </li>`;
    }
    html += '</ul>';
    return html;
}

app.get('/wiki/', (req, res) => {
    const branding = loadBranding();
    const tree = buildWikiTree(WIKI_DIR, '');
    const totalPages = countPages(tree);
    const list = '<div class="page-count">' + t('home_page_count', { n: totalPages }) + '</div>';
    const admin = isAdmin(req);
    const treeHtml = renderWikiTree(tree, admin);
    const listHtml = treeHtml
        ? (admin ? '<div class="wiki-tree-root" data-drop="true"><span class="tree-root-label">' + t('home_tree_root') + '</span><div class="tree-drop-line"></div>' + treeHtml + '</div>' : treeHtml)
        : '<p style="color:#7a7a7a;text-align:center;padding:40px 0">' + t('home_no_pages') + '</p>';
    const createForms = admin ? `
        <div class="create-actions">
            <button type="button" class="create-trigger" data-type="page" aria-label="` + t('home_new_page_title') + `">
                <span class="create-icon">◈</span>
                <span>` + t('home_new_page_title') + `</span>
            </button>
            <button type="button" class="create-trigger" data-type="folder" aria-label="` + t('home_new_folder_title') + `">
                <span class="create-icon">📁</span>
                <span>` + t('home_new_folder_title') + `</span>
            </button>
        </div>
        <div class="create-inline" id="create-inline" style="display:none;">
            <input type="text" id="create-input" placeholder="" autocomplete="off" aria-label="">
            <div class="create-inline-actions">
                <button type="button" class="create-submit" id="create-submit">` + t('home_new_page_btn') + `</button>
                <button type="button" class="create-cancel" id="create-cancel">` + t('home_create_cancel') + `</button>
            </div>
        </div>` : '';
    const script = admin ? `<script>
(function(){
    const dragType = 'application/x-aetherion-wiki';
    let dragSrc = null;
    let dragEl = null;
    let expandTimer = null;
    let currentDrop = null;
    let dropLine = null;
    let dropTarget = null;

    async function doMove(sourcePath, type, targetPath) {
        if (sourcePath === targetPath) return;
        if (type === 'folder' && (targetPath + '/').startsWith(sourcePath + '/')) {
            alert('${t('home_move_error_self')}'); return;
        }
        try {
            const r = await fetch('/api/wiki/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: sourcePath, target: targetPath, type: type })
            });
            if (!r.ok) throw new Error();
            window.location.reload();
        } catch (err) {
            alert('${t('home_move_error')}');
        }
    }

    async function doReorder(parent, items) {
        try {
            const r = await fetch('/api/wiki/order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parent: parent, items: items })
            });
            if (!r.ok) throw new Error();
            window.location.reload();
        } catch (err) {
            alert('${t('home_move_error')}');
        }
    }

    function expandItem(item) {
        if (!item.classList.contains('folder') || !item.classList.contains('collapsed')) return;
        const ul = item.closest('li').querySelector('ul');
        if (ul) {
            ul.style.display = '';
            item.classList.remove('collapsed');
        }
    }

    function clearExpandTimer() {
        if (expandTimer) { clearTimeout(expandTimer); expandTimer = null; }
    }

    function setDrop(el, active) {
        if (currentDrop && currentDrop !== el) currentDrop.classList.remove('drag-over');
        if (active) {
            el.classList.add('drag-over');
            currentDrop = el;
        } else if (currentDrop === el) {
            el.classList.remove('drag-over');
            currentDrop = null;
        }
    }

    function clearDrop() {
        if (currentDrop) {
            currentDrop.classList.remove('drag-over');
            currentDrop = null;
        }
        clearExpandTimer();
        hideDropLine();
    }

    function parentPathOf(itemPath) {
        const i = itemPath.lastIndexOf('/');
        return i > 0 ? itemPath.slice(0, i) : '';
    }

    function siblingItems(item) {
        const li = item.closest('li');
        const ul = li.parentElement;
        return Array.from(ul.children).map(li => li.querySelector('.tree-item')).filter(Boolean);
    }

    function showDropLine(item, position) {
        if (!dropLine) return;
        const rect = item.getBoundingClientRect();
        const rootRect = rootDrop.getBoundingClientRect();
        const top = position === 'before'
            ? rect.top - rootRect.top - 1
            : rect.bottom - rootRect.top - 1;
        dropLine.style.top = top + 'px';
        dropLine.classList.add('active');
    }

    function hideDropLine() {
        if (dropLine) dropLine.classList.remove('active');
        dropTarget = null;
    }

    function computeDrop(e) {
        const item = e.target.closest('.tree-item');
        if (!item) return { mode: 'move', target: '' };
        if (item === dragEl) return null;

        const rect = item.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const edge = rect.height * 0.3;
        const nearEdge = relY < edge || relY > rect.height - edge;

        if (nearEdge) {
            const siblings = siblingItems(item);
            const targetIndex = siblings.indexOf(item);
            const position = relY < edge ? 'before' : 'after';
            const parentLi = item.closest('li').parentElement.closest('li');
            const parent = parentLi ? parentLi.querySelector('.tree-item').dataset.path : '';

            if (dragSrc && parentPathOf(dragSrc.path) === parent) {
                return { mode: 'reorder', parent: parent, item: item, position: position, siblings: siblings, targetIndex: targetIndex };
            }
            // Different parent: move to this parent at the calculated position
            return { mode: 'move-position', target: parent, item: item, position: position, siblings: siblings, targetIndex: targetIndex };
        }

        if (item.dataset.drop === 'true') {
            return { mode: 'move', target: item.dataset.path };
        }
        if (item.dataset.drop === 'parent') {
            return { mode: 'move', target: item.dataset.parent };
        }
        return { mode: 'move', target: '' };
    }

    const rootDrop = document.querySelector('.wiki-tree-root');
    if (!rootDrop) return;
    dropLine = rootDrop.querySelector('.tree-drop-line');

    rootDrop.addEventListener('dragstart', e => {
        const item = e.target.closest('.tree-item');
        if (!item || !item.draggable) return;
        dragEl = item;
        dragSrc = { path: item.dataset.path, type: item.dataset.type };
        item.classList.add('dragging');
        e.dataTransfer.setData(dragType, JSON.stringify(dragSrc));
        e.dataTransfer.effectAllowed = 'move';
    });

    rootDrop.addEventListener('dragend', e => {
        if (dragEl) dragEl.classList.remove('dragging');
        clearDrop();
        dragSrc = null;
        dragEl = null;
    });

    rootDrop.addEventListener('dragover', e => {
        e.preventDefault();
        if (!dragSrc) return;
        const drop = computeDrop(e);
        if (!drop) { clearDrop(); return; }

        if (drop.mode === 'reorder' || drop.mode === 'move-position') {
            setDrop(rootDrop, false);
            setDrop(drop.item, false);
            clearExpandTimer();
            showDropLine(drop.item, drop.position);
            dropTarget = drop;
            if (drop.mode === 'move-position' && drop.item.classList.contains('folder')) {
                clearExpandTimer();
                expandTimer = setTimeout(() => expandItem(drop.item), 800);
            }
        } else if (drop.mode === 'move') {
            hideDropLine();
            if (drop.target === '') {
                setDrop(rootDrop, true);
            } else {
                const item = document.querySelector('.tree-item[data-path="' + drop.target.replace(/"/g, '\\"') + '"]');
                if (item) setDrop(item, true);
                clearExpandTimer();
                expandTimer = setTimeout(() => expandItem(item), 500);
            }
            dropTarget = drop;
        }
    });

    rootDrop.addEventListener('dragleave', e => {
        if (!rootDrop.contains(e.relatedTarget)) clearDrop();
    });

    rootDrop.addEventListener('drop', async e => {
        e.preventDefault();
        if (!dragSrc || !dropTarget) return;
        const drop = dropTarget;
        clearDrop();

        if (drop.mode === 'reorder') {
            const siblings = siblingItems(drop.item).filter(s => s.dataset.path);
            const draggedName = dragSrc.path.split('/').pop();
            const names = siblings.map(s => s.dataset.path.split('/').pop()).filter(n => n !== draggedName);
            const targetName = drop.item.dataset.path ? drop.item.dataset.path.split('/').pop() : '';
            const insertIndex = drop.position === 'before' ? names.indexOf(targetName) : names.indexOf(targetName) + 1;
            names.splice(Math.max(0, insertIndex), 0, draggedName);
            await doReorder(drop.parent, names);
        } else if (drop.mode === 'move-position') {
            // Move to target parent, then reorder
            await doMove(dragSrc.path, dragSrc.type, drop.target);
            // Order will be refreshed on reload; server doesn't know exact position yet.
            // A second request could reorder, but for now move places item at end of order.
        } else if (drop.mode === 'move') {
            await doMove(dragSrc.path, dragSrc.type, drop.target);
        }
    });

    const createTriggers = document.querySelectorAll('.create-trigger');
    const createInline = document.getElementById('create-inline');
    const createInput = document.getElementById('create-input');
    const createSubmit = document.getElementById('create-submit');
    const createCancel = document.getElementById('create-cancel');
    let createType = 'page';

    function closeCreateInline() {
        if (createInline) createInline.style.display = 'none';
        if (createInput) createInput.value = '';
    }

    createTriggers.forEach(trigger => {
        trigger.addEventListener('click', () => {
            createType = trigger.dataset.type;
            if (!createInline || !createInput || !createSubmit) return;
            createInline.style.display = 'flex';
            if (createType === 'page') {
                createInput.placeholder = '${t('home_new_page_placeholder')}';
                createInput.setAttribute('aria-label', '${t('home_new_page_title')}');
                createSubmit.textContent = '${t('home_new_page_btn')}';
            } else {
                createInput.placeholder = '${t('home_new_folder_placeholder')}';
                createInput.setAttribute('aria-label', '${t('home_new_folder_title')}');
                createSubmit.textContent = '${t('home_new_folder_btn')}';
            }
            createInput.focus();
        });
    });

    if (createCancel) createCancel.addEventListener('click', closeCreateInline);

    async function submitCreate() {
        if (!createInput) return;
        const name = createInput.value.trim();
        if (!name) return;
        if (createType === 'page') {
            window.location.href = '/wiki/_create?title=' + encodeURIComponent(name);
        } else {
            try {
                const r = await fetch('/api/wiki/folders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: name })
                });
                if (!r.ok) throw new Error();
                window.location.reload();
            } catch (err) {
                alert('${t('home_folder_error')}');
            }
        }
    }

    if (createSubmit) createSubmit.addEventListener('click', submitCreate);
    if (createInput) {
        createInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') submitCreate();
            if (e.key === 'Escape') closeCreateInline();
        });
    }

    document.querySelectorAll('.wiki-tree .tree-rename-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const item = btn.closest('.tree-item');
            const label = item.querySelector('.tree-label');
            const oldPath = btn.dataset.path;
            const oldName = oldPath.split('/').pop();
            const parent = oldPath.includes('/') ? oldPath.replace(/\\/[^/]+$/, '') : '';
            label.innerHTML = '<span class="tree-rename"><input type="text" value="' + oldName.replace(/"/g, '&quot;') + '"><button type="button">${t('home_rename_folder')}</button></span>';
            const input = label.querySelector('input');
            const confirm = label.querySelector('button');
            input.focus();
            input.select();

            async function submit() {
                const newName = input.value.trim().replace(/[^a-zA-Z0-9_\\- ]/g, '').replace(/\\s+/g, '_');
                if (!newName || newName === oldName) {
                    label.textContent = oldName.replace(/_/g, ' ');
                    return;
                }
                const newPath = parent ? parent + '/' + newName : newName;
                try {
                    const r = await fetch('/api/wiki/move', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ source: oldPath, target: parent, type: 'folder', name: newName })
                    });
                    if (!r.ok) throw new Error();
                    window.location.reload();
                } catch (err) {
                    alert('${t('home_rename_error')}');
                    label.textContent = oldName.replace(/_/g, ' ');
                }
            }

            confirm.addEventListener('click', submit);
            input.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') submit();
                if (ev.key === 'Escape') label.textContent = oldName.replace(/_/g, ' ');
            });
            input.addEventListener('blur', () => setTimeout(() => { if (label.querySelector('input')) label.textContent = oldName.replace(/_/g, ' '); }, 200));
        });
    });
})();
</script>` : '';
    const toggleScript = `<script>
(function(){
    const expandLabel = '${t('a11y_tree_expand')}';
    const collapseLabel = '${t('a11y_tree_collapse')}';
    function syncToggle(toggle, expanded) {
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        toggle.setAttribute('aria-label', expanded ? collapseLabel : expandLabel);
    }
    function toggleItem(item, show) {
        const li = item.closest('li');
        const ul = li.querySelector(':scope > ul');
        const toggle = item.querySelector('.tree-toggle');
        if (!ul) return false;
        if (show === undefined) show = ul.style.display === 'none';
        ul.style.display = show ? '' : 'none';
        item.classList.toggle('collapsed', !show);
        item.setAttribute('aria-expanded', show ? 'true' : 'false');
        if (toggle && toggle.tagName === 'BUTTON') syncToggle(toggle, show);
        return true;
    }
    const tree = document.querySelector('.wiki-tree');
    if (!tree) return;

    document.querySelectorAll('.wiki-tree .tree-toggle').forEach(toggle => {
        toggle.addEventListener('click', e => {
            e.stopPropagation();
            const item = toggle.closest('.tree-item');
            toggleItem(item);
        });
    });

    // Keyboard navigation for the ARIA tree
    function visibleItems() {
        return Array.from(document.querySelectorAll('.wiki-tree .tree-item')).filter(item => {
            let el = item.parentElement;
            while (el && el.classList && !el.classList.contains('wiki-tree')) {
                if (el.tagName === 'UL' && el.style.display === 'none') return false;
                el = el.parentElement;
            }
            return true;
        });
    }
    function focusItem(item) {
        if (!item) return;
        document.querySelectorAll('.wiki-tree .tree-item').forEach(i => i.setAttribute('tabindex', '-1'));
        item.setAttribute('tabindex', '0');
        item.focus();
    }
    function isFolder(item) { return item.classList.contains('folder'); }
    function isExpanded(item) { return item.getAttribute('aria-expanded') !== 'false'; }
    function parentItem(item) {
        const parentUl = item.closest('ul');
        if (!parentUl || parentUl.classList.contains('wiki-tree')) return null;
        const parentLi = parentUl.closest('li');
        return parentLi ? parentLi.querySelector(':scope > .tree-item') : null;
    }
    function firstChild(item) {
        const ul = item.closest('li').querySelector(':scope > ul');
        if (!ul) return null;
        return ul.querySelector(':scope > li > .tree-item');
    }
    document.querySelector('.wiki-tree').addEventListener('keydown', e => {
        const item = document.activeElement.closest('.tree-item');
        if (!item) return;
        const items = visibleItems();
        const idx = items.indexOf(item);
        let next = null;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            next = items[idx + 1] || items[items.length - 1];
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            next = items[idx - 1] || items[0];
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (isFolder(item) && !isExpanded(item)) toggleItem(item, true);
            else if (isFolder(item) && isExpanded(item)) next = firstChild(item);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (isFolder(item) && isExpanded(item)) toggleItem(item, false);
            else next = parentItem(item);
        } else if (e.key === 'Home') {
            e.preventDefault();
            next = items[0];
        } else if (e.key === 'End') {
            e.preventDefault();
            next = items[items.length - 1];
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isFolder(item)) toggleItem(item);
            else {
                const link = item.querySelector('.tree-label a');
                if (link) link.click();
            }
        }
        focusItem(next);
    });

    // Wiki tree search
    const searchInput = document.getElementById('wiki-search-input');
    const searchStatus = document.getElementById('wiki-search-status');
    if (searchInput) {
        function markMatch(item, term) {
            const text = (item.getAttribute('aria-label') || '').toLowerCase();
            const directMatch = !term || text.includes(term);
            const childUl = item.closest('li').querySelector(':scope > ul');
            let childMatch = false;
            if (childUl) {
                const childItems = childUl.querySelectorAll(':scope > li > .tree-item');
                for (const child of childItems) {
                    if (markMatch(child, term)) childMatch = true;
                }
            }
            const show = directMatch || childMatch;
            item.dataset.searchMatch = show ? '1' : '';
            return show;
        }
        searchInput.addEventListener('input', () => {
            const term = searchInput.value.trim().toLowerCase();
            const rootItems = tree.querySelectorAll(':scope > li > .tree-item');
            rootItems.forEach(item => markMatch(item, term));
            let visibleCount = 0;
            document.querySelectorAll('.wiki-tree .tree-item').forEach(item => {
                const show = item.dataset.searchMatch === '1';
                const li = item.closest('li');
                li.style.display = show ? '' : 'none';
                if (show) {
                    visibleCount++;
                    const toggle = item.querySelector('.tree-toggle');
                    if (toggle && item.classList.contains('folder')) {
                        const ul = li.querySelector(':scope > ul');
                        if (ul) {
                            ul.style.display = '';
                            item.classList.remove('collapsed');
                            item.setAttribute('aria-expanded', 'true');
                            syncToggle(toggle, true);
                        }
                    }
                }
            });
            if (searchStatus) {
                searchStatus.textContent = term ? '${t('wiki_search_results', { n: '__COUNT__' })}'.replace('__COUNT__', visibleCount) : '';
            }
        });
    }
})();
</script>`;
    const wikiSubtitle = (branding.wikiSubtitle || t('home_subtitle')).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const searchHtml = treeHtml ? `
        <div class="wiki-search" role="search">
            <label class="sr-only" for="wiki-search-input">${t('wiki_search_label')}</label>
            <input type="search" id="wiki-search-input" placeholder="${t('wiki_search_placeholder')}" autocomplete="off">
            <div id="wiki-search-status" class="sr-only" aria-live="polite"></div>
        </div>` : '';
    const content = `<h1 class="wiki-title">${branding.worldName} ${t('home_title')}</h1>
        ${createForms}
        <p class="wiki-subtitle">${wikiSubtitle}</p>
        ${searchHtml}
        ${list}
        ${listHtml}
        ${script}
        ${toggleScript}`;
    res.send(wikiLayout('Home', content, admin));
});

app.get('/wiki/_create', requireAdmin, (req, res) => {
    const title = sanitizeWikiPath(req.query.title || '');
    if (!title) return res.redirect('/wiki/');
    res.redirect('/wiki/' + title + '/edit');
});

app.get('/login/', (req, res) => {
    if (isAdmin(req)) return res.redirect(req.query.redirect || '/wiki/');
    const redirect = req.query.redirect ? encodeURIComponent(req.query.redirect) : '';
    const error = req.query.error ? '<p class="login-error">' + t('login_invalid') + '</p>' : '';
    res.send(wikiLayout(t('login_title'), `
        <form class="login-form" method="POST" action="/login/">
            <h2 class="wiki-title" style="border:none">${t('login_heading')}</h2>
            <input type="hidden" name="redirect" value="${redirect}">
            <label class="sr-only" for="login-username">${t('login_username_label')}</label>
            <input id="login-username" type="text" name="username" placeholder="` + t('login_username_placeholder') + `" autocomplete="username" required>
            <label class="sr-only" for="login-password">${t('login_password_label')}</label>
            <input id="login-password" type="password" name="password" placeholder="` + t('login_password_placeholder') + `" autocomplete="current-password" required>
            <input type="submit" value="` + t('login_submit') + `">
            ${error}
        </form>
    `, isAdmin(req)));
});

app.post('/login/', (req, res) => {
    if (req.body.username === ADMIN_USER && req.body.password === ADMIN_PASS) {
        req.session.admin = true;
        return res.redirect(req.body.redirect || '/wiki/');
    }
    res.redirect('/login/?error=1' + (req.body.redirect ? '&redirect=' + encodeURIComponent(req.body.redirect) : ''));
});

app.get('/logout/', (req, res) => {
    req.session.destroy(() => res.redirect('/wiki/'));
});

app.get(/^\/wiki\/(.+)\/edit$/, requireAdmin, (req, res) => {
    const page = sanitizeWikiPath(req.params[0]);
    if (!page) return res.redirect('/wiki/');
    const editorHtml = fs.readFileSync(path.join(__dirname, 'public', 'editor-assets', 'index.html'), 'utf-8');
    res.send(renderHtml(editorHtml));
});

app.get(/^\/api\/wiki\/(.+)\/content$/, requireAdmin, (req, res) => {
    const page = sanitizeWikiPath(req.params[0]);
    if (!page) return res.status(404).type('text').send('Page not found');
    const filePath = safeWikiFilePath(page);
    if (!filePath) return res.status(400).type('text').send('Invalid path');
    if (!fs.existsSync(filePath)) return res.type('text').send('');
    res.type('text').send(fs.readFileSync(filePath, 'utf-8'));
});

app.post(/^\/wiki\/(.+)\/preview$/, requireAdmin, (req, res) => {
    const page = sanitizeWikiPath(req.params[0]);
    const display = pageDisplayName(page);
    const md = req.body.content || '';
    const body = marked.parse(md);
    res.send(wikiLayout(t('preview_title', { page: display }), `
        <h1 class="wiki-title">${t('preview_heading', { page: display })}</h1>
        <div style="margin-bottom:20px"><a href="/wiki/${page}/edit" class="wiki-back-btn">${t('preview_back')}</a></div>
        <div class="wiki-content">${body}</div>
    `, true));
});

app.post(/^\/wiki\/(.+)\/delete$/, requireAdmin, (req, res) => {
    const page = sanitizeWikiPath(req.params[0]);
    if (!page) return res.redirect('/wiki/');
    const filePath = safeWikiFilePath(page);
    if (!filePath) return res.status(400).send('Invalid path');
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        const vDir = wikiVersionsDirPath(page);
        if (vDir && fs.existsSync(vDir)) {
            fs.rmSync(vDir, { recursive: true, force: true });
        }
        cleanupEmptyFolders(path.dirname(filePath));
    }
    res.redirect('/wiki/');
});

app.post(/^\/wiki\/(.+)\/versions\/(.+)\/restore$/, requireAdmin, (req, res) => {
    const page = sanitizeWikiPath(req.params[0]);
    const ts = (req.params[1] || '').replace(/[^0-9]/g, '');
    if (!page || !ts) return res.redirect('/wiki/');
    const bakDir = ensureWikiVersionsDir(page);
    if (!bakDir) return res.status(400).send('Invalid path');
    const bak = path.join(bakDir, ts + '.md.bak');
    const target = safeWikiFilePath(page);
    if (!target) return res.status(400).send('Invalid path');
    if (fs.existsSync(bak)) {
        if (fs.existsSync(target)) {
            fs.copyFileSync(target, path.join(bakDir, Date.now() + '.md.bak'));
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(bak, target);
    }
    res.redirect('/wiki/' + page);
});

app.post(/^\/wiki\/(.+)$/, requireAdmin, (req, res) => {
    const page = sanitizeWikiPath(req.params[0]);
    if (!page) return res.redirect('/wiki/');
    const filePath = safeWikiFilePath(page);
    if (!filePath) return res.status(400).send('Invalid path');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (fs.existsSync(filePath)) {
        const bakDir = ensureWikiVersionsDir(page);
        if (!bakDir) return res.status(400).send('Invalid path');
        fs.copyFileSync(filePath, path.join(bakDir, Date.now() + '.md.bak'));
        const vers = fs.readdirSync(bakDir).filter(f => f.endsWith('.bak')).sort();
        while (vers.length > 50) {
            fs.unlinkSync(path.join(bakDir, vers.shift()));
        }
    }

    fs.writeFileSync(filePath, req.body.content || '', 'utf-8');
    markBacklinksDirty();

    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
        return res.json({ ok: true, page: page });
    }

    res.redirect(`/wiki/${page}`);
});

app.get(/^\/wiki\/(.+)\/versions$/, requireAdmin, (req, res) => {
    const page = sanitizeWikiPath(req.params[0]);
    if (!page) return res.redirect('/wiki/');
    const vDir = ensureWikiVersionsDir(page);
    if (!vDir) return res.status(400).send('Invalid path');
    let versions = [];
    if (fs.existsSync(vDir)) {
        versions = fs.readdirSync(vDir).filter(f => f.endsWith('.bak'))
            .map(f => {
                const ts = parseInt(f);
                const s = fs.statSync(path.join(vDir, f));
                return { ts, file: f, date: s.mtime.toLocaleDateString(translations.locale, { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' }) };
            })
            .sort((a, b) => b.ts - a.ts);
    }
    const display = pageDisplayName(page);
    const list = versions.length
        ? versions.map(v => `<li style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(201,168,76,0.08)">
            <span style="color:#b8b4a8">${v.date}</span>
            <form method="POST" action="/wiki/${page}/versions/${v.ts}/restore" style="display:inline">
                <button type="submit" class="wiki-back-btn" onclick="return confirm('${t('history_restore_confirm')}')">${t('edit_btn_history')}</button>
            </form>
        </li>`).join('\n')
        : '<p style="color:#7a7a7a;text-align:center;padding:40px 0">' + t('history_none') + '</p>';
    res.send(wikiLayout(t('history_title', { page: display }), `
        <h1 class="wiki-title">${t('history_heading', { page: display })}</h1>
        <p style="margin-bottom:24px"><a href="/wiki/${page}" class="wiki-back-btn">${t('history_back')}</a> <a href="/wiki/${page}/edit" class="wiki-back-btn" style="margin-left:8px">${t('history_edit')}</a></p>
        ${list}`, true));
});

app.get(/^\/wiki\/(.+)$/, (req, res) => {
    const page = sanitizeWikiPath(req.params[0]);
    if (!page) return res.redirect('/wiki/');
    const filePath = safeWikiFilePath(page);
    if (!filePath) return res.status(400).send('Invalid path');
    const admin = isAdmin(req);
    const display = pageDisplayName(page);

    if (!fs.existsSync(filePath)) {
        const content = admin
            ? `<div class="error-404"><h2>404</h2><p>${t('page_not_found_msg', { page: display })}</p><p><a href="/wiki/${page}/edit">${t('page_not_found_create')}</a></p></div>`
            : `<div class="error-404"><h2>404</h2><p>${t('page_not_found_msg', { page: display })}</p></div>`;
        return res.status(404).send(wikiLayout(t('page_not_found'), content, admin));
    }

    const md = fs.readFileSync(filePath, 'utf-8');
    const { attrs, body } = renderMarkdown(md, page);
    const stats = fs.statSync(filePath);
    const date = stats.mtime.toLocaleDateString(translations.locale, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const toc = generateToc(body);
    const info = infoboxHtml(attrs);

    buildBacklinks();
    const backlinks = (backlinksCache[page] || []).map(p =>
        `<li><a href="/wiki/${encodeURIComponent(p)}">${pageDisplayName(p)}</a></li>`
    ).join('');

    const editBtns = admin ? `<p style="margin-top:40px;display:flex;gap:12px;flex-wrap:wrap">
        <a href="/wiki/${page}/edit" class="wiki-edit-btn">${t('page_view_edit')}</a>
        
        <a href="/wiki/${page}/versions" class="wiki-back-btn">${t('page_view_history')}</a>
        <form method="POST" action="/wiki/${page}/delete" style="display:inline" onsubmit="return confirm('${t('page_view_delete_confirm', { page: display })}')"><button type="submit" class="wiki-del-btn">${t('page_view_delete')}</button></form>
    </p>` : '';

    const backlinksHtml = backlinks ? `<div class="wiki-backlinks"><h3>${t('backlinks_title')}</h3><ul>${backlinks}</ul></div>` : '';

    res.send(wikiLayout(display, `
        <div class="wiki-layout">
            <div class="wiki-main">
                <h1 class="wiki-title">${display}</h1>
                <div class="wiki-meta">${t('page_view_last_modified', { date })}</div>
                ${toc}
                <div class="wiki-content">${body}</div>
                ${editBtns}
            </div>
            <div class="wiki-sidebar">
                ${info}
                ${backlinksHtml}
            </div>
        </div>
    `, admin));
});

app.get('/api/backlinks/:page', (req, res) => {
    buildBacklinks();
    const page = sanitizeWikiPath(req.params.page);
    res.json(backlinksCache[page] || []);
});

app.listen(PORT, () => {
    console.log(t('server_started', { port: PORT }));
    console.log(t('server_map') + ' http://localhost:' + PORT + '/map/');
    console.log(t('server_wiki') + ' http://localhost:' + PORT + '/wiki/');
    console.log(`Admin: ${ADMIN_USER} / ${ADMIN_PASS}`);
});
