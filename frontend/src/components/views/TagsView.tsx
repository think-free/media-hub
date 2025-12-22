import { useEffect, useState } from 'react';
import { createTag, deleteTag, getItemsByTag, getTags, setFavorite, thumbUrl, unsetFavorite, type MediaItem, type Tag } from '../../api';
import { bytes } from '../../utils/format';

export interface TagsViewProps {
    selectedTagId: number | null;
    setSelectedTagId: (id: number | null) => void;
    onOpen: (i: MediaItem) => void;
    favorites: Set<number>;
    setFavorites: (s: Set<number>) => void;
}

export function TagsView({ selectedTagId, setSelectedTagId, onOpen, favorites, setFavorites }: TagsViewProps) {
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
