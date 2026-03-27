import { createContext, useState, useEffect, useContext } from "react";
import AuthContext from "./AuthContext";

const FavoritesContext = createContext({
    favorites: [],
    addFavorite: (meal) => {},
    removeFavorite: (id) => {},
    isFavorite: (id) => {},
});

export function FavoritesContextProvider({ children }) {
    const authCtx = useContext(AuthContext);
    const userId = authCtx?.user?.userId;
    const [favorites, setFavorites] = useState([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Generate storage key based on userId
    function getStorageKey(uid) {
        return uid ? `favorites_${uid}` : 'favorites_guest';
    }

    // Load favorites from localStorage when user changes
    useEffect(() => {
        setIsLoaded(false);
        const storageKey = getStorageKey(userId);
        const storedFavorites = localStorage.getItem(storageKey);
        if (storedFavorites) {
            try {
                setFavorites(JSON.parse(storedFavorites));
            } catch (err) {
                console.error('Failed to parse favorites:', err);
                localStorage.removeItem(storageKey);
                setFavorites([]);
            }
        } else {
            setFavorites([]);
        }
        setIsLoaded(true);
    }, [userId]);

    // Save favorites to localStorage whenever they change - ONLY after initial load
    useEffect(() => {
        if (!isLoaded) return; // Don't save until we've loaded first
        const storageKey = getStorageKey(userId);
        localStorage.setItem(storageKey, JSON.stringify(favorites));
    }, [favorites, userId, isLoaded]);

    function addFavorite(meal) {
        setFavorites(prev => {
            const exists = prev.find(fav => fav.id === meal.id);
            if (exists) return prev;
            return [...prev, meal];
        });
    }

    function removeFavorite(id) {
        setFavorites(prev => prev.filter(fav => fav.id !== id));
    }

    function isFavorite(id) {
        return favorites.some(fav => fav.id === id);
    }

    const favoritesContext = {
        favorites,
        addFavorite,
        removeFavorite,
        isFavorite,
    };

    return (
        <FavoritesContext.Provider value={favoritesContext}>
            {children}
        </FavoritesContext.Provider>
    );
}

export default FavoritesContext;
