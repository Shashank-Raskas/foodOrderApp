import { createContext, useReducer } from "react";

const CartContext = createContext({
    items: [],
    additem: (item) => { },
    removeItem: (id) => { },
});

function cartReducer(state, action) {
    if (action.type === 'ADD_ITEM') {
        //state.items.push(action.item); //! if this is used , and single item clicke dmany times, it will be added multiple times
        const existingCartItemIndex = state.items.findIndex(item => item.id === action.item.id); //? find the index of the item to be added in the cart

        const updatedItems = [...state.items]; // create a copy of the items array to avoid mutating the state directly
        if (existingCartItemIndex > -1) {  //!if the item is already in the cart, we need to update the quantity
            const existingItem = state.items[existingCartItemIndex];
            const updatedItem = {
                ...existingItem,
                quantity: existingItem.quantity + 1,
            }
            updatedItems[existingCartItemIndex] = updatedItem; // update the item in the array
        } else {
            updatedItems.push({ ...action.item, quantity: 1 }); // add the new item to the array with quantity 1
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

    const cartContext = {
        items: cart.items,
        addItem,
        removeItem
    };

    console.log(cartContext);
    return <CartContext value={cartContext}>{children}</CartContext>
}

export default CartContext;

//!cretecontext is used to create a context object, which can be used to share data between components without having to pass props down manually at every level.