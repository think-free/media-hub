import { useState, useEffect } from 'react';
import { getLibraryStats, regenerateThumbs, scanLibrary, type LibraryStats } from '../../api';
import { bytes } from '../../utils/format';

interface SettingsViewProps {
    libraryId: number | null;
    onClose: () => void;
}

export function SettingsView({ libraryId, onClose }: SettingsViewProps) {
    const [stats, setStats] = useState<LibraryStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!libraryId) return;
        setLoading(true);
        getLibraryStats(libraryId)
            .then(setStats)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [libraryId]);

    const handleScan = async () => {
        if (!libraryId) return;
        setActionLoading('scan');
        setMessage(null);
        try {
            await scanLibrary(libraryId);
            setMessage('Escaneo iniciado en segundo plano');
        } catch (e) {
            setMessage('Error al iniciar escaneo');
        }
        setActionLoading(null);
    };

    const handleRegenerateThumbs = async (videoOnly: boolean) => {
        if (!libraryId) return;
        setActionLoading(videoOnly ? 'thumbs-video' : 'thumbs-all');
        setMessage(null);
        try {
            const result = await regenerateThumbs(libraryId, videoOnly);
            setMessage(`Regeneración iniciada: ${result.jobs_queued} trabajos en cola`);
            // Refresh stats
            const newStats = await getLibraryStats(libraryId);
            setStats(newStats);
        } catch (e) {
            setMessage('Error al iniciar regeneración');
        }
        setActionLoading(null);
    };

    if (!libraryId) {
        return (
            <div className="settings-view">
                <p className="muted">Selecciona una biblioteca para ver la configuración</p>
            </div>
        );
    }

    return (
        <div className="settings-view">
            <div className="settings-header">
                <h2>Configuración de Biblioteca</h2>
                <button className="btn" onClick={onClose}>✕</button>
            </div>

            {loading ? (
                <p className="muted">Cargando...</p>
            ) : stats ? (
                <>
                    {/* Library Info */}
                    <div className="glass settings-section">
                        <h3>Información</h3>
                        <div className="stats-grid">
                            <div className="stat-item">
                                <span className="stat-label">Nombre</span>
                                <span className="stat-value">{stats.name}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Ruta</span>
                                <span className="stat-value" style={{ fontSize: '14px', wordBreak: 'break-all' }}>{stats.path}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Total Items</span>
                                <span className="stat-value">{stats.total_items.toLocaleString()}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Tamaño Total</span>
                                <span className="stat-value">{bytes(stats.total_size)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Content Stats */}
                    <div className="glass settings-section">
                        <h3>Contenido</h3>
                        <div className="stats-grid stats-grid-4">
                            <div className="stat-item">
                                <span className="stat-value">{stats.video_count}</span>
                                <span className="stat-label">Videos</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{stats.photo_count}</span>
                                <span className="stat-label">Fotos</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{stats.audio_count}</span>
                                <span className="stat-label">Audio</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{stats.other_count}</span>
                                <span className="stat-label">Otros</span>
                            </div>
                        </div>
                    </div>

                    {/* Thumbnails */}
                    <div className="glass settings-section">
                        <h3>Miniaturas</h3>
                        <div className="stats-grid stats-grid-2">
                            <div className="stat-item">
                                <span className="stat-value">{stats.thumb_count}</span>
                                <span className="stat-label">Generadas</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value" style={{ color: stats.missing_thumbs > 0 ? '#f59e0b' : 'inherit' }}>
                                    {stats.missing_thumbs}
                                </span>
                                <span className="stat-label">Pendientes</span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="glass settings-section">
                        <h3>Acciones</h3>
                        <div className="settings-actions">
                            <button
                                className="btn btn-action"
                                onClick={handleScan}
                                disabled={actionLoading !== null}
                            >
                                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2'/%3E%3C/svg%3E" alt="" style={{ marginRight: '10px' }} />
                                {actionLoading === 'scan' ? 'Iniciando...' : 'Escanear Biblioteca'}
                            </button>
                            <button
                                className="btn btn-action"
                                onClick={() => handleRegenerateThumbs(true)}
                                disabled={actionLoading !== null}
                            >
                                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Crect x='2' y='2' width='20' height='20' rx='2.18' ry='2.18'/%3E%3Cline x1='7' y1='2' x2='7' y2='22'/%3E%3Cline x1='17' y1='2' x2='17' y2='22'/%3E%3Cline x1='2' y1='12' x2='22' y2='12'/%3E%3Cline x1='2' y1='7' x2='7' y2='7'/%3E%3Cline x1='2' y1='17' x2='7' y2='17'/%3E%3Cline x1='17' y1='17' x2='22' y2='17'/%3E%3Cline x1='17' y1='7' x2='22' y2='7'/%3E%3C/svg%3E" alt="" style={{ marginRight: '10px' }} />
                                {actionLoading === 'thumbs-video' ? 'Iniciando...' : 'Regenerar Miniaturas (Videos)'}
                            </button>
                            <button
                                className="btn btn-action"
                                onClick={() => handleRegenerateThumbs(false)}
                                disabled={actionLoading !== null}
                            >
                                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpath d='m21 15-5-5L5 21'/%3E%3C/svg%3E" alt="" style={{ marginRight: '10px' }} />
                                {actionLoading === 'thumbs-all' ? 'Iniciando...' : 'Regenerar Todas las Miniaturas'}
                            </button>
                        </div>
                    </div>

                    {message && (
                        <div className="settings-message glass">
                            {message}
                        </div>
                    )}
                </>
            ) : (
                <p className="muted">Error al cargar estadísticas</p>
            )}
        </div>
    );
}
