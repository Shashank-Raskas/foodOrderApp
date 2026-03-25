import { createContext , useState} from "react";

const UserProgressContext = createContext({
    progress: '',
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
});

export function UserProgressContextProvider({ children }) {

const [UserProgress,setUserProgress] = useState('');

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

const userProgressCtx= {
    progress: UserProgress,
    showCart: showCart,
    hideCart: hideCart,
    showCheckout: showCheckout,
    hideCheckout: hideCheckout,
    showProfile: showProfile,
    hideProfile: hideProfile,
    showFavorites: showFavorites,
    hideFavorites: hideFavorites,
    showOrderHistory: showOrderHistory,
    hideOrderHistory: hideOrderHistory,
};
return (
    <UserProgressContext.Provider value={userProgressCtx}>
        {children}
    </UserProgressContext.Provider>
)
}

export default UserProgressContext;