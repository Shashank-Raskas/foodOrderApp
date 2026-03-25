import { useContext, useMemo } from "react"
import { currencyFormatter } from "../util/formatting"
import CartContext from "./store/CartContext"
import FavoritesContext from "./store/FavoritesContext"
import { API_URL } from "../config/api"

export default function MealItem({meal}) {

    const cartCtx = useContext(CartContext);
    const favCtx = useContext(FavoritesContext);
    
    // Check if item is in cart
    const itemInCart = useMemo(() => 
        cartCtx.items.find(item => item.id === meal.id),
        [cartCtx.items, meal.id]
    );

    const isFavorited = useMemo(() =>
        favCtx?.isFavorite(meal.id),
        [favCtx?.favorites, meal.id]
    );

    function handleAddToCart(){
        cartCtx.addItem(meal);
    }

    function handleIncreaseQty() {
        cartCtx.addItem(meal);
    }

    function handleDecreaseQty() {
        cartCtx.removeItem(meal.id);
    }

    function handleToggleFavorite() {
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
            <div>
                <h3>{meal.name}</h3>
                <p className="meal-item-price">{currencyFormatter.format(meal.price)}</p>
                <p className="meal-item-description">{meal.description}</p>
            </div>
            <p className="meal-item-actions">
                {!itemInCart ? (
                    // Initial state: single + button
                    <button 
                        className="qty-add-btn" 
                        onClick={handleAddToCart}
                        title="Add to cart"
                    >
                        +
                    </button>
                ) : (
                    // Active state: - qty +
                    <div className="quantity-selector active">
                        <button className="qty-btn qty-minus" onClick={handleDecreaseQty}>−</button>
                        <span className="qty-display">{itemInCart.quantity}</span>
                        <button className="qty-btn qty-plus" onClick={handleIncreaseQty}>+</button>
                    </div>
                )}
            </p>
        </article>
        </li>
}