import { useEffect, useState } from 'react';
import { getHistory, getRecentItems, setFavorite, unsetFavorite, type MediaItem } from '../../api';
import { Card } from '../common';

export interface HomeViewProps {
    onOpen: (item: MediaItem) => void;
    favorites: Set<number>;
    setFavorites: (s: Set<number>) => void;
    refreshKey: number;
}

export function HomeView({ onOpen, favorites, setFavorites, refreshKey }: HomeViewProps) {
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
