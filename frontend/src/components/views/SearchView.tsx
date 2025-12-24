import { useEffect, useState } from 'react';
import { search, thumbUrl, setFavorite, unsetFavorite, type MediaItem, type SearchResult } from '../../api';
import { bytes } from '../../utils/format';

export interface SearchViewProps {
    query: string;
    libraryId?: number;
    onOpen: (item: MediaItem) => void;
    favorites: Set<number>;
    setFavorites: (s: Set<number>) => void;
}

export function SearchView({ query, libraryId, onOpen, favorites, setFavorites }: SearchViewProps) {
    const [results, setResults] = useState<SearchResult>({ by_filename: [], by_tag: [], tags: [] });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!query.trim()) {
            setResults({ by_filename: [], by_tag: [], tags: [] });
            return;
        }
        setLoading(true);
        search(query, libraryId)
            .then(setResults)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [query, libraryId]);

    const toggleFavorite = async (item: MediaItem) => {
        const isFav = favorites.has(item.id);
        const next = new Set(favorites);
        try {
            if (isFav) {
                await unsetFavorite(item.id);
                next.delete(item.id);
            } else {
                await setFavorite(item.id);
                next.add(item.id);
            }
            setFavorites(next);
        } catch (e) {
            console.error(e);
        }
    };

    const renderItem = (item: MediaItem) => (
        <div key={item.id} className="glass card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="thumb cursor-pointer" onClick={() => onOpen(item)}>
                {item.thumb_url ? (
                    <img src={thumbUrl(item.id)} alt={item.rel_path} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
                ) : (
                    <span className="muted">{item.kind.toUpperCase()}</span>
                )}
            </div>
            <div style={{ flexGrow: 1 }}></div>
            <p className="title card-title" style={{ margin: '8px 0 0 0' }}>
                {item.rel_path.split('/').pop()?.replace(/\.[^.]+$/, '') || item.rel_path}
            </p>
            <div className="row justify-between" style={{ marginTop: 4 }}>
                <button className="btn" onClick={() => toggleFavorite(item)} title="Favorito" style={{ padding: '4px 8px', fontSize: 14 }}>
                    {favorites.has(item.id) ? '♥' : '♡'}
                </button>
                <span className="muted">{bytes(item.size_bytes)}</span>
            </div>
        </div>
    );

    if (!query.trim()) {
        return <div className="muted">Escribe un término de búsqueda</div>;
    }

    if (loading) {
        return <div className="muted">Buscando...</div>;
    }

    const hasFilenameResults = results.by_filename.length > 0;
    const hasTagResults = results.by_tag.length > 0;
    const hasAnyResults = hasFilenameResults || hasTagResults;

    return (
        <>
            {!hasAnyResults && (
                <div className="muted">No se encontraron resultados para "{query}"</div>
            )}

            {hasFilenameResults && (
                <div className="mb-lg">
                    <h3 style={{ marginBottom: 12 }}>📁 Por nombre de archivo ({results.by_filename.length})</h3>
                    <div className="grid">
                        {results.by_filename.map(renderItem)}
                    </div>
                </div>
            )}

            {results.tags.length > 0 && (
                <div className="mb-md">
                    <h3 style={{ marginBottom: 8 }}>🏷️ Tags encontrados</h3>
                    <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
                        {results.tags.map(tag => (
                            <span key={tag.id} className="btn opacity-muted" style={{ fontSize: 14 }}>
                                {tag.name} ({tag.count})
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {hasTagResults && (
                <div className="mb-lg">
                    <h3 style={{ marginBottom: 12 }}>🏷️ Por tag ({results.by_tag.length})</h3>
                    <div className="grid">
                        {results.by_tag.map(renderItem)}
                    </div>
                </div>
            )}
        </>
    );
}
