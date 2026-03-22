import { createContext, useState, useEffect } from "react";
import { API_ENDPOINTS } from "../../config/api";

const AuthContext = createContext({
    user: null,
    isLoggedIn: false,
    login: () => {},
    signup: () => {},
    logout: () => {},
    isLoading: false,
    error: null,
});

export function AuthContextProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Check if user is already logged in (from localStorage)
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (err) {
                console.error('Failed to parse stored user:', err);
                localStorage.removeItem('user');
            }
        }
    }, []);

    async function login(email, password) {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(API_ENDPOINTS.LOGIN, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Login failed');
            }

            const data = await response.json();
            const userData = {
                userId: data.userId,
                email: data.email,
                name: data.name,
            };
            
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
            return userData;
        } catch (err) {
            setError(err.message || 'Login failed. Please try again.');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }

    async function signup(email, password, name) {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(API_ENDPOINTS.SIGNUP, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password, name }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Signup failed');
            }

            const data = await response.json();
            const userData = {
                userId: data.userId,
                email: data.email,
                name: data.name,
            };
            
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
            return userData;
        } catch (err) {
            setError(err.message || 'Signup failed. Please try again.');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }

    function logout() {
        setUser(null);
        setError(null);
        localStorage.removeItem('user');
    }

    const authCtx = {
        user,
        isLoggedIn: user !== null,
        login,
        signup,
        logout,
        isLoading,
        error,
    };

    return (
        <AuthContext.Provider value={authCtx}>
            {children}
        </AuthContext.Provider>
    );
}

export default AuthContext;
