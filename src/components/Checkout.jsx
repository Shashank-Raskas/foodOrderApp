import { useContext } from "react";   // for using the context 
import Modal from "./UI/Modal";
import CartContext from "./store/CartContext";  // to access the cart context without using props
import { currencyFormatter } from "../util/formatting";
import Input from "./UI/Input";
import Button from "./UI/Button";
import UserProgressContext from "./store/UserProgressContext";
import useHttp from "../hooks/useHttp";
import Error from "./Error";

const requestConfig = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
};

export default function Checkout({ item, onRemove, onAdd }) {

    const cartCtx = useContext(CartContext);
    const userProgresCtx = useContext(UserProgressContext)

    const {data, isLoading: isSending, error, sendRequest,clearData} = useHttp('http://localhost:3000/orders', requestConfig);
    const cartTotal = cartCtx.items.reduce((totalPrice, item) => totalPrice + item.quantity * item.price,
        0
    );

    function handleClose() {
        userProgresCtx.hideCheckout();
    }

    function handleFinish() {
        userProgresCtx.hideCheckout();
        cartCtx.clearCart(); // Clear the cart when the checkout is finished
        clearData(); // Clear the data after the checkout is finished
    }

    function handleSubmit(event) {
        event.preventDefault(); // Prevent the default form submission behavior
        // Here you would typically handle the form submission, e.g., send data to a server
        console.log("Form submitted");
        // userProgresCtx.hideCheckout(); // Close the checkout modal after submission
        const fd = new FormData(event.target); // Get the form data
        // const customerData = {
        //     fullName: fd.get('full-name'),
        //     email: fd.get('email'),
        //     street: fd.get('street'),
        //     postalCode: fd.get('postal-code'),
        //     city: fd.get('city')
        // };
        const customerData = Object.fromEntries(fd.entries()); // Convert FormData to an object

        sendRequest(JSON.stringify({
            order: {
                items: cartCtx.items,
            customer: customerData
        },
    })
);

    //     fetch('http://localhost:3000/orders', {  //!fetch by default uses GET method, so we need to specify the method as POST
    //         method: 'POST',
    //         headers: {
    //             'Content-Type': 'application/json',  //!commented as we are using useHttp hook
    //         },
    //         body: JSON.stringify({
    //             order: {
    //                 items: cartCtx.items,
    //             customer: customerData,
    //             totalAmount: cartTotal
    //         }
    //         }),
    //     });
    }

    let actions = (
        <>
        <Button type='button' textOnly onClick={handleClose}>Close</Button>
        <Button>Submit Order</Button>
        </>
    );

    if (isSending) {
        actions = <span>Sending order data...</span>;
    }

    if (data && !error) {
        return (
            <Modal open={userProgresCtx.progress === 'checkout'} onClose={handleFinish}>
                <h2>Order Successful!</h2>
                <p>Your order has been placed successfully.</p>
                <p>We will get back to you with more details via email with in next few minutes</p>
                <p className="modal-actions">
                    <Button onClick={handleFinish}>Okay</Button>
                </p>
            </Modal>
        );
    }
    return (
        <Modal open={userProgresCtx.progress === 'checkout'} onClose={handleClose}>
        <form onSubmit ={handleSubmit}>
            <h2>Checkout</h2>
            <p>Total Amount: {currencyFormatter.format(cartTotal)}</p>
            <p>Are you sure you want to proceed with the checkout?</p>  //!id should match with backend field names
            <Input label='Full Name' type = 'text' id='name'/>
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
            {error && <Error title="failed to submit order" message={error} />}
            <p className="modal-actions">{actions}</p>
        </form>
    </Modal>
    );
}