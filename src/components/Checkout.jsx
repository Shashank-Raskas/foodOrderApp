import { useContext, useState } from "react";
import Modal from "./UI/Modal";
import CartContext from "./store/CartContext";
import { currencyFormatter } from "../util/formatting";
import Input from "./UI/Input";
import Button from "./UI/Button";
import UserProgressContext from "./store/UserProgressContext";
import useHttp from "../hooks/useHttp";
import Error from "./Error";
import { API_ENDPOINTS } from "../config/api";
import { validateCheckoutForm, hasErrors } from "../util/validation";

const requestConfig = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
};

export default function Checkout() {
    const cartCtx = useContext(CartContext);
    const userProgressCtx = useContext(UserProgressContext);
    const [formErrors, setFormErrors] = useState({});
    
    const { data, error, isLoading, sendRequest, clearData } = useHttp(API_ENDPOINTS.ORDERS, requestConfig);
    
    const cartTotal = cartCtx.items.reduce((totalPrice, item) => totalPrice + item.quantity * item.price, 0);

    function handleClose() {
        userProgressCtx.hideCheckout();
        setFormErrors({});
    }

    function handleFinish() {
        userProgressCtx.hideCheckout();
        cartCtx.clearCart();
        clearData();
        setFormErrors({});
    }

    async function handleSubmit(event) {
        event.preventDefault();
        
        const fd = new FormData(event.target);
        const customerData = Object.fromEntries(fd.entries());
        
        // Validate form data
        const errors = validateCheckoutForm(customerData);
        if (hasErrors(errors)) {
            setFormErrors(errors);
            return;
        }
        
        setFormErrors({});

        await sendRequest(JSON.stringify({
            order: {
                items: cartCtx.items,
                customer: customerData
            },
        }));
    }

    // Show success message when order is submitted successfully
    if (data && !error) {
        return (
            <Modal open={userProgressCtx.progress === 'checkout'} onClose={handleFinish}>
                <h2>Order Successful!</h2>
                <p>Your order has been placed successfully.</p>
                <p>We will get back to you with more details via email within next few minutes.</p>
                <p className="modal-actions">
                    <Button onClick={handleFinish}>Okay</Button>
                </p>
            </Modal>
        );
    }

    // Show checkout form
    return (
        <Modal open={userProgressCtx.progress === 'checkout'} onClose={handleClose}>
            <form onSubmit={handleSubmit}>
                <h2>Checkout</h2>
                <p>Total Amount: {currencyFormatter.format(cartTotal)}</p>
                <p>Please enter your details to complete the order.</p>
                
                <Input 
                    label='Full Name' 
                    type='text' 
                    id='name'
                    error={formErrors.name}
                />
                <Input 
                    label='E-mail Address' 
                    type='email' 
                    id='email'
                    error={formErrors.email}
                />
                <Input 
                    label='Street' 
                    type='text' 
                    id='street'
                    error={formErrors.street}
                />
                <div className="control-row">
                    <Input 
                        label='Postal Code' 
                        type='text' 
                        id='postal-code'
                        error={formErrors['postal-code']}
                    />
                    <Input 
                        label='City' 
                        type='text' 
                        id='city'
                        error={formErrors.city}
                    />
                </div>
                
                {error && <Error title="Failed to submit order" message={error} />}
                
                <p className="modal-actions">
                    <Button type='button' textOnly onClick={handleClose}>Close</Button>
                    <Button type='submit'>Submit Order</Button>
                </p>
            </form>
        </Modal>
    );
}