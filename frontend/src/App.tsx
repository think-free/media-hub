import React, { useEffect, useMemo, useState } from 'react'
import { addTagToItem, changePassword, createLibrary, createTag, createUser, deleteTag, deleteUser, getCurrentUser, getFavorites, getFolders, getHistory, getItemTags, getItems, getItemsByTag, getLibraries, getRecentItems, getTags, getUsers, login, logout, recordView, removeTagFromItem, scanLibrary, setFavorite, streamUrl, thumbUrl, unsetFavorite, type MediaItem, type FoldersResponse, type Tag, type User } from './api'

function bytes(n: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v > 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

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
  )
}

function Card({ item, fav, onFav, onOpen }: { item: MediaItem; fav: boolean; onFav: () => void; onOpen: () => void }) {
  return (
    <div className="glass card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="thumb cursor-pointer" onClick={onOpen}>
        {item.thumb_url ? (
          <img src={thumbUrl(item.id)} alt={item.rel_path} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
        ) : (
          <span className="muted">{item.kind.toUpperCase()}</span>
        )}
      </div>
      <div style={{ flexGrow: 1 }}></div>
      <p className="title card-title" style={{ margin: '8px 0 0 0' }}>
        {item.rel_path}
      </p>
      <div className="row justify-between" style={{ marginTop: 4 }}>
        <button className="btn" onClick={onFav} title="Favorito" style={{ padding: '4px 8px', fontSize: 14 }}>
          {fav ? '♥' : '♡'}
        </button>
        <span className="muted">{bytes(item.size_bytes)}</span>
      </div>
    </div>
  )
}

