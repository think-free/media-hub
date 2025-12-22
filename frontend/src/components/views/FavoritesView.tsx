import { useEffect, useState } from 'react';
import { getFavorites, thumbUrl, unsetFavorite, type MediaItem } from '../../api';
import { bytes } from '../../utils/format';

export interface FavoritesViewProps {
    favorites: Set<number>;
    setFavorites: (s: Set<number>) => void;
    onOpen: (i: MediaItem) => void;
}

export function FavoritesView({ favorites, setFavorites, onOpen }: FavoritesViewProps) {
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
    );
}
