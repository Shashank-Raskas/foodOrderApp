import { useContext, useEffect, useState } from "react";
import Modal from "./UI/Modal";
import UserProgressContext from "./store/UserProgressContext";
import AuthContext from "./store/AuthContext";
import { API_ENDPOINTS } from "../config/api.js";
import { currencyFormatter } from "../util/formatting";
import './OrderHistory.css';

export default function OrderHistory() {
    const userProgressCtx = useContext(UserProgressContext);
    const authCtx = useContext(AuthContext);
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (userProgressCtx.progress === 'orderHistory' && authCtx.user) {
            console.log('[OrderHistory] Modal opened, fetching orders for userId:', authCtx.user.userId);
            console.log('[OrderHistory] API Endpoint:', API_ENDPOINTS.USER_ORDERS);
            fetchOrders();
        }
    }, [userProgressCtx.progress, authCtx.user]);

    async function fetchOrders() {
        setIsLoading(true);
        setError(null);
        try {
            const url = `${API_ENDPOINTS.USER_ORDERS}?userId=${authCtx.user.userId}`;
            console.log('[OrderHistory] Fetching from URL:', url);
            
            const response = await fetch(url);
            console.log('[OrderHistory] Response status:', response.status);
            console.log('[OrderHistory] Response headers:', response.headers);
            
            const text = await response.text();
            console.log('[OrderHistory] Response text:', text.substring(0, 200));
            
            if (!response.ok) {
                try {
                    const data = JSON.parse(text);
                    throw new Error(data.message || `HTTP ${response.status}`);
                } catch (parseErr) {
                    throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
                }
            }
            
            const data = JSON.parse(text);
            console.log('[OrderHistory] Orders fetched:', data.orders);
            setOrders(data.orders || []);
        } catch (err) {
            console.error('[OrderHistory] Error:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }

    function handleClose() {
        userProgressCtx.hideOrderHistory?.();
    }

    return (
        <Modal open={userProgressCtx.progress === 'orderHistory'} onClose={handleClose}>
            <div className="order-history-container">
                <div className="order-history-header">
                    <h2>📋 Order History</h2>
                    <button className="close-btn" onClick={handleClose}>✕</button>
                </div>

                {isLoading && (
                    <div className="loading-state">
                        <p>Loading orders...</p>
                    </div>
                )}

                {error && (
                    <div className="error-state">
                        <p>❌ {error}</p>
                    </div>
                )}

                {!isLoading && !error && orders.length === 0 && (
                    <div className="empty-orders">
                        <p className="empty-icon">🛒</p>
                        <p className="empty-text">No orders yet!</p>
                        <p className="empty-hint">Start ordering your favorite meals</p>
                    </div>
                )}

                {!isLoading && !error && orders.length > 0 && (
                    <div className="orders-list">
                        {orders.map((order) => (
                            <div key={order.id} className="order-card">
                                <div className="order-card-header">
                                    <div className="order-info">
                                        <h3>Order #{order.id?.slice(-8) || 'N/A'}</h3>
                                        <p className="order-date">
                                            {new Date(order.createdAt).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'long',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </p>
                                    </div>
                                    <div className="order-total">
                                        <p className="total-label">Total</p>
                                        <p className="total-price">
                                            {currencyFormatter.format(
                                                order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div className="order-items">
                                    <h4>Items:</h4>
                                    <ul>
                                        {order.items.map((item, idx) => (
                                            <li key={idx} className="order-item">
                                                <span className="item-name">{item.name}</span>
                                                <span className="item-qty">x{item.quantity}</span>
                                                <span className="item-price">
                                                    {currencyFormatter.format(item.price * item.quantity)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="order-customer">
                                    <h4>Delivery Address:</h4>
                                    <p>
                                        {order.customer.name}<br/>
                                        {order.customer.street}<br/>
                                        {order.customer.city}, {order.customer['postal-code']}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
