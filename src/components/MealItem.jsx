import { useContext, useMemo } from "react"
import { currencyFormatter } from "../util/formatting"
import CartContext from "./store/CartContext"
import FavoritesContext from "./store/FavoritesContext"
import AuthContext from "./store/AuthContext"
import UserProgressContext from "./store/UserProgressContext"
import { API_URL } from "../config/api"

export default function MealItem({meal}) {

    const cartCtx = useContext(CartContext);
    const favCtx = useContext(FavoritesContext);
    const authCtx = useContext(AuthContext);
    const userProgressCtx = useContext(UserProgressContext);
    
    // Check if item is in cart
    const itemInCart = useMemo(() => 
        authCtx.isLoggedIn ? cartCtx.items.find(item => item.id === meal.id) : null,
        [cartCtx.items, meal.id, authCtx.isLoggedIn]
    );

    const isFavorited = useMemo(() =>
        authCtx.isLoggedIn ? favCtx?.isFavorite(meal.id) : false,
        [favCtx?.favorites, meal.id, authCtx.isLoggedIn]
    );

    function handleAddToCart(){
        if (!authCtx.isLoggedIn) {
            userProgressCtx.showAuth('login');
            return;
        }
        cartCtx.addItem(meal);
    }

    function handleIncreaseQty() {
        cartCtx.addItem(meal);
    }

    function handleDecreaseQty() {
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

    return <li className="meal-item">
        <article>
            <button 
                className={`favorite-btn${isFavorited ? ' favorited' : ''}`}
                onClick={handleToggleFavorite}
                title={isFavorited ? "Remove from favorites" : "Add to favorites"}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="heart-icon">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
            </button>
            <img src={`${API_URL}/${meal.image}`} alt={meal.name}/>
            <div className="meal-item-body">
                <h3>{meal.name}</h3>
                <p className="meal-item-price">{currencyFormatter.format(meal.price)}</p>
                <p className="meal-item-description">{meal.description}</p>
            </div>
            <div className="meal-item-footer">
                {!itemInCart ? (
                    <button className="add-to-cart-btn" onClick={handleAddToCart}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="cart-add-icon">
                            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <path d="M16 10a4 4 0 01-8 0"/>
                        </svg>
                        Add to Cart
                    </button>
                ) : (
                    <div className="quantity-selector active">
                        <button className="qty-btn qty-minus" onClick={handleDecreaseQty}>−</button>
                        <span className="qty-display">{itemInCart.quantity}</span>
                        <button className="qty-btn qty-plus" onClick={handleIncreaseQty}>+</button>
                    </div>
                )}
            </div>
        </article>
        </li>
}