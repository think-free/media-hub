import { thumbUrl, type MediaItem } from '../../api';
import { bytes } from '../../utils/format';

export interface CardProps {
    item: MediaItem;
    fav: boolean;
    onFav: () => void;
    onOpen: () => void;
}

export function Card({ item, fav, onFav, onOpen }: CardProps) {
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
                {item.rel_path.split('/').pop()?.replace(/\.[^.]+$/, '') || item.rel_path}
            </p>
            <div className="row justify-between" style={{ marginTop: 4 }}>
                <button className="btn" onClick={onFav} title="Favorito" style={{ padding: '4px 8px', fontSize: 14 }}>
                    {fav ? '♥' : '♡'}
                </button>
                <span className="muted">{bytes(item.size_bytes)}</span>
            </div>
        </div>
    );
}
