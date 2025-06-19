import { useContext } from "react";   // for using the context 
import Modal from "./UI/Modal";
import CartContext from "./store/CartContext";  // to access the cart context without using props
import { currencyFormatter } from "../util/formatting";
import Input from "./UI/Input";
import Button from "./UI/Button";
import UserProgressContext from "./store/UserProgressContext";

export default function Checkout({ item, onRemove, onAdd }) {

    const cartCtx = useContext(CartContext);
    const userProgresCtx = useContext(UserProgressContext)

    const cartTotal = cartCtx.items.reduce((totalPrice, item) => totalPrice + item.quantity * item.price,
        0
    );

    function handleClose() {
        userProgresCtx.hideCheckout();
    }

    return (
        <Modal open={userProgresCtx.progress === 'checkout'} onClose={handleClose}>
        <form>
            <h2>Checkout</h2>
            <p>Total Amount: {currencyFormatter.format(cartTotal)}</p>
            <p>Are you sure you want to proceed with the checkout?</p>
            <Input label='Full Name' type = 'text' id='full-name'/>
            <Input label='E-mail Address' type = 'email' id='email'/>
            <Input label='Street' type='text' id='street'/>
            <div className="control-row">
                <Input label='Postal Code' type='text' id='postal-code'/>
                <Input label='City' type='text' id='city'/>
            </div>
            {/* <ul>
                <li>{item.name} - {item.quantity} x {item.price}</li>
            </ul>
            <div className="modal-actions">
                <button type="button" onClick={onRemove}>Cancel</button> //!its comment cuz we using Input component
                <button type="submit" onClick={onAdd}>Confirm</button>
            </div> */}
            <p className="modal-actions">
                <Button type='button' textOnly onClick={handleClose}>Close</Button>
                <Button>Submit Order</Button>
            </p>
        </form>
    </Modal>
    );
}