function PlayerModal({ item, onClose, onPrev, onNext }: {
  item: MediaItem;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const isPhoto = item.kind === "photo";
  const [itemTags, setItemTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string>('');
  const [newTagName, setNewTagName] = useState('');

  const loadTags = async () => {
    const [it, all] = await Promise.all([getItemTags(item.id), getTags()]);
    setItemTags(it);
    setAllTags(all);
  };

  useEffect(() => {
    loadTags();
  }, [item.id]);

  const handleAddTag = async () => {
    if (!selectedTagId) return;
    const tagId = Number(selectedTagId);
    try {
      await addTagToItem(item.id, tagId);
      await loadTags();
      setSelectedTagId('');
    } catch (e) { console.error(e); }
  };

  const handleCreateAndAddTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const created = await createTag(newTagName.trim());
      await addTagToItem(item.id, created.id);
      setNewTagName('');
      await loadTags();
    } catch (e) { console.error(e); }
  };

  const handleRemoveTag = async (tagId: number) => {
    try {
      await removeTagFromItem(item.id, tagId);
      setItemTags(itemTags.filter(t => t.id !== tagId));
    } catch (e) { console.error(e); }
  };

  // Tags not already on this item
  const availableTags = allTags.filter(t => !itemTags.some(it => it.id === t.id));

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onPrev, onNext, onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal-content" onClick={e => e.stopPropagation()}>
        <div className="row justify-between mb-sm">
          <div className="badge">{item.kind.toUpperCase()}</div>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {/* Left navigation zone */}
          {onPrev && (
            <div
              onClick={onPrev}
              style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: '15%',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(to right, rgba(0,0,0,0.3), transparent)',
                opacity: 0, transition: 'opacity 0.2s', zIndex: 10
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
            >
              <span style={{ fontSize: 32, color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>←</span>
            </div>
          )}
          {isPhoto ? (
            <img src={streamUrl(item.id)} className="media-display" style={{ width: '100%' }} />
          ) : (
            <video src={streamUrl(item.id)} controls className="media-display" style={{ width: '100%' }} />
          )}
          {/* Right navigation zone */}
          {onNext && (
            <div
              onClick={onNext}
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 0, width: '15%',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(to left, rgba(0,0,0,0.3), transparent)',
                opacity: 0, transition: 'opacity 0.2s', zIndex: 10
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
            >
              <span style={{ fontSize: 32, color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>→</span>
            </div>
          )}
        </div>
        <p className="muted mt-sm mb-0">{item.rel_path}</p>

        {/* Tags section */}
        <div className="mt-md">
          <div className="muted mb-sm">🏷 Tags:</div>
          <div className="row gap-sm" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            {itemTags.length === 0 && <span className="muted">Sin tags</span>}
            {itemTags.map(tag => (
              <span key={tag.id} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {tag.name}
                <button onClick={() => handleRemoveTag(tag.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>×</button>
              </span>
            ))}
          </div>
          {/* Add existing tag */}
          <div className="row gap-sm mb-sm">
            <select className="input" value={selectedTagId} onChange={e => setSelectedTagId(e.target.value)} style={{ minWidth: 150 }}>
              <option value="">Tag existente...</option>
              {availableTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="btn" onClick={handleAddTag} disabled={!selectedTagId}>+ Añadir</button>
          </div>
          {/* Create new tag */}
          <div className="row gap-sm">
            <input
              className="input"
              placeholder="Crear nuevo tag..."
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateAndAddTag()}
              style={{ minWidth: 150 }}
            />
            <button className="btn" onClick={handleCreateAndAddTag} disabled={!newTagName.trim()}>+ Crear</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LibraryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [rootsText, setRootsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const roots = rootsText.split('\n').map(r => r.trim()).filter(r => r.length > 0);
    if (!name.trim() || roots.length === 0) {
      setError('Nombre y al menos una ruta son requeridos');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createLibrary(name.trim(), roots);
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Error al crear biblioteca');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="glass modal-content" style={{ maxWidth: 500 }}>
        <h3 className="mt-0">Nueva Biblioteca</h3>
        <div className="mb-md">
          <label className="muted">Nombre</label>
          <input
            className="input"
            style={{ width: '100%', marginTop: 8 }}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Mi Biblioteca"
          />
        </div>
        <div className="mb-md">
          <label className="muted">Rutas (una por línea)</label>
          <textarea
            className="input"
            style={{ width: '100%', marginTop: 8, minHeight: 100, resize: 'vertical' }}
            value={rootsText}
            onChange={e => setRootsText(e.target.value)}
            placeholder="/media/disk1/Photos&#10;/media/disk1/Videos"
          />
        </div>
        {error && <p className="muted" style={{ color: '#ff6b6b' }}>{error}</p>}
        <div className="row justify-between">
          <button className="btn opacity-muted" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creando...' : 'Crear Biblioteca'}
          </button>
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
        <div className="row gap-sm" style={{ alignItems: 'center' }}>
          <span style={{ opacity: 0.7, marginRight: 8 }}>👤 {currentUsername}</span>
          <button className="btn opacity-muted" onClick={() => setShowPasswordModal(true)} title="Cambiar contraseña">🔑</button>
          <button className="btn opacity-muted" onClick={() => setTab('users')} title="Usuarios">👥</button>
          <button className="btn" onClick={() => { logout(); setAuthed(false); }}>Logout</button>
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
              <select className="input" value={libId} onChange={e => { setPage(1); setLibId(Number(e.target.value)); }}>
                {libs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <button className="btn" onClick={() => setShowLibraryModal(true)} title="Nueva biblioteca">+</button>
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
        <HomeView onOpen={(item) => { recordView(item.id); setOpen(item); }} favorites={favorites} setFavorites={setFavorites} refreshKey={homeRefreshKey} />
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
  )
}

function TagsView({ selectedTagId, setSelectedTagId, onOpen, favorites, setFavorites }: {
  selectedTagId: number | null;
  setSelectedTagId: (id: number | null) => void;
  onOpen: (i: MediaItem) => void;
  favorites: Set<number>;
  setFavorites: (s: Set<number>) => void;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [loading, setLoading] = useState(false);

  const loadTags = async () => {
    try {
      const t = await getTags();
      setTags(t);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadTags();
  }, []);

  useEffect(() => {
    if (!selectedTagId) {
      setItems([]);
      return;
    }
    setLoading(true);
    getItemsByTag(selectedTagId)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedTagId]);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await createTag(newTagName.trim());
      setNewTagName('');
      await loadTags();
    } catch (e) { console.error(e); }
  };

  const handleDeleteTag = async (id: number) => {
    if (!confirm('¿Eliminar este tag?')) return;
    try {
      await deleteTag(id);
      if (selectedTagId === id) setSelectedTagId(null);
      await loadTags();
    } catch (e) { console.error(e); }
  };

  return (
    <>
      {/* Tags list */}
      <div className="mb-md">
        <div className="muted mb-sm">🏷 Tags ({tags.length})</div>
        {tags.length === 0 && <div className="muted">No hay tags. Crea tags desde el modal de una foto/video.</div>}
        <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
          {tags.map(tag => (
            <button
              key={tag.id}
              className={`btn ${selectedTagId === tag.id ? '' : 'opacity-muted'}`}
              onClick={() => setSelectedTagId(selectedTagId === tag.id ? null : tag.id)}
            >
              🏷 {tag.name} ({tag.count || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Items for selected tag */}
      {selectedTagId && (
        <>
          <div className="muted mb-sm">
            🖼 Archivos con este tag ({items.length})
            <button className="btn opacity-muted" onClick={() => setSelectedTagId(null)} style={{ marginLeft: 10 }}>← Volver</button>
          </div>
          {loading && <div className="muted">Cargando...</div>}
          <div className="grid">
            {items.map(it => (
              <div key={it.id} className="glass card">
                <div className="thumb cursor-pointer" onClick={() => onOpen(it)}>
                  {it.thumb_url ? (
                    <img src={thumbUrl(it.id)} alt={it.rel_path} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
                  ) : (
                    <span className="muted">{it.kind.toUpperCase()}</span>
                  )}
                </div>
                <div className="row justify-between">
                  <p className="title card-title">{it.rel_path.split('/').pop()}</p>
                  <button className="btn" onClick={async () => {
                    try {
                      if (favorites.has(it.id)) {
                        await unsetFavorite(it.id);
                        const next = new Set(favorites); next.delete(it.id); setFavorites(next);
                      } else {
                        await setFavorite(it.id);
                        setFavorites(new Set(favorites).add(it.id));
                      }
                    } catch (e) { console.error(e); }
                  }} title="Favorito">
                    {favorites.has(it.id) ? '♥' : '♡'}
                  </button>
                </div>
                <div className="muted">{bytes(it.size_bytes)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function FolderBrowser({ libraryId, path, setPath, onOpen, favorites, setFavorites }: {
  libraryId: number;
  path: string;
  setPath: (p: string) => void;
  onOpen: (i: MediaItem) => void;
  favorites: Set<number>;
  setFavorites: (s: Set<number>) => void;
}) {
  const [data, setData] = useState<{ folders: string[]; items: MediaItem[] }>({ folders: [], items: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!libraryId) return;
    setLoading(true);
    getFolders(libraryId, path)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [libraryId, path]);

  const pathParts = path ? path.split('/') : [];

  const goToFolder = (folder: string) => {
    setPath(path ? `${path}/${folder}` : folder);
  };

  const goUp = () => {
    const parts = path.split('/');
    parts.pop();
    setPath(parts.join('/'));
  };

  const goToRoot = () => setPath('');

  const goToIndex = (index: number) => {
    setPath(pathParts.slice(0, index + 1).join('/'));
  };

  return (
    <>
      {/* Breadcrumb */}
      <div className="row gap-sm mb-md" style={{ flexWrap: 'wrap' }}>
        <button className="btn" onClick={goToRoot}>🏠 Raíz</button>
        {pathParts.map((part, i) => (
          <button key={i} className="btn opacity-muted" onClick={() => goToIndex(i)}>
            / {part}
          </button>
        ))}
        {path && <button className="btn" onClick={goUp}>⬆ Subir</button>}
      </div>

      {loading && <div className="muted">Cargando...</div>}

      {/* Folders */}
      {data.folders.length > 0 && (
        <div className="mb-md">
          <div className="muted mb-sm">📁 Carpetas ({data.folders.length})</div>
          <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
            {data.folders.map(folder => (
              <button key={folder} className="btn" onClick={() => goToFolder(folder)}>
                📁 {folder}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="muted mb-sm">🖼 Archivos ({data.items.length})</div>
      <div className="grid">
        {data.items.map(it => (
          <div key={it.id} className="glass card">
            <div className="thumb cursor-pointer" onClick={() => onOpen(it)}>
              {it.thumb_url ? (
                <img src={thumbUrl(it.id)} alt={it.rel_path} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
              ) : (
                <span className="muted">{it.kind.toUpperCase()}</span>
              )}
            </div>
            <div className="row justify-between">
              <p className="title card-title">{it.rel_path.split('/').pop()}</p>
              <button className="btn" onClick={async () => {
                try {
                  if (favorites.has(it.id)) {
                    await unsetFavorite(it.id);
                    const next = new Set(favorites); next.delete(it.id); setFavorites(next);
                  } else {
                    await setFavorite(it.id);
                    setFavorites(new Set(favorites).add(it.id));
                  }
                } catch (e) { console.error(e); }
              }} title="Favorito">
                {favorites.has(it.id) ? '♥' : '♡'}
              </button>
            </div>
            <div className="muted">{bytes(it.size_bytes)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function FavoritesView({ favorites, setFavorites, onOpen }: { favorites: Set<number>; setFavorites: (s: Set<number>) => void; onOpen: (i: MediaItem) => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  useEffect(() => {
    (async () => {
      const fav = await getFavorites();
      setItems(fav);
    })().catch(console.error);
  }, [favorites]);

  return (
    <>
      <div className="muted mb-sm">Favoritos: {items.length}</div>
      <div className="grid">
        {items.map(it => (
          <div key={it.id} className="glass card">
            <div className="thumb cursor-pointer" onClick={() => onOpen(it)}>
              {it.thumb_url ? (
                <img src={thumbUrl(it.id)} alt={it.rel_path} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
              ) : (
                <span className="muted">{it.kind.toUpperCase()}</span>
              )}
            </div>
            <div className="row justify-between">
              <p className="title card-title">
                {it.rel_path}
              </p>
              <button className="btn" onClick={async () => {
                try {
                  await unsetFavorite(it.id);
                  const next = new Set(favorites); next.delete(it.id); setFavorites(next);
                } catch (e) { console.error(e); }
              }}>♥</button>
            </div>
            <div className="muted">{bytes(it.size_bytes)}</div>
          </div>
        ))}
      </div>
    </>
  )
}

function UsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const loadUsers = async () => {
    try {
      const u = await getUsers();
      setUsers(u);
      const me = await getCurrentUser();
      setCurrentUserId(me.id);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setError(null);
    try {
      await createUser(newUsername.trim(), newPassword.trim());
      setNewUsername('');
      setNewPassword('');
      await loadUsers();
    } catch (e: any) {
      setError(e.message || 'Error creating user');
    }
  };

  const handleDelete = async (id: number) => {
    const message = id === currentUserId
      ? '¿Eliminar tu cuenta? Serás desconectado automáticamente.'
      : '¿Eliminar este usuario?';
    if (!confirm(message)) return;
    try {
      const result = await deleteUser(id);
      if (result.self_deleted) {
        logout();
        window.location.reload();
      } else {
        await loadUsers();
      }
    } catch (e: any) {
      setError(e.message || 'Error deleting user');
    }
  };

  return (
    <>
      <div className="muted mb-md">👥 Gestión de Usuarios</div>

      {error && <div style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>}

      {/* Create user form */}
      <div className="row gap-sm mb-md">
        <input
          className="input"
          placeholder="Nombre de usuario"
          value={newUsername}
          onChange={e => setNewUsername(e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="Contraseña"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
        />
        <button className="btn" onClick={handleCreate}>+ Crear Usuario</button>
      </div>

      {/* Users list */}
      <div className="glass" style={{ padding: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ padding: 8 }}>ID</th>
              <th style={{ padding: 8 }}>Usuario</th>
              <th style={{ padding: 8 }}>Creado</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: 8 }}>{u.id}</td>
                <td style={{ padding: 8 }}>{u.username} {u.id === currentUserId && <span className="badge">Tú</span>}</td>
                <td style={{ padding: 8 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                <td style={{ padding: 8 }}>
                  {users.length > 1 && (
                    <button className="btn opacity-muted" onClick={() => handleDelete(u.id)}>❌ Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (newPass !== confirmPass) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (newPass.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    try {
      await changePassword(oldPass, newPass);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (e: any) {
      setError(e.message || 'Error al cambiar contraseña');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, minWidth: 320 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>🔑 Cambiar Contraseña</h3>
          <button className="btn" onClick={onClose} style={{ padding: '4px 10px' }}>✕</button>
        </div>

        {success ? (
          <div style={{ color: '#4ade80', textAlign: 'center', padding: 20 }}>
            ✅ Contraseña cambiada correctamente
          </div>
        ) : (
          <>
            {error && <div style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                className="input"
                type="password"
                placeholder="Contraseña actual"
                value={oldPass}
                onChange={e => setOldPass(e.target.value)}
              />
              <input
                className="input"
                type="password"
                placeholder="Nueva contraseña"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
              />
              <input
                className="input"
                type="password"
                placeholder="Confirmar nueva contraseña"
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
              />
              <button className="btn" onClick={handleSubmit}>Cambiar Contraseña</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HomeView({ onOpen, favorites, setFavorites, refreshKey }: {
  onOpen: (item: MediaItem) => void;
  favorites: Set<number>;
  setFavorites: (s: Set<number>) => void;
  refreshKey: number;
}) {
  const [recentItems, setRecentItems] = useState<MediaItem[]>([]);
  const [historyItems, setHistoryItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [recent, history] = await Promise.all([
          getRecentItems(12),
          getHistory(12)
        ]);
        setRecentItems(recent);
        setHistoryItems(history);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshKey]);

  if (loading) {
    return <div className="muted">Cargando...</div>;
  }

  return (
    <>
      {/* Recently viewed */}
      <div className="mb-md">
        <h3 style={{ margin: '0 0 12px 0', color: 'rgba(255,255,255,0.9)' }}>👁 Vistos recientemente</h3>
        {historyItems.length === 0 ? (
          <div className="muted">No has visto ningún elemento todavía</div>
        ) : (
          <div className="grid">
            {historyItems.map(it => (
              <Card
                key={it.id}
                item={it}
                fav={favorites.has(it.id)}
                onOpen={() => onOpen(it)}
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
        )}
      </div>

      {/* Recently added */}
      <div>
        <h3 style={{ margin: '0 0 12px 0', color: 'rgba(255,255,255,0.9)' }}>🆕 Añadidos recientemente</h3>
        {recentItems.length === 0 ? (
          <div className="muted">No hay elementos recientes</div>
        ) : (
          <div className="grid">
            {recentItems.map(it => (
              <Card
                key={it.id}
                item={it}
                fav={favorites.has(it.id)}
                onOpen={() => onOpen(it)}
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
        )}
      </div>
    </>
  );
}
