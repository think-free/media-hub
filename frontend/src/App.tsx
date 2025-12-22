import { useEffect, useState } from 'react';
import { getFavorites, getItems, getLibraries, getCurrentUser, login, logout, recordView, scanLibrary, setFavorite, unsetFavorite, type MediaItem } from './api';

// Components
import { Card } from './components/common';
import { PlayerModal, LibraryModal, ChangePasswordModal } from './components/modals';
import { HomeView, FavoritesView, TagsView, FolderBrowser, UsersView } from './components/views';

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
        <p className="muted mt-md mb-0">
          Tema oscuro + glass básico (starter). Miniaturas/metadata están como placeholder.
        </p>
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
  const [tab, setTab] = useState<'home' | 'library' | 'favorites' | 'folders' | 'tags' | 'users'>('home');
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [folderPath, setFolderPath] = useState<string>('');
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
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

  return (
    <div className="container">
      <div className="glass topbar" style={{ position: 'relative' }}>
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
            <select className="input" value={libId} onChange={e => { setPage(1); setLibId(Number(e.target.value)); }}>
              {libs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="btn" onClick={() => setShowLibraryModal(true)} title="Nueva biblioteca">+</button>
          </div>
          {/* Separator */}
          <div className="topbar-separator" style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.2)', margin: '0 8px' }}></div>
          {/* User section */}
          <div className="row gap-sm user-section">
            <span style={{ opacity: 0.7 }}>👤 {currentUsername}</span>
            <button className="btn opacity-muted" onClick={() => setShowPasswordModal(true)} title="Cambiar contraseña">🔑</button>
            <button className="btn opacity-muted" onClick={() => setTab('users')} title="Usuarios">👥</button>
            <button className="btn" onClick={() => { logout(); setAuthed(false); }}>Logout</button>
          </div>
        </div>
      </div>

      <div className="glass toolbar">
        <div className="row justify-between">
          <div className="row">
            <button className={`btn ${tab === 'home' ? '' : 'opacity-muted'}`} onClick={() => setTab('home')}>🏠 Inicio</button>
            <button className={`btn ${tab === 'library' ? '' : 'opacity-muted'}`} onClick={() => setTab('library')}>Biblioteca</button>
            <button className={`btn ${tab === 'favorites' ? '' : 'opacity-muted'}`} onClick={() => setTab('favorites')}>Favoritos</button>
            <button className={`btn ${tab === 'folders' ? '' : 'opacity-muted'}`} onClick={() => { setTab('folders'); setFolderPath(''); }}>Carpetas</button>
            <button className={`btn ${tab === 'tags' ? '' : 'opacity-muted'}`} onClick={() => { setTab('tags'); setSelectedTagId(null); }}>Tags</button>
          </div>
          {tab === 'library' && (
            <div className="row">
              <select className="input" value={kind} onChange={e => { setPage(1); setKind(e.target.value); }}>
                <option value="">All</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="photo">Photo</option>
                <option value="other">Other</option>
              </select>
              <input className="input" value={q} onChange={e => { setPage(1); setQ(e.target.value); }} placeholder="Buscar (path)" />
              <button className="btn" onClick={async () => { if (!libId) return; await scanLibrary(libId); alert('Scan finished'); }}>Scan</button>
            </div>
          )}
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
      ) : (
        <UsersView />
      )}

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
      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}
    </div>
  );
}
