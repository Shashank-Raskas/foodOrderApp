import { createContext, useReducer } from "react";

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

        return {
            ...state,
            items: updatedItems,
        };
    }
    if (action.type === 'REMOVE_ITEM') {
        const existingCartItemIndex = state.items.findIndex(item => item.id === action.id); //? find the index of the item to be removed in the cart

        const existingCartItem = state.items[existingCartItemIndex]; //? get the item to be removed from the cart

        const updatedItems = [...state.items]; // create a copy of the items array to avoid mutating the state directly

        if (existingCartItem.quantity === 1) {
            updatedItems.splice(existingCartItemIndex, 1); // remove the item from the array
        }
        else {
            const updatedItem = {
                ...existingCartItem,
                quantity: existingCartItem.quantity - 1,
            }
            updatedItems[existingCartItemIndex] = updatedItem; // update the item in the array
        }
        return {
            ...state,
            items: updatedItems,
        };
    }
    if (action.type === 'CLEAR_CART') {
        return {
           ...state, items: [],
        };
    }
    return state;
}

export function CartContextProvider({ children }) {

    const [cart, dispatchCartAction] = useReducer(cartReducer, { items: [] });

    
    
    function addItem(item) {
        dispatchCartAction({ type: 'ADD_ITEM', item: item });
        
    }
    function removeItem(id){
        dispatchCartAction({ type: 'REMOVE_ITEM', id });
    }
    function clearCart() {
        dispatchCartAction({ type: 'CLEAR_CART' });
    }

    const cartContext = {
        items: cart.items,
        addItem,
        removeItem,
        clearCart,
    };

    return <CartContext value={cartContext}>{children}</CartContext>
}

export default CartContext;

//!cretecontext is used to create a context object, which can be used to share data between components without having to pass props down manually at every level.