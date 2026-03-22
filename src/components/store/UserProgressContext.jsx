import { createContext , useState} from "react";

const UserProgressContext = createContext({
    progress: '',
    showCart: () => {},
    hideCart: () => {},
    showCheckout: () => {},
    hideCheckout: () => {},
    showProfile: () => {},
    hideProfile: () => {},
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

const userProgressCtx= {
    progress: UserProgress,
    showCart: showCart,
    hideCart: hideCart,
    showCheckout: showCheckout,
    hideCheckout: hideCheckout,
    showProfile: showProfile,
    hideProfile: hideProfile,
};
return (
    <UserProgressContext value={userProgressCtx}>
        {children}
    </UserProgressContext>
)
}

export default UserProgressContext;