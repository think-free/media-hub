import { useEffect, useState } from 'react';
import { createUser, deleteUser, getCurrentUser, getUsers, logout, type User } from '../../api';

export function UsersView() {
    const [users, setUsers] = useState<User[]>([]);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);

    const loadUsers = async () => {
        try {
            const u = await getUsers();
            setUsers(u);
            const me = await getCurrentUser();
            setCurrentUserId(me.id);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { loadUsers(); }, []);

    const handleCreate = async () => {
        if (!newUsername.trim() || !newPassword.trim()) return;
        setError(null);
        try {
            await createUser(newUsername.trim(), newPassword.trim());
            setNewUsername('');
            setNewPassword('');
            await loadUsers();
        } catch (e: any) {
            setError(e.message || 'Error creating user');
        }
    };

    const handleDelete = async (id: number) => {
        const message = id === currentUserId
            ? '¿Eliminar tu cuenta? Serás desconectado automáticamente.'
            : '¿Eliminar este usuario?';
        if (!confirm(message)) return;
        try {
            const result = await deleteUser(id);
            if (result.self_deleted) {
                logout();
                window.location.reload();
            } else {
                await loadUsers();
            }
        } catch (e: any) {
            setError(e.message || 'Error deleting user');
        }
    };

    return (
        <>
            <div className="muted mb-md">👥 Gestión de Usuarios</div>

            {error && <div style={{ color: '#f87171', marginBottom: 12 }}>{error}</div>}

            {/* Create user form */}
            <div className="row gap-sm mb-md">
                <input
                    className="input"
                    placeholder="Nombre de usuario"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                />
                <input
                    className="input"
                    type="password"
                    placeholder="Contraseña"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                />
                <button className="btn" onClick={handleCreate}>+ Crear Usuario</button>
            </div>

            {/* Users list */}
            <div className="glass" style={{ padding: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: 8 }}>ID</th>
                            <th style={{ padding: 8 }}>Usuario</th>
                            <th style={{ padding: 8 }}>Creado</th>
                            <th style={{ padding: 8 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: 8 }}>{u.id}</td>
                                <td style={{ padding: 8 }}>{u.username} {u.id === currentUserId && <span className="badge">Tú</span>}</td>
                                <td style={{ padding: 8 }}>{new Date(u.created_at).toLocaleDateString()}</td>
                                <td style={{ padding: 8 }}>
                                    {users.length > 1 && (
                                        <button className="btn opacity-muted" onClick={() => handleDelete(u.id)}>❌ Eliminar</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
