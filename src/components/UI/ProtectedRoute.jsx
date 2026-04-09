import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import AuthContext from '../store/AuthContext';

export default function ProtectedRoute({ children, adminOnly = false }) {
    const authCtx = useContext(AuthContext);

    if (!authCtx.isLoggedIn) {
        return <Navigate to="/" replace />;
    }

    if (adminOnly && !authCtx.isAdmin) {
        return (
            <div style={{ textAlign: 'center', padding: '5rem 2rem', color: '#a09080' }}>
                <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</p>
                <h2 style={{ color: '#ffc404', marginBottom: '0.5rem' }}>Admin Access Required</h2>
                <p>This page is only accessible to the admin account (<strong style={{ color: '#ffc404' }}>flavor.alchemist9@gmail.com</strong>).</p>
                <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                    You are currently logged in as: <strong style={{ color: '#d9e2f1' }}>{authCtx.user?.email}</strong>
                </p>
            </div>
        );
    }

    return children;
}
