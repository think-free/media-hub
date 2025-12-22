import { useEffect, useState } from 'react';
import { addTagToItem, createTag, getItemTags, getTags, removeTagFromItem, streamUrl, type MediaItem, type Tag } from '../../api';

export interface PlayerModalProps {
    item: MediaItem;
    onClose: () => void;
    onPrev?: () => void;
    onNext?: () => void;
}

export function PlayerModal({ item, onClose, onPrev, onNext }: PlayerModalProps) {
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

    // Block body scroll when modal is open
    useEffect(() => {
        const originalStyle = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalStyle;
        };
    }, []);

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
    );
}
