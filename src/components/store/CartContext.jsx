import { createContext, useReducer, useEffect, useState, useContext } from "react";
import AuthContext from "./AuthContext";

const CartContext = createContext({
    items: [],
    additem: (item) => { },
    removeItem: (id) => { },
    clearCart: () => { },
});

function cartReducer(state, action) {
    if (action.type === 'ADD_ITEM') {
        const existingCartItemIndex = state.items.findIndex(item => item.id === action.item.id);

        const updatedItems = [...state.items];
        
        if (existingCartItemIndex > -1) {
            const existingItem = state.items[existingCartItemIndex];
            const updatedItem = {
                ...existingItem,
                quantity: existingItem.quantity + 1,
            }
            updatedItems[existingCartItemIndex] = updatedItem;
        } else {
            updatedItems.push({ ...action.item, quantity: 1 });
        }

        return { ...state, items: updatedItems };
    }
    if (action.type === 'REMOVE_ITEM') {
        const existingCartItemIndex = state.items.findIndex(item => item.id === action.id);
        const existingCartItem = state.items[existingCartItemIndex];
        const updatedItems = [...state.items];

        if (existingCartItem.quantity === 1) {
            updatedItems.splice(existingCartItemIndex, 1);
        } else {
            updatedItems[existingCartItemIndex] = { ...existingCartItem, quantity: existingCartItem.quantity - 1 };
        }
        return { ...state, items: updatedItems };
    }
    if (action.type === 'CLEAR_CART') {
        return { ...state, items: [] };
    }
    if (action.type === 'LOAD_CART') {
        return { ...state, items: action.items };
    }
    return state;
}

export function CartContextProvider({ children }) {
    const authCtx = useContext(AuthContext);
    const userId = authCtx?.user?.userId;
    const [cart, dispatchCartAction] = useReducer(cartReducer, { items: [] });
    const [isLoaded, setIsLoaded] = useState(false);

    function getStorageKey(uid) {
        return uid ? `cart_${uid}` : 'cart_guest';
    }

    // Load cart from localStorage when user changes
    useEffect(() => {
        setIsLoaded(false);
        const storageKey = getStorageKey(userId);
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                dispatchCartAction({ type: 'LOAD_CART', items: parsed });
            } catch {
                localStorage.removeItem(storageKey);
                dispatchCartAction({ type: 'CLEAR_CART' });
            }
        } else {
            dispatchCartAction({ type: 'CLEAR_CART' });
        }
        setIsLoaded(true);
    }, [userId]);

    // Save cart to localStorage — only after initial load
    useEffect(() => {
        if (!isLoaded) return;
        const storageKey = getStorageKey(userId);
        localStorage.setItem(storageKey, JSON.stringify(cart.items));
    }, [cart.items, userId, isLoaded]);

    function addItem(item) {
        dispatchCartAction({ type: 'ADD_ITEM', item });
    }
    function removeItem(id) {
        dispatchCartAction({ type: 'REMOVE_ITEM', id });
    }
    function clearCart() {
        dispatchCartAction({ type: 'CLEAR_CART' });
        if (userId) {
            localStorage.removeItem(getStorageKey(userId));
        }
    }

    const cartContext = { items: cart.items, addItem, removeItem, clearCart };

    return <CartContext.Provider value={cartContext}>{children}</CartContext.Provider>
}

export default CartContext;