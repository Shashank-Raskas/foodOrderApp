import PageLayout from './UI/PageLayout';

export default function RefundPolicy() {
  return (
    <PageLayout title="Refund Policy" className="policy-page">
      <p className="policy-updated">Last updated: January 2025</p>

      <div className="policy-section">
        <h3>1. Overview</h3>
        <p>
          At The Flavor Alchemist, customer satisfaction is our top priority. If something goes wrong with your
          order, we&apos;re committed to making it right. This Refund Policy outlines when and how you can request
          a refund or replacement.
        </p>
      </div>

      <div className="policy-section">
        <h3>2. Eligible Refund Scenarios</h3>
        <p>You may be eligible for a full or partial refund in the following cases:</p>
        <ul>
          <li><strong>Wrong Items Delivered:</strong> If you received items that were not part of your order.</li>
          <li><strong>Missing Items:</strong> If one or more items from your order are missing.</li>
          <li><strong>Quality Issues:</strong> If the food delivered is stale, spoiled, or significantly different from the description.</li>
          <li><strong>Order Not Delivered:</strong> If your order was not delivered within a reasonable time and was marked as delivered incorrectly.</li>
          <li><strong>Cancellation Before Preparation:</strong> If you cancel the order before the restaurant starts preparing it.</li>
        </ul>
      </div>

      <div className="policy-section">
        <h3>3. How to Request a Refund</h3>
        <ol>
          <li>Go to <strong>My Orders</strong> in your account.</li>
          <li>Select the order you want to report an issue with.</li>
          <li>Email us at <a href="mailto:flavoralchemist9@gmail.com">flavoralchemist9@gmail.com</a> with your Order ID, description of the issue, and any supporting photos.</li>
          <li>Our support team will review your request within 24–48 hours.</li>
        </ol>
      </div>

      <div className="policy-section">
        <h3>4. Refund Timelines</h3>
        <table className="policy-table">
          <thead>
            <tr>
              <th>Refund Method</th>
              <th>Processing Time</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Original Payment Method (Razorpay / PhonePe / Cashfree)</td>
              <td>5–7 business days</td>
            </tr>
            <tr>
              <td>Platform Credits (Wallet)</td>
              <td>Instant — within 2 hours</td>
            </tr>
            <tr>
              <td>Bank Transfer</td>
              <td>7–10 business days</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="policy-section">
        <h3>5. Non-Refundable Scenarios</h3>
        <ul>
          <li>Orders cancelled after the food has been prepared or dispatched.</li>
          <li>Minor variation in food appearance compared to images (images are representative).</li>
          <li>Incorrect delivery address provided by the customer.</li>
          <li>Customer was unavailable at the time of delivery after multiple contact attempts.</li>
          <li>Change of mind after placing the order (once preparation has started).</li>
        </ul>
      </div>

      <div className="policy-section">
        <h3>6. Promotional Offers & Discounts</h3>
        <p>
          Refunds for orders placed using promotional codes or discounts will be calculated on the actual
          amount paid (i.e., the discounted amount). Promo codes or coupons used in refunded orders will
          not be re-issued unless explicitly stated.
        </p>
      </div>

      <div className="policy-section">
        <h3>7. Dispute Resolution</h3>
        <p>
          If you&apos;re not satisfied with our resolution, you can escalate the issue by emailing us at
          <a href="mailto:flavoralchemist9@gmail.com"> flavoralchemist9@gmail.com</a> with the subject line
          &quot;Escalation — [Order ID]&quot;. Our senior support team will review and respond within 48 hours.
        </p>
      </div>

      <div className="policy-section">
        <h3>8. Contact</h3>
        <p>
          For refund-related queries:<br />
          Email: <a href="mailto:flavoralchemist9@gmail.com">flavoralchemist9@gmail.com</a><br />
          Phone: 040-4857-2936<br />
          Support Hours: Monday — Sunday, 9:00 AM — 11:00 PM IST
        </p>
      </div>
    </PageLayout>
  );
}
