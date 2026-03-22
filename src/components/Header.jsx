import { useContext } from 'react';
import logo from '../assets/logo.jpg';
import Button from './UI/Button';
import CartContext from './store/CartContext';
import UserProgressContext from './store/UserProgressContext';
import AuthContext from './store/AuthContext';

export default function Header() {
    const cartCtx = useContext(CartContext);
    const userProgresCtx = useContext(UserProgressContext);
    const authCtx = useContext(AuthContext);

    const totalCartItems = cartCtx.items.reduce((totalNumberOfItems, item) => {
        return totalNumberOfItems + item.quantity;
    }, 0); // Calculate the total number of items in the cart

    function handleShowCart() {
        userProgresCtx.showCart(); // Show the cart when the button is clicked
    }

    function handleShowProfile() {
        userProgresCtx.showProfile();
    }

    function handleLogout() {
        authCtx.logout();
        cartCtx.clearCart();
    }

    return <header id="main-header">
        <div id="title">
            <img src={logo} alt='A restaurent'/>
            <h1>The Flavor Alchemist</h1>
        </div>
        <nav>
            {authCtx.isLoggedIn ? (
                <>
                    <button 
                        className="header-profile-btn"
                        onClick={handleShowProfile}
                        title="View profile"
                    >
                        👤 {authCtx.user.name}
                    </button>
                    <Button onClick={handleShowCart} textOnly>Cart ({totalCartItems})</Button>
                    <Button onClick={handleLogout} textOnly className="logout-btn">Logout</Button>
                </>
            ) : null}
        </nav>
    </header>
    
}