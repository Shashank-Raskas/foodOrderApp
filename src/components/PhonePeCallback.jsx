import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_ENDPOINTS } from '../config/api';
import PageLayout from './UI/PageLayout';

export default function PhonePeCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState('verifying'); // verifying | success | failed
    const [message, setMessage] = useState('Verifying your payment...');

    useEffect(() => {
        async function verifyPayment() {
            try {
                // Retrieve pending order from sessionStorage
                const pending = sessionStorage.getItem('pendingPhonePeOrder');
                if (!pending) {
                    setStatus('failed');
                    setMessage('No pending order found. Payment may have already been processed.');
                    return;
                }

                const { orderPayload, transactionId } = JSON.parse(pending);

                // Check payment status with backend
                const res = await fetch(`${API_ENDPOINTS.PHONEPE_STATUS}/${transactionId}`);
                const data = await res.json();

                if (data.success && data.code === 'PAYMENT_SUCCESS') {
                    // Payment verified — save the order
                    orderPayload.order.paymentId = transactionId;
                    orderPayload.order.paymentStatus = 'paid';

                    const orderRes = await fetch(API_ENDPOINTS.ORDERS, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(orderPayload),
                    });

                    if (orderRes.ok) {
                        sessionStorage.removeItem('pendingPhonePeOrder');
                        setStatus('success');
                        setMessage('Payment successful! Your order has been placed.');
                    } else {
                        setStatus('failed');
                        setMessage('Payment succeeded but order placement failed. Please contact support.');
                    }
                } else {
                    setStatus('failed');
                    setMessage(data.message || 'Payment was not successful. Please try again.');
                }
            } catch (err) {
                console.error('PhonePe callback error:', err);
                setStatus('failed');
                setMessage('Failed to verify payment. Please contact support.');
            }
        }

        verifyPayment();
    }, [searchParams]);

    return (
        <PageLayout title="Payment Status" className="payment-callback-page">
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                {status === 'verifying' && (
                    <>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                        <h2 style={{ color: '#ffc404', marginBottom: '0.5rem' }}>Verifying Payment</h2>
                        <p style={{ color: '#b0a89c' }}>{message}</p>
                    </>
                )}
                {status === 'success' && (
                    <>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                        <h2 style={{ color: '#27ae60', marginBottom: '0.5rem' }}>Order Placed!</h2>
                        <p style={{ color: '#b0a89c', marginBottom: '2rem' }}>{message}</p>
                        <button
                            onClick={() => navigate('/orders')}
                            style={{
                                padding: '12px 32px', borderRadius: '8px', border: 'none',
                                background: 'linear-gradient(135deg, #ffc404, #e0a800)',
                                color: '#1a1400', fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
                            }}
                        >
                            View My Orders
                        </button>
                    </>
                )}
                {status === 'failed' && (
                    <>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                        <h2 style={{ color: '#e74c3c', marginBottom: '0.5rem' }}>Payment Failed</h2>
                        <p style={{ color: '#b0a89c', marginBottom: '2rem' }}>{message}</p>
                        <button
                            onClick={() => navigate('/menu')}
                            style={{
                                padding: '12px 32px', borderRadius: '8px', border: 'none',
                                background: 'linear-gradient(135deg, #ffc404, #e0a800)',
                                color: '#1a1400', fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
                            }}
                        >
                            Back to Menu
                        </button>
                    </>
                )}
            </div>
        </PageLayout>
    );
}
