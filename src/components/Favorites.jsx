import { useContext } from "react";
import PageLayout from "./UI/PageLayout";
import FavoritesContext from "./store/FavoritesContext";
import CartContext from "./store/CartContext";
import AuthContext from "./store/AuthContext";
import UserProgressContext from "./store/UserProgressContext";
import { useNavigate } from "react-router-dom";
import { currencyFormatter } from "../util/formatting";
import { API_URL } from "../config/api";
import './Favorites.css';

export default function Favorites() {
    const favCtx = useContext(FavoritesContext);
    const cartCtx = useContext(CartContext);
    const authCtx = useContext(AuthContext);
    const userProgressCtx = useContext(UserProgressContext);
    const navigate = useNavigate();

    function handleAddToCart(meal) {
        if (!authCtx.isLoggedIn) {
            userProgressCtx.showAuth('login');
            return;
        }
        cartCtx.addItem(meal);
    }

    function handleViewDetail(meal) {
        navigate(`/meal/${meal.id}`, { state: { meal } });
    }

    return (
        <PageLayout title="❤️ My Favorites" className="favorites-page">
            <div className="favorites-container page-view">
                {favCtx.favorites.length === 0 ? (
                    <div className="empty-favorites">
                        <p className="empty-icon">💔</p>
                        <p className="empty-text">No favorite meals yet!</p>
                        <p className="empty-hint">Click the ❤️ icon on meal items to add them to favorites</p>
                    </div>
                ) : (
                    <div className="favorites-list">
                        {favCtx.favorites.map(meal => (
                            <div key={meal.id} className="favorite-item">
                                <img 
                                    src={meal.image?.startsWith('http') ? meal.image : `${API_URL}/${meal.image}`} 
                                    alt={meal.name} 
                                    className="fav-image" 
                                    onClick={() => handleViewDetail(meal)}
                                    style={{ cursor: 'pointer' }}
                                />
                                <div className="fav-info" onClick={() => handleViewDetail(meal)} style={{ cursor: 'pointer' }}>
                                    <h3>{meal.name}</h3>
                                    <p className="fav-description">{meal.description}</p>
                                    <p className="fav-price">{currencyFormatter.format(meal.price)}</p>
                                </div>
                                <div className="fav-actions">
                                    <button 
                                        className="fav-add-cart-btn"
                                        onClick={() => handleAddToCart(meal)}
                                        title="Add to cart"
                                    >
                                        🛒
                                    </button>
                                    <button 
                                        className="remove-fav-btn"
                                        onClick={() => favCtx.removeFavorite(meal.id)}
                                        title="Remove from favorites"
                                    >
                                        ❤️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </PageLayout>
    );
}
