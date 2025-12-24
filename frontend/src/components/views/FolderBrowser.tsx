import { useEffect, useState } from 'react';
import { getFolders, setFavorite, thumbUrl, unsetFavorite, type MediaItem } from '../../api';
import { bytes } from '../../utils/format';

export interface FolderBrowserProps {
    libraryId: number;
    path: string;
    setPath: (p: string) => void;
    onOpen: (i: MediaItem) => void;
    favorites: Set<number>;
    setFavorites: (s: Set<number>) => void;
}

export function FolderBrowser({ libraryId, path, setPath, onOpen, favorites, setFavorites }: FolderBrowserProps) {
    const [data, setData] = useState<{ folders: string[]; items: MediaItem[] }>({ folders: [], items: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!libraryId) return;
        setLoading(true);
        setError(null);
        getFolders(libraryId, path)
            .then(res => {
                // Validate response structure
                if (res && typeof res === 'object') {
                    setData({
                        folders: Array.isArray(res.folders) ? res.folders : [],
                        items: Array.isArray(res.items) ? res.items : []
                    });
                } else {
                    setData({ folders: [], items: [] });
                }
            })
            .catch(e => {
                console.error(e);
                setError(e.message || 'Error loading folders');
                setData({ folders: [], items: [] });
            })
            .finally(() => setLoading(false));
    }, [libraryId, path]);

    if (!libraryId) {
        return <div className="muted">Selecciona una biblioteca primero</div>;
    }

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
            {error && <div className="muted" style={{ color: '#ff6b6b' }}>Error: {error}</div>}

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
