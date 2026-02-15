import { useContext } from 'react';
import logo from '../assets/logo.jpg';
import Button from './UI/Button';
import CartContext from './store/CartContext';
import UserProgressContext from './store/UserProgressContext';

export default function Header() {
    const cartCtx = useContext(CartContext);
    const userProgresCtx = useContext(UserProgressContext);

    const totalCartItems = cartCtx.items.reduce((totalNumberOfItems, item) => {
        return totalNumberOfItems + item.quantity;
    }, 0); // Calculate the total number of items in the cart

    function handleShowCart() {
        userProgresCtx.showCart(); // Show the cart when the button is clicked
    }

    return <header id="main-header">
        <div id="title">
            <img src={logo} alt='A restaurent'/>
            <h1>The Flavor Alchemist</h1>
        </div>
        <nav>
            <Button onClick={handleShowCart} textOnly>Cart ({totalCartItems})</Button>
        </nav>
    </header>
    
}