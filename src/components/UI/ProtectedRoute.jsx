import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import AuthContext from '../store/AuthContext';

export default function ProtectedRoute({ children }) {
    const authCtx = useContext(AuthContext);

    if (!authCtx.isLoggedIn) {
        return <Navigate to="/" replace />;
    }

    return children;
}
