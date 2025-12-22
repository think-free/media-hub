import { useState } from 'react';
import { createLibrary } from '../../api';

export interface LibraryModalProps {
    onClose: () => void;
    onCreated: () => void;
}

export function LibraryModal({ onClose, onCreated }: LibraryModalProps) {
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
