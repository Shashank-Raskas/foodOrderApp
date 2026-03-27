import { createContext , useState} from "react";

const UserProgressContext = createContext({
    progress: '',
    authView: null,
    showCart: () => {},
    hideCart: () => {},
    showCheckout: () => {},
    hideCheckout: () => {},
    showProfile: () => {},
    hideProfile: () => {},
    showFavorites: () => {},
    hideFavorites: () => {},
    showOrderHistory: () => {},
    hideOrderHistory: () => {},
    showAuth: () => {},
    hideAuth: () => {},
});

export function UserProgressContextProvider({ children }) {

const [UserProgress,setUserProgress] = useState('');
const [authView, setAuthView] = useState(null); // 'login' | 'signup' | null

function showCart() {
    setUserProgress('cart');
}
function hideCart() {
    setUserProgress('');
}
function showCheckout() {
    setUserProgress('checkout');
}   
function hideCheckout() {
    setUserProgress('');
}

function showProfile() {
    setUserProgress('profile');
}

function hideProfile() {
    setUserProgress('');
}

function showFavorites() {
    setUserProgress('favorites');
}

function hideFavorites() {
    setUserProgress('');
}

function showOrderHistory() {
    setUserProgress('orderHistory');
}

function hideOrderHistory() {
    setUserProgress('');
}

function showAuth(view = 'login') {
    setAuthView(view);
}

function hideAuth() {
    setAuthView(null);
}

const userProgressCtx= {
    progress: UserProgress,
    authView,
    showCart,
    hideCart,
    showCheckout,
    hideCheckout,
    showProfile,
    hideProfile,
    showFavorites,
    hideFavorites,
    showOrderHistory,
    hideOrderHistory,
    showAuth,
    hideAuth,
};
return (
    <UserProgressContext.Provider value={userProgressCtx}>
        {children}
    </UserProgressContext.Provider>
)
}

export default UserProgressContext;