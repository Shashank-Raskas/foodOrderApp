import { useContext, useMemo, useState } from "react";
import Modal from "./UI/Modal";
import { currencyFormatter } from "../util/formatting";
import CartContext from "./store/CartContext";
import FavoritesContext from "./store/FavoritesContext";
import AuthContext from "./store/AuthContext";
import UserProgressContext from "./store/UserProgressContext";
import { API_URL } from "../config/api";
import './MealDetail.css';

// Estimated calorie ranges by category (per serving)
const CALORIE_ESTIMATES = {
    'entrees': { min: 350, max: 650 },
    'sides': { min: 120, max: 300 },
    'desserts': { min: 250, max: 500 },
    'beverages': { min: 50, max: 200 },
    'appetizers': { min: 150, max: 350 },
    'default': { min: 200, max: 450 },
};

const SPICE_LABELS = {
    'non-spicy': { label: 'No Spice', emoji: '🫑', color: '#4caf50' },
    'mild': { label: 'Mild', emoji: '🌶️', color: '#ff9800' },
    'medium': { label: 'Medium', emoji: '🌶️🌶️', color: '#f44336' },
    'spicy': { label: 'Spicy', emoji: '🌶️🌶️🌶️', color: '#d32f2f' },
    'extra-spicy': { label: 'Extra Spicy', emoji: '🔥', color: '#b71c1c' },
};

const DIETARY_LABELS = {
    'vegetarian': { label: 'Vegetarian', emoji: '🥬', color: '#4caf50' },
    'vegan': { label: 'Vegan', emoji: '🌱', color: '#2e7d32' },
    'gluten-free': { label: 'Gluten Free', emoji: '🌾', color: '#ff9800' },
    'dairy-free': { label: 'Dairy Free', emoji: '🥛', color: '#2196f3' },
};

const PROTEIN_LABELS = {
    'vegetarian': '🥬 Veg',
    'chicken': '🍗 Chicken',
    'pork': '🥓 Pork',
    'beef': '🥩 Beef',
    'fish': '🐟 Fish',
    'seafood': '🦐 Seafood',
    'lamb': '🍖 Lamb',
    'egg': '🥚 Egg',
};

const SERVING_LABELS = {
    'individual': '👤 Individual',
    'sharing': '👥 Sharing (2-3)',
    'family': '👨‍👩‍👧‍👦 Family (4+)',
};

const TIME_LABELS = {
    'all-day': '🕐 All Day',
    'breakfast': '🌅 Breakfast',
    'lunch': '☀️ Lunch',
    'dinner': '🌙 Dinner',
    'late-night': '🌃 Late Night',
};

