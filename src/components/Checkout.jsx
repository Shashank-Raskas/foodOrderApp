import { useContext, useState, useEffect } from "react";
import Modal from "./UI/Modal";
import CartContext from "./store/CartContext";
import { currencyFormatter } from "../util/formatting";
import UserProgressContext from "./store/UserProgressContext";
import AuthContext from "./store/AuthContext";
import useHttp from "../hooks/useHttp";
import Error from "./Error";
import { API_ENDPOINTS, API_URL } from "../config/api";

const requestConfig = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
};

export default function Checkout() {
    const cartCtx = useContext(CartContext);
    const userProgressCtx = useContext(UserProgressContext);
    const authCtx = useContext(AuthContext);

    const [addresses, setAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState(null);
    const [showNewAddress, setShowNewAddress] = useState(false);
    const [contactInfo, setContactInfo] = useState({
        name: '',
        email: '',
        phone: '',
    });
    const [newAddress, setNewAddress] = useState({
        label: 'Home',
        street: '',
        postalCode: '',
        city: '',
    });
    const [formErrors, setFormErrors] = useState({});
    const [saveAddress, setSaveAddress] = useState(true);

    const { data, error, isLoading, sendRequest, clearData } = useHttp(API_ENDPOINTS.ORDERS, requestConfig);

    const cartTotal = cartCtx.items.reduce((totalPrice, item) => totalPrice + item.quantity * item.price, 0);
    const totalItems = cartCtx.items.reduce((t, i) => t + i.quantity, 0);

    // Load user data and addresses when modal opens
    useEffect(() => {
        if (userProgressCtx.progress === 'checkout' && authCtx.user) {
            setContactInfo({
                name: authCtx.user.name || '',
                email: authCtx.user.email || '',
                phone: authCtx.user.phone || '',
            });
            fetchAddresses();
        }
    }, [userProgressCtx.progress, authCtx.user]);

    async function fetchAddresses() {
        try {
            const res = await fetch(`${API_ENDPOINTS.USER_ADDRESSES}?userId=${authCtx.user.userId}`);
            const data = await res.json();
            if (data.addresses && data.addresses.length > 0) {
                setAddresses(data.addresses);
                const defaultAddr = data.addresses.find(a => a.isDefault) || data.addresses[0];
                setSelectedAddressId(defaultAddr.id);
                setShowNewAddress(false);
            } else {
                setAddresses([]);
                setShowNewAddress(true);
            }
        } catch (err) {
            console.error('Failed to fetch addresses:', err);
            setShowNewAddress(true);
        }
    }

    function handleClose() {
        userProgressCtx.hideCheckout();
        setFormErrors({});
    }

    function handleFinish() {
        userProgressCtx.hideCheckout();
        cartCtx.clearCart();
        clearData();
        setFormErrors({});
        setNewAddress({ label: 'Home', street: '', postalCode: '', city: '' });
    }

    function handleContactChange(e) {
        setContactInfo(prev => ({ ...prev, [e.target.name]: e.target.value }));
        if (formErrors[e.target.name]) setFormErrors(prev => ({ ...prev, [e.target.name]: '' }));
    }

    function handleNewAddressChange(e) {
        setNewAddress(prev => ({ ...prev, [e.target.name]: e.target.value }));
        if (formErrors[e.target.name]) setFormErrors(prev => ({ ...prev, [e.target.name]: '' }));
    }

    async function handleSubmit(event) {
        event.preventDefault();
        const errors = {};

        if (!contactInfo.name.trim()) errors.name = 'Name is required';
        if (!contactInfo.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactInfo.email)) errors.email = 'Valid email is required';

        let orderAddress;
        if (showNewAddress) {
            if (!newAddress.street.trim()) errors.street = 'Street is required';
            if (!newAddress.postalCode.trim()) errors.postalCode = 'Postal code is required';
            if (!newAddress.city.trim()) errors.city = 'City is required';
            orderAddress = newAddress;
        } else {
            const selected = addresses.find(a => a.id === selectedAddressId);
            if (!selected) {
                errors.address = 'Please select a delivery address';
            } else {
                orderAddress = selected;
            }
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setFormErrors({});

        // Save new address if opted
        if (showNewAddress && saveAddress && authCtx.user) {
            try {
                const res = await fetch(API_ENDPOINTS.USER_ADDRESSES, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: authCtx.user.userId,
                        address: {
                            ...newAddress,
                            name: contactInfo.name,
                            phone: contactInfo.phone,
                            isDefault: addresses.length === 0,
                        },
                    }),
                });
                const savedData = await res.json();
                if (savedData.address) {
                    setAddresses(prev => [savedData.address, ...prev]);
                }
            } catch (err) {
                console.error('Failed to save address:', err);
            }
        }

        // Update phone on user if changed
        if (authCtx.user && contactInfo.phone !== (authCtx.user.phone || '')) {
            try {
                await fetch(API_ENDPOINTS.USER_CONTACT, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: authCtx.user.userId, phone: contactInfo.phone }),
                });
                authCtx.updateUser({ phone: contactInfo.phone });
            } catch (err) { /* silent */ }
        }

        await sendRequest(JSON.stringify({
            order: {
                items: cartCtx.items,
                customer: {
                    name: contactInfo.name,
                    email: contactInfo.email,
                    phone: contactInfo.phone,
                    street: orderAddress.street,
                    'postal-code': orderAddress.postalCode || orderAddress['postal-code'],
                    city: orderAddress.city,
                },
            },
            userId: authCtx.user?.userId,
        }));
    }

    // Success view
    if (data && !error) {
        return (
            <Modal open={userProgressCtx.progress === 'checkout'} onClose={handleFinish}>
                <div className="checkout-container">
                    <div className="checkout-success">
                        <div className="success-icon">✅</div>
                        <h2>Order Placed!</h2>
                        <p>Your order has been placed successfully.</p>
                        <p className="success-hint">We'll send a confirmation to <strong>{contactInfo.email}</strong></p>
                        <button className="checkout-done-btn" onClick={handleFinish}>Done</button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal open={userProgressCtx.progress === 'checkout'} onClose={handleClose}>
            <div className="checkout-container">
                <div className="checkout-header">
                    <h2>🛍️ Checkout</h2>
                    <button className="checkout-close-btn" onClick={handleClose} type="button">✕</button>
                </div>

                {/* Order Summary */}
                <div className="checkout-section checkout-order-summary">
                    <h3>Order Summary</h3>
                    <div className="checkout-items">
                        {cartCtx.items.map(item => {
                            const imgSrc = item.image ? (item.image.startsWith('http') ? item.image : `${API_URL}/${item.image}`) : null;
                            return (
                                <div key={item.id} className="checkout-item">
                                    {imgSrc && <img src={imgSrc} alt={item.name} className="checkout-item-img" />}
                                    <div className="checkout-item-info">
                                        <span className="checkout-item-name">{item.name}</span>
                                        <span className="checkout-item-qty">× {item.quantity}</span>
                                    </div>
                                    <span className="checkout-item-price">{currencyFormatter.format(item.price * item.quantity)}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="checkout-total-row">
                        <span>Total ({totalItems} items)</span>
                        <span className="checkout-total-amount">{currencyFormatter.format(cartTotal)}</span>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Contact Details */}
                    <div className="checkout-section">
                        <h3>📞 Contact Details</h3>
                        <div className="checkout-field">
                            <label>Full Name</label>
                            <input
                                name="name"
                                value={contactInfo.name}
                                onChange={handleContactChange}
                                placeholder="Your name"
                                className={formErrors.name ? 'input-error' : ''}
                            />
                            {formErrors.name && <span className="checkout-error">{formErrors.name}</span>}
                        </div>
                        <div className="checkout-field-row">
                            <div className="checkout-field">
                                <label>Email</label>
                                <input
                                    name="email"
                                    type="email"
                                    value={contactInfo.email}
                                    onChange={handleContactChange}
                                    placeholder="your@email.com"
                                    className={formErrors.email ? 'input-error' : ''}
                                />
                                {formErrors.email && <span className="checkout-error">{formErrors.email}</span>}
                            </div>
                            <div className="checkout-field">
                                <label>Phone <span className="optional-tag">(optional)</span></label>
                                <input
                                    name="phone"
                                    type="tel"
                                    value={contactInfo.phone}
                                    onChange={handleContactChange}
                                    placeholder="+91 98765 43210"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Delivery Address */}
                    <div className="checkout-section">
                        <h3>📍 Delivery Address</h3>
                        {formErrors.address && <p className="checkout-error">{formErrors.address}</p>}

                        {addresses.length > 0 && !showNewAddress && (
                            <div className="saved-addresses">
                                {addresses.map(addr => (
                                    <label
                                        key={addr.id}
                                        className={`address-card${selectedAddressId === addr.id ? ' selected' : ''}`}
                                    >
                                        <input
                                            type="radio"
                                            name="selectedAddress"
                                            value={addr.id}
                                            checked={selectedAddressId === addr.id}
                                            onChange={() => setSelectedAddressId(addr.id)}
                                        />
                                        <div className="address-card-content">
                                            <span className="address-label-tag">{addr.label || 'Address'}</span>
                                            <p className="address-text">{addr.street}</p>
                                            <p className="address-text">{addr.city}, {addr.postalCode}</p>
                                        </div>
                                        {addr.isDefault && <span className="default-badge">Default</span>}
                                    </label>
                                ))}
                                <button
                                    type="button"
                                    className="add-new-address-btn"
                                    onClick={() => setShowNewAddress(true)}
                                >
                                    + Add New Address
                                </button>
                            </div>
                        )}

                        {showNewAddress && (
                            <div className="new-address-form">
                                {addresses.length > 0 && (
                                    <button
                                        type="button"
                                        className="back-to-saved-btn"
                                        onClick={() => setShowNewAddress(false)}
                                    >
                                        ← Back to saved addresses
                                    </button>
                                )}
                                <div className="checkout-field">
                                    <label>Address Label</label>
                                    <div className="address-label-options">
                                        {['Home', 'Work', 'Other'].map(lbl => (
                                            <button
                                                key={lbl}
                                                type="button"
                                                className={`label-option${newAddress.label === lbl ? ' active' : ''}`}
                                                onClick={() => setNewAddress(prev => ({ ...prev, label: lbl }))}
                                            >
                                                {lbl === 'Home' ? '🏠' : lbl === 'Work' ? '🏢' : '📍'} {lbl}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="checkout-field">
                                    <label>Street Address</label>
                                    <input
                                        name="street"
                                        value={newAddress.street}
                                        onChange={handleNewAddressChange}
                                        placeholder="123 Main St, Apt 4"
                                        className={formErrors.street ? 'input-error' : ''}
                                    />
                                    {formErrors.street && <span className="checkout-error">{formErrors.street}</span>}
                                </div>
                                <div className="checkout-field-row">
                                    <div className="checkout-field">
                                        <label>Postal Code</label>
                                        <input
                                            name="postalCode"
                                            value={newAddress.postalCode}
                                            onChange={handleNewAddressChange}
                                            placeholder="110001"
                                            className={formErrors.postalCode ? 'input-error' : ''}
                                        />
                                        {formErrors.postalCode && <span className="checkout-error">{formErrors.postalCode}</span>}
                                    </div>
                                    <div className="checkout-field">
                                        <label>City</label>
                                        <input
                                            name="city"
                                            value={newAddress.city}
                                            onChange={handleNewAddressChange}
                                            placeholder="New Delhi"
                                            className={formErrors.city ? 'input-error' : ''}
                                        />
                                        {formErrors.city && <span className="checkout-error">{formErrors.city}</span>}
                                    </div>
                                </div>
                                <label className="save-address-check">
                                    <input
                                        type="checkbox"
                                        checked={saveAddress}
                                        onChange={(e) => setSaveAddress(e.target.checked)}
                                    />
                                    Save this address for future orders
                                </label>
                            </div>
                        )}
                    </div>

                    {error && <Error title="Failed to submit order" message={error} />}

                    <div className="checkout-footer">
                        <button type="button" className="checkout-back-btn" onClick={handleClose}>
                            ← Back to Cart
                        </button>
                        <button type="submit" className="checkout-pay-btn" disabled={isLoading}>
                            {isLoading ? 'Placing Order...' : `Place Order • ${currencyFormatter.format(cartTotal)}`}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}