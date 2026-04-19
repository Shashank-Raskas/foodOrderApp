import { useContext, useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import logo from '../assets/logo.jpg';
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
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const dropdownRef = useRef(null);
    const searchInputRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();

    const totalCartItems = cartCtx.items.reduce((total, item) => total + item.quantity, 0);
    const userInitial = authCtx.user?.name?.[0]?.toUpperCase() || '?';
    const isLanding = location.pathname === '/';
    const isMenuPage = location.pathname === '/menu';

    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        function onScroll() { setScrolled(window.scrollY > 60); }
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

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
        setMobileMenuOpen(false);
        action();
    }

    function handleLogout() {
        authCtx.logout();
    }

    useEffect(() => {
        function handleKeyDown(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
            if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
                searchInputRef.current.blur();
            }
        }
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Close mobile menu on route change
    useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);

    const navLinks = [
        { label: 'Home', path: '/' },
        { label: 'Menu', path: '/menu' },
        { label: 'About Us', path: '/about' },
        { label: 'Contact Us', path: '/contact' },
    ];

    return (
        <header id="main-header" className={`${isLanding ? 'header-landing' : ''} ${scrolled ? 'header-scrolled' : ''}`}>
            <div id="title" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                <img src={logo} alt="The Flavor Alchemist" />
                <h1>The Flavor Alchemist</h1>
            </div>

            {/* Main navigation links */}
            <nav className={`header-main-nav ${mobileMenuOpen ? 'nav-open' : ''}`}>
                {navLinks.map(link => (
                    <button
                        key={link.path}
                        className={`header-nav-link ${location.pathname === link.path ? 'nav-active' : ''}`}
                        onClick={() => handleMenuAction(() => navigate(link.path))}
                    >
                        {link.label}
                    </button>
                ))}
                {/* Admin link inside hamburger menu (mobile) */}
                {authCtx.isAdmin && (
                    <button
                        className={`header-nav-link header-nav-admin-mobile ${location.pathname === '/admin' ? 'nav-active' : ''}`}
                        onClick={() => handleMenuAction(() => navigate('/admin'))}
                    >
                        ⚙️ Admin Dashboard
                    </button>
                )}
            </nav>

            {/* Search bar — only on menu page */}
            <div className={`header-search header-search-bar${!isMenuPage ? ' header-search-hidden' : ''}`}>
                <div className="header-search-field">
                    <svg className="header-search-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search meals... (Ctrl+K)"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="header-search-input"
                    />
                    {searchTerm && (
                        <button className="header-search-clear" onClick={() => setSearchTerm('')} title="Clear search">✕</button>
                    )}
                </div>
            </div>

            {/* Right side actions */}
            <div className="header-actions">
                {authCtx.isLoggedIn ? (
                    <>
                        {/* Shopping Cart Icon */}
                        <button className="cart-btn" onClick={handleShowCart} title="Cart">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="cart-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="9" cy="21" r="1"/>
                                <circle cx="20" cy="21" r="1"/>
                                <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
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
                                    <button className="dropdown-item" onClick={() => handleMenuAction(() => navigate('/profile'))}>
                                        <span>👤</span> My Profile
                                    </button>
                                    <button className="dropdown-item" onClick={() => handleMenuAction(() => navigate('/favorites'))}>
                                        <span>❤️</span> Favorites
                                        {favCtx.favorites.length > 0 && <span className="dropdown-badge">{favCtx.favorites.length}</span>}
                                    </button>
                                    <button className="dropdown-item" onClick={() => handleMenuAction(() => navigate('/orders'))}>
                                        <span>📦</span> My Orders
                                    </button>
                                    {authCtx.isAdmin && (
                                        <>
                                            <hr className="dropdown-divider" />
                                            <button className="dropdown-item dropdown-admin" onClick={() => handleMenuAction(() => navigate('/admin'))}>
                                                <span>⚙️</span> Admin Dashboard
                                            </button>
                                        </>
                                    )}
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
                        <button className="header-login-btn" onClick={() => userProgresCtx.showAuth('login')}>Login</button>
                        <button className="header-signup-btn" onClick={() => userProgresCtx.showAuth('signup')}>Sign Up</button>
                    </div>
                )}

                {/* Mobile hamburger */}
                <button className="mobile-hamburger" onClick={() => setMobileMenuOpen(prev => !prev)} aria-label="Toggle menu">
                    <span className={mobileMenuOpen ? 'ham-open' : ''} />
                </button>
            </div>
        </header>
    );
}