export default function MealDetail({ meal, open, onClose }) {
    const cartCtx = useContext(CartContext);
    const favCtx = useContext(FavoritesContext);
    const authCtx = useContext(AuthContext);
    const userProgressCtx = useContext(UserProgressContext);
    const [imgLoaded, setImgLoaded] = useState(false);

    const itemInCart = useMemo(() =>
        authCtx.isLoggedIn && meal ? cartCtx.items.find(item => item.id === meal.id) : null,
        [cartCtx.items, meal?.id, authCtx.isLoggedIn]
    );

    const isFavorited = useMemo(() =>
        authCtx.isLoggedIn && meal ? favCtx?.isFavorite(meal.id) : false,
        [favCtx?.favorites, meal?.id, authCtx.isLoggedIn]
    );

    if (!meal) return null;

    const calorieRange = CALORIE_ESTIMATES[meal.category] || CALORIE_ESTIMATES['default'];
    // Use price as a rough proxy for portion size to estimate within range
    const price = Number(meal.price);
    const calorieEstimate = Math.round(
        calorieRange.min + ((price / 1000) * (calorieRange.max - calorieRange.min))
    );
    const calories = Math.min(calorieEstimate, calorieRange.max);

    const spice = SPICE_LABELS[meal.spiceLevel] || { label: meal.spiceLevel, emoji: '', color: '#999' };

    function handleAddToCart() {
        if (!authCtx.isLoggedIn) {
            userProgressCtx.showAuth('login');
            return;
        }
        cartCtx.addItem(meal);
    }

    function handleIncrease() {
        cartCtx.addItem(meal);
    }

    function handleDecrease() {
        cartCtx.removeItem(meal.id);
    }

    function handleToggleFavorite() {
        if (!authCtx.isLoggedIn) {
            userProgressCtx.showAuth('login');
            return;
        }
        if (isFavorited) {
            favCtx.removeFavorite(meal.id);
        } else {
            favCtx.addFavorite(meal);
        }
    }

    return (
        <Modal open={open} onClose={onClose} className="meal-detail-modal">
            <div className="meal-detail">
                {/* Close button */}
                <button className="meal-detail-close" onClick={onClose} title="Close">✕</button>

                {/* Hero image */}
                <div className="meal-detail-hero">
                    <img
                        src={`${API_URL}/${meal.image}`}
                        alt={meal.name}
                        loading="lazy"
                        className={imgLoaded ? 'loaded' : 'loading-shimmer'}
                        onLoad={() => setImgLoaded(true)}
                    />
                    {meal.isChefSpecial && (
                        <span className="meal-detail-chef-badge">⭐ Chef's Special</span>
                    )}
                    <button
                        className={`meal-detail-fav-btn${isFavorited ? ' favorited' : ''}`}
                        onClick={handleToggleFavorite}
                        title={isFavorited ? "Remove from favorites" : "Add to favorites"}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="meal-detail-content">
                    {/* Title & Price */}
                    <div className="meal-detail-title-row">
                        <div>
                            <h2 className="meal-detail-name">{meal.name}</h2>
                            <p className="meal-detail-category">{meal.category}</p>
                        </div>
                        <span className="meal-detail-price">{currencyFormatter.format(meal.price)}</span>
                    </div>

                    {/* Description */}
                    <p className="meal-detail-description">{meal.description}</p>

                    {/* Tags row */}
                    <div className="meal-detail-tags">
                        {meal.dietary && meal.dietary.map(d => {
                            const info = DIETARY_LABELS[d] || { label: d, emoji: '🏷️', color: '#999' };
                            return (
                                <span key={d} className="meal-tag" style={{ borderColor: info.color, color: info.color }}>
                                    {info.emoji} {info.label}
                                </span>
                            );
                        })}
                        <span className="meal-tag" style={{ borderColor: spice.color, color: spice.color }}>
                            {spice.emoji} {spice.label}
                        </span>
                        {meal.protein && PROTEIN_LABELS[meal.protein] && (
                            <span className="meal-tag">{PROTEIN_LABELS[meal.protein]}</span>
                        )}
                    </div>

                    {/* Nutrition & Info Grid */}
                    <div className="meal-detail-info-grid">
                        <div className="info-card">
                            <span className="info-card-icon">🔥</span>
                            <span className="info-card-value">{calories}</span>
                            <span className="info-card-label">Calories (est.)</span>
                        </div>
                        <div className="info-card">
                            <span className="info-card-icon">
                                {meal.servingSize === 'sharing' ? '👥' : meal.servingSize === 'family' ? '👨‍👩‍👧‍👦' : '👤'}
                            </span>
                            <span className="info-card-value">
                                {SERVING_LABELS[meal.servingSize]?.split(' ').slice(1).join(' ') || meal.servingSize}
                            </span>
                            <span className="info-card-label">Serving</span>
                        </div>
                        <div className="info-card">
                            <span className="info-card-icon">🕐</span>
                            <span className="info-card-value">
                                {TIME_LABELS[meal.availableTime]?.split(' ').slice(1).join(' ') || meal.availableTime}
                            </span>
                            <span className="info-card-label">Available</span>
                        </div>
                    </div>

                    {/* Add to Cart Section */}
                    <div className="meal-detail-actions">
                        {!itemInCart ? (
                            <button className="meal-detail-add-btn" onClick={handleAddToCart}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" className="cart-add-icon">
                                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                                    <line x1="3" y1="6" x2="21" y2="6"/>
                                    <path d="M16 10a4 4 0 01-8 0"/>
                                </svg>
                                Add to Cart — {currencyFormatter.format(meal.price)}
                            </button>
                        ) : (
                            <div className="meal-detail-qty-row">
                                <div className="meal-detail-qty-controls">
                                    <button className="qty-btn qty-minus" onClick={handleDecrease}>−</button>
                                    <span className="qty-display">{itemInCart.quantity}</span>
                                    <button className="qty-btn qty-plus" onClick={handleIncrease}>+</button>
                                </div>
                                <span className="meal-detail-subtotal">
                                    {currencyFormatter.format(meal.price * itemInCart.quantity)}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
