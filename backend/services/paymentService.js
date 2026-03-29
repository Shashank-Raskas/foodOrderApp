import Razorpay from 'razorpay';
import crypto from 'crypto';
import axios from 'axios';

// ═══════════════════════════════════════════════════════════════
// RAZORPAY
// ═══════════════════════════════════════════════════════════════

let razorpayInstance = null;

function getRazorpay() {
    if (!razorpayInstance) {
        razorpayInstance = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
    }
    return razorpayInstance;
}

export async function createRazorpayOrder(amountInPaise, receipt, notes = {}) {
    const rzp = getRazorpay();
    const order = await rzp.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes,
    });
    return order;
}

export function verifyRazorpaySignature(orderId, paymentId, signature) {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');
    return expectedSignature === signature;
}

// ═══════════════════════════════════════════════════════════════
// PHONEPE
// ═══════════════════════════════════════════════════════════════

function getPhonePeBaseUrl() {
    return process.env.PHONEPE_ENV === 'PRODUCTION'
        ? 'https://api.phonepe.com/apis/hermes'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
}

export async function createPhonePePayment(merchantTransactionId, amountInPaise, redirectUrl, callbackUrl, mobileNumber) {
    const payload = {
        merchantId: process.env.PHONEPE_MERCHANT_ID,
        merchantTransactionId,
        merchantUserId: 'MUID_' + Date.now(),
        amount: amountInPaise,
        redirectUrl,
        redirectMode: 'REDIRECT',
        callbackUrl,
        mobileNumber: mobileNumber || undefined,
        paymentInstrument: {
            type: 'PAY_PAGE',
        },
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';
    const checksum = crypto.createHash('sha256').update(payloadBase64 + '/pg/v1/pay' + saltKey).digest('hex') + '###' + saltIndex;

    const response = await axios.post(
        `${getPhonePeBaseUrl()}/pg/v1/pay`,
        { request: payloadBase64 },
        {
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': checksum,
            },
        }
    );

    return response.data;
}

export async function checkPhonePeStatus(merchantTransactionId) {
    const saltKey = process.env.PHONEPE_SALT_KEY;
    const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';
    const merchantId = process.env.PHONEPE_MERCHANT_ID;
    const path = `/pg/v1/status/${merchantId}/${merchantTransactionId}`;
    const checksum = crypto.createHash('sha256').update(path + saltKey).digest('hex') + '###' + saltIndex;

    const response = await axios.get(`${getPhonePeBaseUrl()}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': checksum,
            'X-MERCHANT-ID': merchantId,
        },
    });

    return response.data;
}

// ═══════════════════════════════════════════════════════════════
// CASHFREE
// ═══════════════════════════════════════════════════════════════

function getCashfreeBaseUrl() {
    return process.env.CASHFREE_ENV === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';
}

export async function createCashfreeOrder(orderId, amountInRupees, customerDetails, returnUrl) {
    const response = await axios.post(
        `${getCashfreeBaseUrl()}/orders`,
        {
            order_id: orderId,
            order_amount: amountInRupees,
            order_currency: 'INR',
            customer_details: {
                customer_id: customerDetails.id || 'cust_' + Date.now(),
                customer_email: customerDetails.email,
                customer_phone: customerDetails.phone || '9999999999',
                customer_name: customerDetails.name,
            },
            order_meta: {
                return_url: returnUrl + '?order_id={order_id}',
            },
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'x-api-version': '2023-08-01',
                'x-client-id': process.env.CASHFREE_APP_ID,
                'x-client-secret': process.env.CASHFREE_SECRET_KEY,
            },
        }
    );

    return response.data;
}

export async function getCashfreeOrderStatus(orderId) {
    const response = await axios.get(
        `${getCashfreeBaseUrl()}/orders/${orderId}`,
        {
            headers: {
                'Content-Type': 'application/json',
                'x-api-version': '2023-08-01',
                'x-client-id': process.env.CASHFREE_APP_ID,
                'x-client-secret': process.env.CASHFREE_SECRET_KEY,
            },
        }
    );

    return response.data;
}

// ═══════════════════════════════════════════════════════════════
// CONFIG (expose key IDs to frontend - never secrets)
// ═══════════════════════════════════════════════════════════════

export function getPaymentConfig() {
    return {
        razorpay: {
            keyId: process.env.RAZORPAY_KEY_ID || '',
        },
        cashfree: {
            env: process.env.CASHFREE_ENV || 'sandbox',
        },
        phonepe: {
            env: process.env.PHONEPE_ENV || 'UAT',
        },
    };
}
