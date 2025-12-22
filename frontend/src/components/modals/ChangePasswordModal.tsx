import { useState } from 'react';
import { changePassword } from '../../api';

export interface ChangePasswordModalProps {
    onClose: () => void;
}

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
    const [oldPass, setOldPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async () => {
        setError(null);
        if (newPass !== confirmPass) {
            setError('Las contraseñas no coinciden');
            return;
        }
        if (newPass.length < 4) {
            setError('La contraseña debe tener al menos 4 caracteres');
            return;
        }
        try {
            await changePassword(oldPass, newPass);
            setSuccess(true);
            setTimeout(onClose, 1500);
        } catch (e: any) {
            setError(e.message || 'Error al cambiar contraseña');
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="glass modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, minWidth: 320 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 18 }}>🔑 Cambiar Contraseña</h3>
                    <button className="btn" onClick={onClose} style={{ padding: '4px 10px' }}>✕</button>
                </div>

                {success ? (
                    <div style={{ color: '#4ade80', textAlign: 'center', padding: 20 }}>
                        ✅ Contraseña cambiada correctamente
                    </div>
                ) : (
                    <>
                        {error && <div style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <input
                                className="input"
                                type="password"
                                placeholder="Contraseña actual"
                                value={oldPass}
                                onChange={e => setOldPass(e.target.value)}
                            />
                            <input
                                className="input"
                                type="password"
                                placeholder="Nueva contraseña"
                                value={newPass}
                                onChange={e => setNewPass(e.target.value)}
                            />
                            <input
                                className="input"
                                type="password"
                                placeholder="Confirmar nueva contraseña"
                                value={confirmPass}
                                onChange={e => setConfirmPass(e.target.value)}
                            />
                            <button className="btn" onClick={handleSubmit}>Cambiar Contraseña</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
