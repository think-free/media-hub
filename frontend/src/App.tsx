import { useEffect, useState } from 'react';
import { getFavorites, getItems, getLibraries, getCurrentUser, login, logout, recordView, setFavorite, unsetFavorite, type MediaItem } from './api';

// Components
import { Card } from './components/common';
import { PlayerModal, LibraryModal } from './components/modals';
import { HomeView, FavoritesView, TagsView, FolderBrowser, SearchView } from './components/views';
import { SettingsView } from './components/views/SettingsView';

function Login({ onDone }: { onDone: () => void }) {
  const [u, setU] = useState('admin');
  const [p, setP] = useState('admin');
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="container">
      <div className="glass login-panel">
        <h2 className="mt-0">MediaHub</h2>
        <div className="row mb-md">
          <input className="input flex-1" value={u} onChange={e => setU(e.target.value)} placeholder="username" />
          <input className="input flex-1" type="password" value={p} onChange={e => setP(e.target.value)} placeholder="password" />
        </div>
        <div className="row">
          <button className="btn" onClick={async () => {
            setErr(null);
            try { await login(u, p); onDone(); } catch (e: any) { setErr(e.message); }
          }}>Login</button>
          {err && <span className="muted">{err}</span>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => !!localStorage.getItem("mh_token"));
  const [libs, setLibs] = useState<Array<{ id: number; name: string; roots: string[] }>>([]);
  const [libId, setLibId] = useState<number | undefined>(undefined);
  const [kind, setKind] = useState<string>('');
  const [q, setQ] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [tab, setTab] = useState<'home' | 'library' | 'favorites' | 'folders' | 'tags' | 'search' | 'settings'>('home');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [folderPath, setFolderPath] = useState<string>('');
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);

  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const pageSize = 48;

  useEffect(() => {
    if (!authed) return;
    (async () => {
      const l = await getLibraries();
      setLibs(l);
      if (!libId && l.length) setLibId(l[0].id);
      const fav = await getFavorites();
      setFavorites(new Set(fav.map(x => x.id)));
      const me = await getCurrentUser();
      setCurrentUsername(me.username);
    })().catch(() => { logout(); setAuthed(false); });
  }, [authed]);

  const reloadLibraries = async () => {
    const l = await getLibraries();
    setLibs(l);
    if (l.length && !libId) setLibId(l[0].id);
  };

  useEffect(() => {
    if (!authed || !libId || tab !== 'library') return;
    (async () => {
      const res = await getItems({ libraryId: libId, kind: kind || undefined, q: q || undefined, page, pageSize, sort: 'recent' });
      setItems(res.items);
      setTotal(res.total);
    })().catch(console.error);
  }, [authed, libId, kind, q, page, tab]);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu when tab changes
  const handleTabChange = (newTab: typeof tab) => {
    setTab(newTab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="container">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-menu-sidebar glass" onClick={e => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <img src="/logo.png" alt="MediaHub" className="mobile-menu-logo" />
              <span>Media Hub</span>
              <button className="btn mobile-menu-close" onClick={() => setMobileMenuOpen(false)}>✕</button>
            </div>

            <div className="mobile-menu-nav">
              <button className={`mobile-menu-item ${tab === 'home' ? 'active' : ''}`} onClick={() => handleTabChange('home')}>🏠 Inicio</button>
              <button className={`mobile-menu-item ${tab === 'library' ? 'active' : ''}`} onClick={() => handleTabChange('library')}>📚 Biblioteca</button>
              <button className={`mobile-menu-item ${tab === 'favorites' ? 'active' : ''}`} onClick={() => handleTabChange('favorites')}>⭐ Favoritos</button>
              <button className={`mobile-menu-item ${tab === 'folders' ? 'active' : ''}`} onClick={() => { handleTabChange('folders'); setFolderPath(''); }}>📁 Carpetas</button>
              <button className={`mobile-menu-item ${tab === 'tags' ? 'active' : ''}`} onClick={() => { handleTabChange('tags'); setSelectedTagId(null); }}>🏷️ Tags</button>
            </div>

            <div className="mobile-menu-search">
              <input
                className="input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && searchQuery.trim()) { handleTabChange('search'); } }}
                placeholder="🔍 Buscar (Enter)"
              />
            </div>

            <div className="mobile-menu-library">
              <label className="mobile-menu-label">Biblioteca</label>
              <div className="row gap-sm">
                <select className="input flex-1" value={libId} onChange={e => { setPage(1); setLibId(Number(e.target.value)); }}>
                  {libs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <button className="btn" onClick={() => { setShowLibraryModal(true); setMobileMenuOpen(false); }}>+</button>
                <button className="btn" onClick={() => { handleTabChange('settings'); }}>⚙️</button>
              </div>
            </div>

            <div className="mobile-menu-user">
              <span className="mobile-menu-username">👤 {currentUsername}</span>
              <button className="btn" onClick={() => { logout(); setAuthed(false); }}>Logout</button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Topbar - hidden on mobile */}
      <div className="glass topbar desktop-only" style={{ position: 'relative' }}>
        <img
          src="/logo.png"
          alt="MediaHub"
          style={{
            height: 170,
            objectFit: 'contain',
            position: 'absolute',
            left: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.6))',
            zIndex: 100,
            borderRadius: 20
          }}
        />
        <div style={{
          position: 'absolute',
          left: 180,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 35,
          fontWeight: 600,
          letterSpacing: 1,
          color: 'rgba(255,255,255,0.9)',
          textShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}>
          Media Hub
        </div>
        <div style={{ marginLeft: 320 }}></div>
        <div className="row gap-sm topbar-right" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Library selector group - stays together */}
          <div className="row gap-sm library-selector">
            <select className="input" style={{ minWidth: 150 }} value={libId} onChange={e => { setPage(1); setLibId(Number(e.target.value)); }}>
              {libs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="btn" onClick={() => setShowLibraryModal(true)} title="Nueva biblioteca">+</button>
            <button className="btn" onClick={() => setTab('settings')} title="Configuración de biblioteca">
              <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'/%3E%3C/svg%3E" alt="Settings" />
            </button>
          </div>
          {/* Separator */}
          <div className="topbar-separator" style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)', margin: '0 8px' }}></div>
          {/* User section */}
          <div className="row gap-sm user-section">
            <span style={{ opacity: 0.9, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E" alt="User" />
              {currentUsername}
            </span>
            <button className="btn" onClick={() => { logout(); setAuthed(false); }}>Logout</button>
          </div>
        </div>
      </div>

      {/* Mobile Topbar - visible only on mobile */}
      <div className="glass topbar mobile-topbar mobile-only">
        <div className="mobile-topbar-center">
          <img src="/logo.png" alt="MediaHub" className="mobile-logo" />
          <span className="mobile-title">Media Hub</span>
        </div>
        <button className="btn hamburger-btn" onClick={() => setMobileMenuOpen(true)}>
          ☰
        </button>
      </div>

      {/* Desktop Toolbar - hidden on mobile */}
      <div className="glass toolbar desktop-only">
        <div className="row justify-between">
          <div className="row">
            <button className={`btn ${tab === 'home' ? '' : 'opacity-muted'}`} onClick={() => setTab('home')}>🏠 Inicio</button>
            <button className={`btn ${tab === 'library' ? '' : 'opacity-muted'}`} onClick={() => setTab('library')}>Biblioteca</button>
            <button className={`btn ${tab === 'favorites' ? '' : 'opacity-muted'}`} onClick={() => setTab('favorites')}>Favoritos</button>
            <button className={`btn ${tab === 'folders' ? '' : 'opacity-muted'}`} onClick={() => { setTab('folders'); setFolderPath(''); }}>Carpetas</button>
            <button className={`btn ${tab === 'tags' ? '' : 'opacity-muted'}`} onClick={() => { setTab('tags'); setSelectedTagId(null); }}>Tags</button>
          </div>
          <div className="row gap-sm">
            <input
              className="input"
              style={{ minWidth: 200 }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && searchQuery.trim()) setTab('search'); }}
              placeholder="🔍 Buscar (Enter)"
            />
            {tab === 'library' && (
              <select className="input" value={kind} onChange={e => { setPage(1); setKind(e.target.value); }}>
                <option value="">All</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="photo">Photo</option>
                <option value="other">Other</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {tab === 'home' ? (
        <HomeView onOpen={(item) => { recordView(item.id); setOpen(item); }} favorites={favorites} setFavorites={setFavorites} refreshKey={homeRefreshKey} libraryId={libId} />
      ) : tab === 'library' ? (
        <>
          <div className="muted mb-sm">
            Items: {total} — Page {page}/{maxPage}
          </div>
          <div className="grid">
            {items.map(it => (
              <Card
                key={it.id}
                item={it}
                fav={favorites.has(it.id)}
                onOpen={() => { recordView(it.id); setOpen(it); }}
                onFav={async () => {
                  const isFav = favorites.has(it.id);
                  const next = new Set(favorites);
                  try {
                    if (isFav) { await unsetFavorite(it.id); next.delete(it.id); }
                    else { await setFavorite(it.id); next.add(it.id); }
                    setFavorites(next);
                  } catch (e) { console.error(e); }
                }}
              />
            ))}
          </div>

          <div className="pagination">
            <button className="btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
            <button className="btn" onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={page >= maxPage}>Next</button>
          </div>
        </>
      ) : tab === 'favorites' ? (
        <FavoritesView favorites={favorites} setFavorites={setFavorites} onOpen={(item) => { recordView(item.id); setOpen(item); }} />
      ) : tab === 'folders' ? (
        <FolderBrowser libraryId={libId!} path={folderPath} setPath={setFolderPath} onOpen={(item) => { recordView(item.id); setOpen(item); }} favorites={favorites} setFavorites={setFavorites} />
      ) : tab === 'tags' ? (
        <TagsView selectedTagId={selectedTagId} setSelectedTagId={setSelectedTagId} onOpen={(item) => { recordView(item.id); setOpen(item); }} favorites={favorites} setFavorites={setFavorites} />
      ) : tab === 'search' ? (
        <>
          <div className="mb-md">
            <button className="btn opacity-muted" onClick={() => setTab('home')}>← Volver</button>
            <span className="muted" style={{ marginLeft: 24 }}>Resultados para: "{searchQuery}"</span>
          </div>
          <SearchView query={searchQuery} libraryId={libId} onOpen={(item) => { recordView(item.id); setOpen(item); }} favorites={favorites} setFavorites={setFavorites} />
        </>
      ) : tab === 'settings' ? (
        <SettingsView libraryId={libId ?? null} onClose={() => setTab('home')} />
      ) : null}

      {open && (
        <PlayerModal
          item={open}
          onClose={() => { setOpen(null); if (tab === 'home') setHomeRefreshKey(k => k + 1); }}
          onPrev={items.findIndex(i => i.id === open.id) > 0 ? () => {
            const idx = items.findIndex(i => i.id === open.id);
            if (idx > 0) setOpen(items[idx - 1]);
          } : undefined}
          onNext={items.findIndex(i => i.id === open.id) < items.length - 1 ? () => {
            const idx = items.findIndex(i => i.id === open.id);
            if (idx < items.length - 1) setOpen(items[idx + 1]);
          } : undefined}
        />
      )}
      {showLibraryModal && (
        <LibraryModal
          onClose={() => setShowLibraryModal(false)}
          onCreated={() => { setShowLibraryModal(false); reloadLibraries(); }}
        />
      )}

    </div>
  );
}
