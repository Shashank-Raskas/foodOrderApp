import { createPortal } from 'react-dom';

export default function LoadingOverlay() {
  return createPortal(
    <div className="loading-overlay">
      <div className="loading-container">
        <div className="spinner"></div>
        <h2>Processing Your Order</h2>
        <p>Please wait while we process your order...</p>
      </div>
    </div>,
    document.getElementById('modal')
  );
}
