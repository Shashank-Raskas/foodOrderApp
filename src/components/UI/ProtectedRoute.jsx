import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import AuthContext from '../store/AuthContext';

export default function ProtectedRoute({ children, adminOnly = false }) {
    const authCtx = useContext(AuthContext);

    if (!authCtx.isLoggedIn) {
        return <Navigate to="/" replace />;
    }

    if (adminOnly && !authCtx.isAdmin) {
        return <Navigate to="/" replace />;
    }

    return children;
}
