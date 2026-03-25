import { useContext } from "react";
import Modal from "./UI/Modal";
import FavoritesContext from "./store/FavoritesContext";
import UserProgressContext from "./store/UserProgressContext";
import MealItem from "./MealItem";
import { currencyFormatter } from "../util/formatting";
import './Favorites.css';

export default function Favorites() {
    const favCtx = useContext(FavoritesContext);
    const userProgressCtx = useContext(UserProgressContext);

    function handleClose() {
        userProgressCtx.hideFavorites?.();
    }

    return (
        <Modal open={userProgressCtx.progress === 'favorites'} onClose={handleClose}>
            <div className="favorites-container">
                <div className="favorites-header">
                    <h2>❤️ My Favorites</h2>
                    <button className="close-btn" onClick={handleClose}>✕</button>
                </div>

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
                                <img src={meal.image} alt={meal.name} className="fav-image" />
                                <div className="fav-info">
                                    <h3>{meal.name}</h3>
                                    <p className="fav-description">{meal.description}</p>
                                    <p className="fav-price">₹{typeof meal.price === 'string' ? parseFloat(meal.price).toFixed(2) : meal.price.toFixed(2)}</p>
                                </div>
                                <button 
                                    className="remove-fav-btn"
                                    onClick={() => favCtx.removeFavorite(meal.id)}
                                    title="Remove from favorites"
                                >
                                    ❤️
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
