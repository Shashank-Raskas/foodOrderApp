import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./UI/Modal";
import CartContext from "./store/CartContext";
import { currencyFormatter } from "../util/formatting";
import UserProgressContext from "./store/UserProgressContext";
import CartItem from "./CartItem";


export default function Cart() {
    const cartCtx = useContext(CartContext);
    const userProgressCtx = useContext(UserProgressContext);
    const navigate = useNavigate();
    const cartTotal = cartCtx.items.reduce((totalPrice, item) => totalPrice + item.quantity * item.price, 0);
    const totalItems = cartCtx.items.reduce((total, item) => total + item.quantity, 0);

    function handleCloseCart() {
        userProgressCtx.hideCart();
    }

    function handleBrowseMeals() {
        userProgressCtx.hideCart();
        navigate('/');
    }

    function handleGoToCheckout() {
        userProgressCtx.showCheckout();
    }

    return (
        <Modal
            className='cart-modal'
            open={userProgressCtx.progress === 'cart'}
            onClose={userProgressCtx.progress === 'cart' ? handleCloseCart : null}
        > 
            <div className="cart-container">
                <div className="cart-header">
                    <div className="cart-header-left">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <path d="M16 10a4 4 0 01-8 0"/>
                        </svg>
                        <h2>Your Cart</h2>
                        {totalItems > 0 && <span className="cart-count-badge">{totalItems} items</span>}
                    </div>
                    <button className="cart-close-btn" onClick={handleCloseCart}>✕</button>
                </div>

                {cartCtx.items.length === 0 ? (
                    <div className="cart-empty">
                        <p className="cart-empty-icon">🛒</p>
                        <p className="cart-empty-text">Your cart is empty</p>
                        <p className="cart-empty-hint">Add some delicious meals to get started!</p>
                        <button className="cart-browse-btn" onClick={handleBrowseMeals}>Browse Meals</button>
                    </div>
                ) : (
                    <>
                        <ul className="cart-items-list">
                            {cartCtx.items.map((item) => (
                                <CartItem 
                                    key={item.id} 
                                    price={item.price}
                                    quantity={item.quantity}
                                    name={item.name}
                                    image={item.image}
                                    onIncrease={() => cartCtx.addItem(item)}
                                    onDecrease={() => cartCtx.removeItem(item.id)}
                                />
                            ))}
                        </ul>

                        <div className="cart-summary">
                            <div className="cart-summary-row">
                                <span>Subtotal ({totalItems} items)</span>
                                <span>{currencyFormatter.format(cartTotal)}</span>
                            </div>
                            <div className="cart-summary-row cart-summary-total">
                                <span>Total</span>
                                <span>{currencyFormatter.format(cartTotal)}</span>
                            </div>
                        </div>

                        <div className="cart-footer">
                            <button className="cart-continue-btn" onClick={handleCloseCart}>
                                Continue Shopping
                            </button>
                            <button className="cart-checkout-btn" onClick={handleGoToCheckout}>
                                Proceed to Checkout →
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}