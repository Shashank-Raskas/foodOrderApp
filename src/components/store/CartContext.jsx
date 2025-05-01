import { createContext, useReducer } from "react";

const CartContext = createContext({
    items: [],
    additem: (item) => { },
    removeItem: (id) => { },
});

function cartReducer(state, action) {
    if (action.type === 'ADD_ITEM') {
        //state.items.push(action.item); //! if this is used , and single item clicke dmany times, it will be added multiple times
        const existingCartItemIndex = state.items.findIndex(item => item.id === action.item.id);

        const updatedItems = [...state.items]; // create a copy of the items array
        if (existingCartItemIndex > -1) {  //!if the item is already in the cart, we need to update the quantity
            const existingItem = state.items[existingCartItemIndex];
            const updatedItem = {
                ...existingItem,
                quantity: existingItem.quantity + 1,
            }
            updatedItems[existingCartItemIndex] = updatedItem; // update the item in the array
        } else {
            updatedItems.push({...action.item,quantity : 1}); // add the new item to the array with quantity 1
        }

        return { ...state,
            items: updatedItems,
        };
    }
    if (action.type === 'REMOVE_ITEM') {
        //remove the item from the state
    }
    return state;
}

export function CartContextProvider({ children }) {

    useReducer(cartReducer, { items: [] });
    return <CartContext>{children}</CartContext>
}

export default CartContext;

//!cretecontext is used to create a context object, which can be used to share data between components without having to pass props down manually at every level.