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

// Available promo codes
const PROMO_CODES = {
    WELCOME60: { type: 'percent', value: 60, maxDiscount: 250, minOrder: 0, label: '60% off up to ₹250 (New User)' },
    FLAT100: { type: 'flat', value: 100, maxDiscount: 100, minOrder: 500, label: '₹100 off on orders above ₹500' },
    TASTY20: { type: 'percent', value: 20, maxDiscount: 150, minOrder: 200, label: '20% off up to ₹150' },
    FEAST50: { type: 'percent', value: 50, maxDiscount: 200, minOrder: 300, label: '50% off up to ₹200' },
};

const PAYMENT_METHODS = [
    {
        id: 'razorpay',
        name: 'Razorpay',
        desc: 'Cards, UPI, Net Banking, Wallets',
        color: '#072654',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="24" height="24" rx="4" fill="#072654"/>
                <path d="M10.5 6L7 18h2.5l1-3.5h3L15 18h2.5L14 6h-3.5zm1 3l1 4h-2l1-4z" fill="#fff"/>
            </svg>
        ),
    },
    {
        id: 'phonepe',
        name: 'PhonePe',
        desc: 'UPI, Cards, Wallet',
        color: '#5f259f',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="24" height="24" rx="4" fill="#5f259f"/>
                <path d="M8 7h4a4 4 0 010 8h-1v3H8V7zm3 6a2 2 0 000-4h-1v4h1z" fill="#fff"/>
            </svg>
        ),
    },
    {
        id: 'cashfree',
        name: 'Cashfree',
        desc: 'UPI, Cards, Net Banking, EMI',
        color: '#00b9f5',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="24" height="24" rx="4" fill="#00b9f5"/>
                <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0 2a3 3 0 110 6 3 3 0 010-6z" fill="#fff"/>
                <circle cx="12" cy="12" r="1.5" fill="#fff"/>
            </svg>
        ),
    },
];

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
        countryCode: '+91',
    });
    const [newAddress, setNewAddress] = useState({
        label: 'Home',
        street: '',
        postalCode: '',
        city: '',
    });
    const [formErrors, setFormErrors] = useState({});
    const [saveAddress, setSaveAddress] = useState(true);

    // Promo code state
    const [promoInput, setPromoInput] = useState('');
    const [appliedPromo, setAppliedPromo] = useState(null);
    const [promoError, setPromoError] = useState('');

    // Payment gateway state
    const [selectedPayment, setSelectedPayment] = useState('razorpay');
    const [paymentProcessing, setPaymentProcessing] = useState(false);
    const [paymentError, setPaymentError] = useState('');
    const [paymentConfig, setPaymentConfig] = useState(null);

    const { data, error, isLoading, sendRequest, clearData } = useHttp(API_ENDPOINTS.ORDERS, requestConfig);

    const cartTotal = cartCtx.items.reduce((totalPrice, item) => totalPrice + item.quantity * item.price, 0);
    const totalItems = cartCtx.items.reduce((t, i) => t + i.quantity, 0);

    // Calculate discount
    let discount = 0;
    if (appliedPromo) {
        const promo = PROMO_CODES[appliedPromo];
        if (promo.type === 'percent') {
            discount = Math.min((cartTotal * promo.value) / 100, promo.maxDiscount);
        } else {
            discount = promo.value;
        }
    }
    const finalTotal = Math.max(cartTotal - discount, 0);

    // Fetch payment gateway config on mount
    useEffect(() => {
        async function fetchConfig() {
            try {
                const res = await fetch(API_ENDPOINTS.PAYMENT_CONFIG);
                const cfg = await res.json();
                setPaymentConfig(cfg);
            } catch (err) {
                console.error('Failed to fetch payment config:', err);
            }
        }
        fetchConfig();
    }, []);

    // Load user data and addresses when modal opens
    useEffect(() => {
        if (userProgressCtx.progress === 'checkout' && authCtx.user) {
            // Extract country code from stored phone if present
            const storedPhone = authCtx.user.phone || '';
            let phoneCode = '+91';
            let phoneNum = storedPhone;
            const codeMatch = storedPhone.match(/^(\+\d{1,4})/);
            if (codeMatch) {
                phoneCode = codeMatch[1];
                phoneNum = storedPhone.slice(codeMatch[1].length);
            }
            setContactInfo({
                name: authCtx.user.name || '',
                email: authCtx.user.email || '',
                phone: phoneNum,
                countryCode: phoneCode,
            });
            fetchAddresses();
        }
    }, [userProgressCtx.progress, authCtx.user]);

    // Populate phone from selected address into contact details
    function populatePhoneFromAddress(addr) {
        if (addr && addr.phone) {
            const phoneStr = addr.phone || '';
            const codeMatch = phoneStr.match(/^(\+\d{1,4})/);
            if (codeMatch) {
                setContactInfo(prev => ({
                    ...prev,
                    countryCode: codeMatch[1],
                    phone: phoneStr.slice(codeMatch[1].length),
                }));
            } else {
                setContactInfo(prev => ({ ...prev, phone: phoneStr }));
            }
        }
    }

    async function fetchAddresses() {
        try {
            const res = await fetch(`${API_ENDPOINTS.USER_ADDRESSES}?userId=${authCtx.user.userId}`);
            const data = await res.json();
            if (data.addresses && data.addresses.length > 0) {
                setAddresses(data.addresses);
                const defaultAddr = data.addresses.find(a => a.isDefault) || data.addresses[0];
                setSelectedAddressId(defaultAddr.id);
                populatePhoneFromAddress(defaultAddr);
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
        setAppliedPromo(null);
        setPromoInput('');
        setPromoError('');
        setSelectedPayment('razorpay');
        setPaymentProcessing(false);
        setPaymentError('');
    }

    function handleApplyPromo() {
        const code = promoInput.trim().toUpperCase();
        if (!code) {
            setPromoError('Please enter a promo code');
            return;
        }
        const promo = PROMO_CODES[code];
        if (!promo) {
            setPromoError('Invalid promo code');
            return;
        }
        if (promo.minOrder > 0 && cartTotal < promo.minOrder) {
            setPromoError(`Minimum order of ${currencyFormatter.format(promo.minOrder)} required`);
            return;
        }
        setAppliedPromo(code);
        setPromoError('');
    }

    function handleRemovePromo() {
        setAppliedPromo(null);
        setPromoInput('');
        setPromoError('');
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
                            phone: contactInfo.phone ? `${contactInfo.countryCode}${contactInfo.phone}` : '',
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

        // Update phone on user if changed (store with country code)
        const fullPhone = contactInfo.phone ? `${contactInfo.countryCode}${contactInfo.phone}` : '';
        if (authCtx.user && fullPhone !== (authCtx.user.phone || '')) {
            try {
                await fetch(API_ENDPOINTS.USER_CONTACT, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: authCtx.user.userId, phone: fullPhone }),
                });
                authCtx.updateUser({ phone: fullPhone });
            } catch (err) { /* silent */ }
        }

        // Build the order payload (used after payment succeeds)
        const orderPayload = {
            order: {
                items: cartCtx.items,
                customer: {
                    name: contactInfo.name,
                    email: contactInfo.email,
                    phone: contactInfo.phone ? `${contactInfo.countryCode}${contactInfo.phone}` : '',
                    street: orderAddress.street,
                    'postal-code': orderAddress.postalCode || orderAddress['postal-code'],
                    city: orderAddress.city,
                },
                promoCode: appliedPromo || null,
                discount: discount,
                paymentMethod: selectedPayment,
                subtotal: cartTotal,
                total: finalTotal,
            },
            userId: authCtx.user?.userId,
        };

        setPaymentProcessing(true);
        setPaymentError('');

        try {
            // ═══ RAZORPAY ═══
            if (selectedPayment === 'razorpay') {
                await processRazorpay(orderPayload);
            }
            // ═══ PHONEPE ═══
            else if (selectedPayment === 'phonepe') {
                await processPhonePe(orderPayload);
            }
            // ═══ CASHFREE ═══
            else if (selectedPayment === 'cashfree') {
                await processCashfree(orderPayload);
            }
        } catch (payErr) {
            console.error('Payment failed:', payErr);
            setPaymentError(payErr.message || 'Payment failed. Please try again.');
            setPaymentProcessing(false);
        }
    }

    // ─── Razorpay Flow ───
    async function processRazorpay(orderPayload) {
        // 1. Create order on backend
        const createRes = await fetch(API_ENDPOINTS.RAZORPAY_CREATE_ORDER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: finalTotal,
                receipt: `order_${Date.now()}`,
                notes: { userId: authCtx.user?.userId },
            }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.message || 'Failed to create Razorpay order');

        // 2. Open Razorpay checkout popup
        return new Promise((resolve, reject) => {
            const options = {
                key: paymentConfig?.razorpay?.keyId,
                amount: createData.amount,
                currency: createData.currency || 'INR',
                name: 'The Flavor Alchemist',
                description: `Order - ${cartCtx.items.length} items`,
                order_id: createData.orderId,
                handler: async function (response) {
                    try {
                        // 3. Verify signature on backend
                        const verifyRes = await fetch(API_ENDPOINTS.RAZORPAY_VERIFY, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                            }),
                        });
                        const verifyData = await verifyRes.json();
                        if (!verifyData.verified) throw new Error('Payment verification failed');

                        // 4. Save the order with payment details
                        orderPayload.order.paymentId = response.razorpay_payment_id;
                        orderPayload.order.paymentStatus = 'paid';
                        await sendRequest(JSON.stringify(orderPayload));
                        setPaymentProcessing(false);
                        resolve();
                    } catch (err) {
                        setPaymentProcessing(false);
                        reject(err);
                    }
                },
                prefill: {
                    name: contactInfo.name,
                    email: contactInfo.email,
                    contact: contactInfo.phone ? `${contactInfo.countryCode}${contactInfo.phone}` : '',
                },
                theme: { color: '#d4a574' },
                modal: {
                    ondismiss: function () {
                        setPaymentProcessing(false);
                        reject(new Error('Payment cancelled by user'));
                    },
                },
            };

            if (!window.Razorpay) {
                setPaymentProcessing(false);
                reject(new Error('Razorpay SDK not loaded. Please refresh and try again.'));
                return;
            }

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response) {
                setPaymentProcessing(false);
                reject(new Error(response.error?.description || 'Razorpay payment failed'));
            });
            rzp.open();
        });
    }

    // ─── PhonePe Flow ───
    async function processPhonePe(orderPayload) {
        const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // 1. Initiate payment on backend
        const initiateRes = await fetch(API_ENDPOINTS.PHONEPE_INITIATE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: finalTotal,
                transactionId,
                phone: contactInfo.phone ? `${contactInfo.countryCode}${contactInfo.phone}` : '',
            }),
        });
        const initiateData = await initiateRes.json();
        if (!initiateRes.ok || !initiateData.success) {
            throw new Error(initiateData.message || 'Failed to initiate PhonePe payment');
        }

        // 2. Store pending order data in sessionStorage for the return callback
        sessionStorage.setItem('pendingPhonePeOrder', JSON.stringify({
            orderPayload,
            transactionId: initiateData.transactionId,
        }));

        // 3. Redirect to PhonePe payment page
        window.location.href = initiateData.redirectUrl;
    }

    // ─── Cashfree Flow ───
    async function processCashfree(orderPayload) {
        // 1. Create order on backend
        const createRes = await fetch(API_ENDPOINTS.CASHFREE_CREATE_ORDER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: finalTotal,
                customerName: contactInfo.name,
                customerEmail: contactInfo.email,
                customerPhone: contactInfo.phone ? `${contactInfo.countryCode}${contactInfo.phone}` : '9999999999',
                customerId: authCtx.user?.userId,
            }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.message || 'Failed to create Cashfree order');

        // 2. Open Cashfree Drop checkout
        return new Promise((resolve, reject) => {
            if (!window.Cashfree) {
                setPaymentProcessing(false);
                reject(new Error('Cashfree SDK not loaded. Please refresh and try again.'));
                return;
            }

            const cashfree = window.Cashfree({
                mode: paymentConfig?.cashfree?.env === 'production' ? 'production' : 'sandbox',
            });

            cashfree.checkout({
                paymentSessionId: createData.paymentSessionId,
                redirectTarget: '_modal',
            }).then(async (result) => {
                if (result.error) {
                    setPaymentProcessing(false);
                    reject(new Error(result.error.message || 'Cashfree payment failed'));
                    return;
                }
                if (result.paymentDetails) {
                    // 3. Verify on backend
                    try {
                        const statusRes = await fetch(`${API_ENDPOINTS.CASHFREE_STATUS}/${createData.orderId}`);
                        const statusData = await statusRes.json();
                        if (statusData.order_status === 'PAID') {
                            orderPayload.order.paymentId = createData.orderId;
                            orderPayload.order.paymentStatus = 'paid';
                            await sendRequest(JSON.stringify(orderPayload));
                            setPaymentProcessing(false);
                            resolve();
                        } else {
                            setPaymentProcessing(false);
                            reject(new Error('Payment not confirmed. Status: ' + statusData.order_status));
                        }
                    } catch (err) {
                        setPaymentProcessing(false);
                        reject(err);
                    }
                }
            }).catch((err) => {
                setPaymentProcessing(false);
                reject(new Error(err.message || 'Cashfree checkout error'));
            });
        });
    }

    // Success view
    if (data && !error) {
        const paymentName = PAYMENT_METHODS.find(p => p.id === selectedPayment)?.name || selectedPayment;
        return (
            <Modal open={userProgressCtx.progress === 'checkout'} onClose={handleFinish}>
                <div className="checkout-container">
                    <div className="checkout-success">
                        <div className="success-icon">✅</div>
                        <h2>Order Placed!</h2>
                        <p>Your order has been placed successfully.</p>
                        <p className="success-hint">Payment processed via <strong>{paymentName}</strong></p>
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
                        <span>Subtotal ({totalItems} items)</span>
                        <span className="checkout-total-amount">{currencyFormatter.format(cartTotal)}</span>
                    </div>
                    {discount > 0 && (
                        <div className="checkout-total-row checkout-discount-row">
                            <span>Discount ({appliedPromo})</span>
                            <span className="checkout-discount-amount">-{currencyFormatter.format(discount)}</span>
                        </div>
                    )}
                    {discount > 0 && (
                        <div className="checkout-total-row checkout-final-row">
                            <span><strong>Total</strong></span>
                            <span className="checkout-total-amount"><strong>{currencyFormatter.format(finalTotal)}</strong></span>
                        </div>
                    )}
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
                                <label>Phone</label>
                                <div className="addr-phone-row">
                                    <select
                                        value={contactInfo.countryCode}
                                        onChange={e => setContactInfo(prev => ({ ...prev, countryCode: e.target.value }))}
                                        className="addr-country-select"
                                    >
                                        <option value="+91">🇮🇳 +91</option>
                                        <option value="+1">🇺🇸 +1</option>
                                        <option value="+44">🇬🇧 +44</option>
                                        <option value="+61">🇦🇺 +61</option>
                                        <option value="+81">🇯🇵 +81</option>
                                        <option value="+49">🇩🇪 +49</option>
                                        <option value="+86">🇨🇳 +86</option>
                                        <option value="+971">🇦🇪 +971</option>
                                        <option value="+65">🇸🇬 +65</option>
                                        <option value="+33">🇫🇷 +33</option>
                                    </select>
                                    <input
                                        type="tel"
                                        value={contactInfo.phone}
                                        onChange={e => setContactInfo(prev => ({ ...prev, phone: e.target.value.replace(/[^0-9]/g, '') }))}
                                        placeholder="9876543210"
                                    />
                                </div>
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
                                            onChange={() => {
                                                setSelectedAddressId(addr.id);
                                                populatePhoneFromAddress(addr);
                                            }}
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
                    {paymentError && <Error title="Payment Failed" message={paymentError} />}

                    {/* ═══ Promo Code ═══ */}
                    <div className="checkout-section checkout-promo-section">
                        <h3>🏷️ Promo Code</h3>
                        {appliedPromo ? (
                            <div className="promo-applied">
                                <div className="promo-applied-info">
                                    <span className="promo-applied-code">{appliedPromo}</span>
                                    <span className="promo-applied-label">{PROMO_CODES[appliedPromo].label}</span>
                                    <span className="promo-applied-saving">You save {currencyFormatter.format(discount)}</span>
                                </div>
                                <button type="button" className="promo-remove-btn" onClick={handleRemovePromo}>Remove</button>
                            </div>
                        ) : (
                            <>
                                <div className="promo-input-row">
                                    <input
                                        type="text"
                                        placeholder="Enter promo code"
                                        value={promoInput}
                                        onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError(''); }}
                                        className="promo-input"
                                    />
                                    <button type="button" className="promo-apply-btn" onClick={handleApplyPromo}>Apply</button>
                                </div>
                                {promoError && <span className="checkout-error promo-error">{promoError}</span>}
                                <div className="promo-suggestions">
                                    <span className="promo-suggestions-label">Available codes:</span>
                                    {Object.entries(PROMO_CODES).map(([code, info]) => (
                                        <button
                                            key={code}
                                            type="button"
                                            className="promo-suggestion-chip"
                                            onClick={() => { setPromoInput(code); }}
                                        >
                                            {code} <span className="promo-chip-info">— {info.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* ═══ Payment Method ═══ */}
                    <div className="checkout-section checkout-payment-section">
                        <h3>💳 Payment Method</h3>
                        <div className="payment-methods">
                            {PAYMENT_METHODS.map(method => (
                                <label
                                    key={method.id}
                                    className={`payment-card${selectedPayment === method.id ? ' payment-selected' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="paymentMethod"
                                        value={method.id}
                                        checked={selectedPayment === method.id}
                                        onChange={() => setSelectedPayment(method.id)}
                                    />
                                    <div className="payment-card-icon">{method.icon}</div>
                                    <div className="payment-card-info">
                                        <span className="payment-card-name">{method.name}</span>
                                        <span className="payment-card-desc">{method.desc}</span>
                                    </div>
                                    {selectedPayment === method.id && <span className="payment-check">✓</span>}
                                </label>
                            ))}
                        </div>
                        <p className="payment-secure-note">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                            All transactions are secured with 256-bit encryption
                        </p>
                    </div>

                    <div className="checkout-footer">
                        <button type="button" className="checkout-back-btn" onClick={handleClose}>
                            ← Back to Cart
                        </button>
                        <button type="submit" className="checkout-pay-btn" disabled={isLoading || paymentProcessing}>
                            {paymentProcessing ? 'Processing Payment...' : isLoading ? 'Placing Order...' : `Pay ${currencyFormatter.format(finalTotal)} • ${PAYMENT_METHODS.find(p => p.id === selectedPayment)?.name}`}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}