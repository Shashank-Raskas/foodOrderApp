import { useContext, useMemo } from "react"
import { currencyFormatter } from "../util/formatting"
import CartContext from "./store/CartContext"
import { API_URL } from "../config/api"

export default function MealItem({meal}) {

    const cartCtx = useContext(CartContext);
    
    // Check if item is in cart
    const itemInCart = useMemo(() => 
        cartCtx.items.find(item => item.id === meal.id),
        [cartCtx.items, meal.id]
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

    return <li className="meal-item">
        <article>
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