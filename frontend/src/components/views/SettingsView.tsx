import { useState, useEffect, useRef, useCallback } from 'react';
import { getLibraryStats, regenerateThumbs, scanLibrary, importJellyfin, type LibraryStats, type JellyfinImportResult } from '../../api';
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
    const [isPolling, setIsPolling] = useState(false);

    // Jellyfin import state
    const [jellyfinFile, setJellyfinFile] = useState<File | null>(null);
    const [importCollections, setImportCollections] = useState(true);
    const [importFavorites, setImportFavorites] = useState(true);
    const [importResult, setImportResult] = useState<JellyfinImportResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollingRef = useRef<number | null>(null);

    // Refresh stats function
    const refreshStats = useCallback(async () => {
        if (!libraryId) return null;
        try {
            const newStats = await getLibraryStats(libraryId);
            setStats(newStats);
            return newStats;
        } catch (e) {
            console.error('Error refreshing stats:', e);
            return null;
        }
    }, [libraryId]);

    // Initial load - start polling to detect any work in progress
    useEffect(() => {
        if (!libraryId) return;
        setLoading(true);
        getLibraryStats(libraryId)
            .then((stats) => {
                setStats(stats);
                // Start polling to detect if there's work in progress
                setIsPolling(true);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [libraryId]);

    // Polling effect - refresh stats every 5 seconds while active
    const prevStatsRef = useRef<string | null>(null);
    const stableCountRef = useRef(0);
    const hasDetectedChanges = useRef(false);

    useEffect(() => {
        if (!isPolling || !libraryId) return;

        const poll = async () => {
            const newStats = await refreshStats();
            if (newStats) {
                const statsKey = JSON.stringify({
                    total: newStats.total_items,
                    thumbs: newStats.thumb_count,
                    missing: newStats.missing_thumbs
                });

                if (prevStatsRef.current === statsKey) {
                    stableCountRef.current++;
                    // Stop polling after 2 stable cycles (10 seconds of no changes)
                    if (stableCountRef.current >= 2) {
                        setIsPolling(false);
                        // Only show message if we detected changes during polling
                        if (hasDetectedChanges.current) {
                            if (newStats.missing_thumbs === 0) {
                                setMessage('¡Actualización completada!');
                            } else {
                                setMessage(`Actualización pausada. Pendientes: ${newStats.missing_thumbs} miniaturas`);
                            }
                        }
                        // Reset refs
                        stableCountRef.current = 0;
                        prevStatsRef.current = null;
                        hasDetectedChanges.current = false;
                    }
                } else {
                    // Stats changed - work is in progress
                    if (prevStatsRef.current !== null) {
                        hasDetectedChanges.current = true;
                    }
                    stableCountRef.current = 0;
                    prevStatsRef.current = statsKey;
                }
            }
        };

        pollingRef.current = window.setInterval(poll, 5000);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [isPolling, libraryId, refreshStats]);

    const handleScan = async () => {
        if (!libraryId) return;
        setActionLoading('scan');
        setMessage(null);
        try {
            await scanLibrary(libraryId);
            setMessage('Escaneo iniciado en segundo plano (actualizando cada 5s...)');
            // Start polling to show progress
            setIsPolling(true);
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
            setMessage(`Regeneración iniciada: ${result.jobs_queued} trabajos en cola (actualizando cada 5s...)`);
            // Refresh stats immediately and start polling
            await refreshStats();
            setIsPolling(true);
        } catch (e) {
            setMessage('Error al iniciar regeneración');
        }
        setActionLoading(null);
    };

    const handleJellyfinImport = async () => {
        if (!libraryId || !jellyfinFile) return;
        if (!importCollections && !importFavorites) {
            setMessage('Selecciona al menos una opción para importar');
            return;
        }

        setActionLoading('jellyfin');
        setMessage(null);
        setImportResult(null);

        try {
            const result = await importJellyfin(libraryId, jellyfinFile, {
                import_collections: importCollections,
                import_favorites: importFavorites,
            });
            setImportResult(result);
            setJellyfinFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (e) {
            setMessage(`Error al importar: ${e instanceof Error ? e.message : 'Error desconocido'}`);
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

                    {/* Jellyfin Import */}
                    <div className="glass settings-section">
                        <h3>Importar desde Jellyfin</h3>
                        <p className="section-description">
                            Importa colecciones (como tags) y favoritos desde tu base de datos de Jellyfin.
                        </p>

                        <div className="jellyfin-import">
                            <div className="file-input-wrapper">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".db"
                                    onChange={(e) => setJellyfinFile(e.target.files?.[0] || null)}
                                    disabled={actionLoading !== null}
                                    id="jellyfin-file"
                                />
                                <label htmlFor="jellyfin-file" className="file-input-label">
                                    <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/%3E%3Cpolyline points='17 8 12 3 7 8'/%3E%3Cline x1='12' y1='3' x2='12' y2='15'/%3E%3C/svg%3E" alt="" />
                                    {jellyfinFile ? jellyfinFile.name : 'Seleccionar library.db'}
                                </label>
                            </div>

                            <div className="import-options">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={importCollections}
                                        onChange={(e) => setImportCollections(e.target.checked)}
                                        disabled={actionLoading !== null}
                                    />
                                    Colecciones → Tags
                                </label>
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={importFavorites}
                                        onChange={(e) => setImportFavorites(e.target.checked)}
                                        disabled={actionLoading !== null}
                                    />
                                    Favoritos
                                </label>
                            </div>

                            <button
                                className="btn btn-action btn-jellyfin"
                                onClick={handleJellyfinImport}
                                disabled={actionLoading !== null || !jellyfinFile}
                            >
                                <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M12 3v12'/%3E%3Cpath d='m8 11 4 4 4-4'/%3E%3Cpath d='M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4'/%3E%3C/svg%3E" alt="" style={{ marginRight: '10px' }} />
                                {actionLoading === 'jellyfin' ? 'Importando...' : 'Importar'}
                            </button>
                        </div>

                        {/* Import Result */}
                        {importResult && (
                            <div className="import-result">
                                <div className="import-result-grid">
                                    <div className="import-stat">
                                        <span className="import-stat-value">{importResult.collections_imported}</span>
                                        <span className="import-stat-label">Colecciones importadas</span>
                                    </div>
                                    <div className="import-stat">
                                        <span className="import-stat-value">{importResult.favorites_imported}</span>
                                        <span className="import-stat-label">Favoritos importados</span>
                                    </div>
                                    <div className="import-stat">
                                        <span className="import-stat-value">{importResult.items_matched}</span>
                                        <span className="import-stat-label">Items encontrados</span>
                                    </div>
                                    <div className="import-stat">
                                        <span className="import-stat-value" style={{ color: importResult.items_not_found > 0 ? '#f59e0b' : 'inherit' }}>
                                            {importResult.items_not_found}
                                        </span>
                                        <span className="import-stat-label">Items no encontrados</span>
                                    </div>
                                </div>
                                {importResult.errors && importResult.errors.length > 0 && (
                                    <div className="import-errors">
                                        <strong>Errores:</strong>
                                        <ul>
                                            {importResult.errors.map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
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
