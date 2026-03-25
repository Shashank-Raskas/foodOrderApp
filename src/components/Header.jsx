import { useContext, useState, useRef, useEffect } from 'react';
import logo from '../assets/logo.jpg';
import Button from './UI/Button';
import CartContext from './store/CartContext';
import FavoritesContext from './store/FavoritesContext';
import UserProgressContext from './store/UserProgressContext';
import AuthContext from './store/AuthContext';

export default function Header() {
    const cartCtx = useContext(CartContext);
    const favCtx = useContext(FavoritesContext);
    const userProgresCtx = useContext(UserProgressContext);
    const authCtx = useContext(AuthContext);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const totalCartItems = cartCtx.items.reduce((total, item) => total + item.quantity, 0);
    const userInitial = authCtx.user?.name?.[0]?.toUpperCase() || '?';

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    function handleShowCart() {
        userProgresCtx.showCart();
    }

    function handleMenuAction(action) {
        setDropdownOpen(false);
        action();
    }

    function handleLogout() {
        authCtx.logout();
    }

    return (
        <header id="main-header">
            <div id="title">
                <img src={logo} alt="A restaurant" />
                <h1>The Flavor Alchemist</h1>
            </div>
            <nav>
                {authCtx.isLoggedIn ? (
                    <>
                        <button className="cart-btn" onClick={handleShowCart}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="cart-icon">
                                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                                <line x1="3" y1="6" x2="21" y2="6"/>
                                <path d="M16 10a4 4 0 01-8 0"/>
                            </svg>
                            {totalCartItems > 0 && (
                                <span className="cart-badge">{totalCartItems}</span>
                            )}
                        </button>

                        <div className="profile-dropdown-wrapper" ref={dropdownRef}>
                            <button
                                className="profile-avatar-btn"
                                onClick={() => setDropdownOpen(prev => !prev)}
                                title={authCtx.user?.name}
                            >
                                {userInitial}
                            </button>

                            {dropdownOpen && (
                                <div className="profile-dropdown">
                                    <div className="dropdown-user-info">
                                        <span className="dropdown-avatar">{userInitial}</span>
                                        <div>
                                            <p className="dropdown-name">{authCtx.user?.name}</p>
                                            <p className="dropdown-email">{authCtx.user?.email}</p>
                                        </div>
                                    </div>
                                    <hr className="dropdown-divider" />
                                    <button className="dropdown-item" onClick={() => handleMenuAction(userProgresCtx.showProfile)}>
                                        <span>👤</span> My Profile
                                    </button>
                                    <button className="dropdown-item" onClick={() => handleMenuAction(userProgresCtx.showFavorites)}>
                                        <span>❤️</span> Favorites
                                        {favCtx.favorites.length > 0 && (
                                            <span className="dropdown-badge">{favCtx.favorites.length}</span>
                                        )}
                                    </button>
                                    <button className="dropdown-item" onClick={() => handleMenuAction(userProgresCtx.showOrderHistory)}>
                                        <span>📦</span> My Orders
                                    </button>
                                    <hr className="dropdown-divider" />
                                    <button className="dropdown-item dropdown-logout" onClick={() => handleMenuAction(handleLogout)}>
                                        <span>🚪</span> Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                ) : null}
            </nav>
        </header>
    );
}