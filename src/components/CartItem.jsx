import { currencyFormatter } from "../util/formatting"
import { API_URL } from "../config/api"

export default function CartItem({name, quantity, price, image, onIncrease, onDecrease}) {
 const imgSrc = image ? (image.startsWith('http') ? image : `${API_URL}/${image}`) : null;

 return (
 <li className="cart-item">
    {imgSrc && <img src={imgSrc} alt={name} className="cart-item-img" />}
    <div className="cart-item-info">
        <h3 className="cart-item-name">{name}</h3>
        <p className="cart-item-price">{currencyFormatter.format(price)} each</p>
    </div>
    <div className="cart-item-controls">
        <div className="cart-item-qty">
            <button onClick={onDecrease} className="cart-qty-btn">−</button>
            <span className="cart-qty-value">{quantity}</span>
            <button onClick={onIncrease} className="cart-qty-btn">+</button>
        </div>
        <p className="cart-item-subtotal">{currencyFormatter.format(price * quantity)}</p>
    </div>
 </li>
 );
}