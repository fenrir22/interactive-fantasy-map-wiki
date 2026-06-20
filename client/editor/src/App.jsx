import { useEffect, useMemo, useRef, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import * as locales from '@blocknote/core/locales';
import '@blocknote/mantine/style.css';

function applyBrandingColors(data) {
    if (!data || !data.colors) return;
    const root = document.documentElement;
    const c = data.colors;
    if (c.gold) root.style.setProperty('--gold', c.gold);
    if (c.goldLight) root.style.setProperty('--gold-light', c.goldLight);
    if (c.goldDark) root.style.setProperty('--gold-dark', c.goldDark);
    if (c.bgDeep) root.style.setProperty('--bg-deep', c.bgDeep);
    if (c.textPrimary) root.style.setProperty('--text-primary', c.textPrimary);
    if (c.textSecondary) root.style.setProperty('--text-secondary', c.textSecondary);
    if (c.borderGlow) root.style.setProperty('--border-glow', c.borderGlow);
    if (c.radius) root.style.setProperty('--radius', c.radius);
}

function App() {
    const [page, setPage] = useState('');
    const [markdown, setMarkdown] = useState('');
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [branding, setBranding] = useState(null);
    const [t, setT] = useState(() => (key) => key);
    const [blocknoteDict, setBlocknoteDict] = useState(null);
    const [folders, setFolders] = useState([]);
    const [moveTarget, setMoveTarget] = useState('_placeholder');
    const [moveAnnounce, setMoveAnnounce] = useState('');
    const loadStarted = useRef(false);

    const pageName = useMemo(() => {
        const m = window.location.pathname.match(/\/wiki\/(.+)\/edit$/);
        return m ? decodeURIComponent(m[1]) : '';
    }, []);

    const currentFolder = useMemo(() => {
        return pageName.includes('/') ? pageName.replace(/\/[^/]+$/, '') : '';
    }, [pageName]);

    function displayFolder(folderPath) {
        return folderPath ? folderPath.replace(/\//g, ' / ') : t('edit_move_root');
    }

    const editor = useCreateBlockNote({
        uploadFile: handleUpload,
        onChange: () => {
            setIsDirty(true);
            setSaveStatus('dirty');
        },
    });

    useEffect(() => {
        Promise.all([
            fetch('/api/branding?' + Date.now()).then((r) => r.json()),
            fetch('/api/client-keys?' + Date.now()).then((r) => r.json()),
            fetch('/api/blocknote-locale?' + Date.now()).then((r) => r.json()),
        ])
            .then(([brandingData, keys, localeData]) => {
                setBranding(brandingData);
                applyBrandingColors(brandingData);
                const dict = locales[localeData.locale];
                if (dict) {
                    const merged = { branding: brandingData, ...dict };
                    setBlocknoteDict(merged);
                } else {
                    setBlocknoteDict(null);
                }
                const tFn = (key, vars) => {
                    let val = keys[key];
                    if (val === undefined) val = key;
                    if (vars) {
                        for (const [k, v] of Object.entries(vars)) {
                            val = val.split('${' + k + '}').join(v);
                        }
                    }
                    return val;
                };
                setT(() => tFn);
                if (brandingData.worldName) {
                    document.title = tFn('edit_title', { page: pageName }).replace('[[worldName]]', brandingData.worldName);
                }
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (loadStarted.current) return;
        loadStarted.current = true;
        setPage(pageName);
        if (!pageName) {
            setLoading(false);
            return;
        }
        fetch('/api/wiki-pages?' + Date.now())
            .then((r) => r.json())
            .then((tree) => {
                const list = [];
                function walk(nodes) {
                    for (const n of nodes) {
                        if (n.type === 'folder') {
                            list.push(n.path);
                            if (n.children) walk(n.children);
                        }
                    }
                }
                walk(tree);
                setFolders(list);
            })
            .catch(() => {});
        fetch(`/api/wiki/${encodeURIComponent(pageName)}/content`, { cache: 'no-store' })
            .then((r) => {
                if (!r.ok) throw new Error('load failed');
                return r.text();
            })
            .then((text) => {
                setMarkdown(text);
            })
            .catch(() => {
                setMarkdown('');
            })
            .finally(() => {
                setLoading(false);
            });
    }, [pageName]);

    useEffect(() => {
        if (!editor || !markdown) return;
        const blocks = editor.tryParseMarkdownToBlocks(markdown);
        editor.replaceBlocks(editor.document, blocks);
    }, [editor, markdown]);

    async function handleUpload(file) {
        const fd = new FormData();
        fd.append('image', file);
        const r = await fetch('/wiki/_upload', { method: 'POST', body: fd });
        if (!r.ok) throw new Error('upload failed');
        const data = await r.json();
        if (!data.url) throw new Error('no url');
        return data.url;
    }

    async function handleSave() {
        if (!editor || !page || isSaving) return;
        setIsSaving(true);
        setSaveStatus('saving');
        try {
            const md = editor.blocksToMarkdownLossy(editor.document);
            const r = await fetch(`/wiki/${encodeURIComponent(page)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: 'content=' + encodeURIComponent(md),
            });
            if (r.ok) {
                setIsDirty(false);
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus(''), 3000);
            } else {
                throw new Error('save failed');
            }
        } catch (e) {
            setSaveStatus('error');
            setTimeout(() => setSaveStatus(''), 4000);
        } finally {
            setIsSaving(false);
        }
    }

    function handlePreview() {
        if (!editor) return;
        const md = editor.blocksToMarkdownLossy(editor.document);
        const f = document.createElement('form');
        f.method = 'POST';
        f.action = `/wiki/${encodeURIComponent(page)}/preview`;
        f.target = '_blank';
        const i = document.createElement('input');
        i.type = 'hidden';
        i.name = 'content';
        i.value = md;
        f.appendChild(i);
        document.body.appendChild(f);
        f.submit();
        document.body.removeChild(f);
    }

    function handleMoveTargetChange(e) {
        setMoveTarget(e.target.value);
    }

    async function handleMoveConfirm() {
        if (moveTarget === '_placeholder' || moveTarget === currentFolder) return;
        try {
            const r = await fetch('/api/wiki/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: pageName, target: moveTarget, type: 'page' }),
            });
            if (!r.ok) throw new Error();
            const pageFile = pageName.split('/').pop();
            const newPath = moveTarget ? `${moveTarget}/${pageFile}` : pageFile;
            setMoveAnnounce(
                t('edit_move_success', {
                    page: pageFile,
                    folder: moveTarget ? displayFolder(moveTarget) : t('edit_move_root'),
                })
            );
            window.location.href = `/wiki/${newPath.split('/').map(encodeURIComponent).join('/')}/edit`;
        } catch (err) {
            setMoveAnnounce(t('edit_move_error'));
            alert(t('home_move_error'));
        }
    }

    useEffect(() => {
        function onKeyDown(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [editor, page, isSaving]);

    useEffect(() => {
        function onBeforeUnload(e) {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        }
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [isDirty]);

    const displayTitle = useMemo(() => {
        if (branding?.worldName && page) {
            return `${branding.worldName} — ${page}`;
        }
        return page || pageName || 'Editor';
    }, [branding, page, pageName]);

    function statusText() {
        if (!saveStatus) return '';
        const map = { dirty: 'edit_status_unsaved', saving: 'edit_status_saving', saved: 'edit_status_saved', error: 'edit_status_error' };
        return t(map[saveStatus] || saveStatus);
    }

    if (!pageName) {
        return (
            <div className="editor-shell">
                <div className="editor-loading">{t('edit_no_page')}</div>
            </div>
        );
    }

    return (
        <div className="editor-shell">
            <header className="editor-header">
                <div className="editor-header-left">
                    <img
                        className="editor-logo"
                        src={branding?.favicon ? '/map/' + branding.favicon : '/map/favicon.svg'}
                        alt={branding?.worldName || 'Aetherion'}
                    />
                    <span className="editor-page-title">{displayTitle}</span>
                    <span className={`editor-save-status ${saveStatus}`}>{statusText()}</span>
                </div>
                <div className="editor-header-right">
                    <a className="editor-btn" href={`/wiki/${page || pageName}`} aria-label={t('wiki_back')}>
                        {t('wiki_back')}
                    </a>
                    <button className="editor-btn primary" onClick={handleSave} disabled={isSaving}>
                        {t('edit_btn_save')}
                    </button>
                    <span className="editor-header-sep">·</span>
                    <div className="editor-move-wrap">
                        <label htmlFor="move-select" className="editor-move-label">
                            <span aria-hidden="true" className="editor-move-icon">⇄</span>
                            {t('edit_btn_move')}
                        </label>
                        <div className="editor-move-row">
                            <select
                                id="move-select"
                                className="editor-move-select"
                                value={moveTarget}
                                onChange={handleMoveTargetChange}
                                aria-describedby="move-help"
                            >
                                <option value="_placeholder" disabled>{t('edit_move_choose')}</option>
                                <option value="" disabled={currentFolder === ''}>{t('edit_move_root')}</option>
                                {folders.map((f) => (
                                    <option key={f} value={f} disabled={f === currentFolder}>
                                        {f === currentFolder ? `${displayFolder(f)} ${t('edit_move_current')}` : displayFolder(f)}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="editor-move-confirm"
                                onClick={handleMoveConfirm}
                                disabled={moveTarget === '_placeholder' || moveTarget === currentFolder}
                                aria-describedby="move-help"
                            >
                                {t('edit_btn_move_confirm')}
                            </button>
                        </div>
                        <span id="move-help" className="sr-only">{t('edit_move_help')}</span>
                        <span className="sr-only" aria-live="polite" aria-atomic="true">{moveAnnounce}</span>
                    </div>
                    <button className="editor-btn" onClick={handlePreview}>
                        {t('edit_btn_preview')}
                    </button>
                    <a className="editor-link" href={`/wiki/${page || pageName}/versions`}>
                        {t('edit_btn_history')}
                    </a>
                    <a className="editor-link" href={`/wiki/${page || pageName}`}>
                        {t('edit_btn_open')}
                    </a>
                </div>
            </header>
            <main className="editor-content">
                {loading ? (
                    <div className="editor-loading">
                        <div className="editor-spinner"></div>
                        <span>{t('edit_loading')}</span>
                    </div>
                ) : (
                    <div className="editor-card">
                        <BlockNoteView editor={editor} theme="dark" />
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
