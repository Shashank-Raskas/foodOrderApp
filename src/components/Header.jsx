import { useContext, useState, useRef, useEffect } from 'react';
import logo from '../assets/logo.jpg';
import Button from './UI/Button';
import CartContext from './store/CartContext';
import FavoritesContext from './store/FavoritesContext';
import UserProgressContext from './store/UserProgressContext';
import AuthContext from './store/AuthContext';
import SearchContext from './store/SearchContext';

export default function Header() {
    const cartCtx = useContext(CartContext);
    const favCtx = useContext(FavoritesContext);
    const userProgresCtx = useContext(UserProgressContext);
    const authCtx = useContext(AuthContext);
    const { searchTerm, setSearchTerm } = useContext(SearchContext);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    const searchInputRef = useRef(null);

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

    // search is always visible in header; input ref available for programmatic focus
    useEffect(() => {
        // placeholder for any header search lifecycle logic
    }, []);

    return (
        <header id="main-header">
            <div id="title">
                <img src={logo} alt="A restaurant" />
                <h1>The Flavor Alchemist</h1>
            </div>

            <div className="header-search header-search-bar">
                <div className="header-search-field">
                    <svg className="header-search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search meals..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="header-search-input"
                    />
                    {searchTerm && (
                        <button
                            className="header-search-clear"
                            onClick={() => setSearchTerm('')}
                            title="Clear search"
                        >
                            ✕
                        </button>
                    )}
                </div>
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
                ) : (
                    <div className="header-auth-btns">
                        <button
                            className="header-login-btn"
                            onClick={() => userProgresCtx.showAuth('login')}
                        >
                            Login
                        </button>
                        <button
                            className="header-signup-btn"
                            onClick={() => userProgresCtx.showAuth('signup')}
                        >
                            Sign Up
                        </button>
                    </div>
                )}
            </nav>
        </header>
    );
}