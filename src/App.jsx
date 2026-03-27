import { useContext, useState, useEffect } from "react";
import Cart from "./components/Cart";
import Checkout from "./components/Checkout";
import Header from "./components/Header";
import Meals from "./components/Meals";
import AuthModal from "./components/AuthModal";
import UserProfile from "./components/UserProfile";
import Favorites from "./components/Favorites";
import OrderHistory from "./components/OrderHistory";
import MealDetail from "./components/MealDetail";
import { CartContextProvider } from "./components/store/CartContext";
import { UserProgressContextProvider } from "./components/store/UserProgressContext";
import { AuthContextProvider } from "./components/store/AuthContext";
import { FavoritesContextProvider } from "./components/store/FavoritesContext";
import { SearchContextProvider } from "./components/store/SearchContext";
import AuthContext from "./components/store/AuthContext";

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 400);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      className="scroll-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="Back to top"
      aria-label="Scroll to top"
    >
      ↑
    </button>
  );
}

function AppContent() {
  const authCtx = useContext(AuthContext);
  const [selectedMeal, setSelectedMeal] = useState(null);

  return (
    <>
      <Header />
      <Meals onViewMealDetail={(meal) => setSelectedMeal(meal)} />
      <AuthModal />
      <MealDetail
        meal={selectedMeal}
        open={!!selectedMeal}
        onClose={() => setSelectedMeal(null)}
      />
      {authCtx.isLoggedIn && (
        <>
          <Cart />
          <Checkout />
          <UserProfile />
          <Favorites />
          <OrderHistory />
        </>
      )}
      <ScrollToTopButton />
    </>
  );
}

function App() {
  return (
    <AuthContextProvider>
      <UserProgressContextProvider>
        <CartContextProvider>
          <FavoritesContextProvider>
            <SearchContextProvider>
              <AppContent />
            </SearchContextProvider>
          </FavoritesContextProvider>
        </CartContextProvider>
      </UserProgressContextProvider>
    </AuthContextProvider>
  );
}

export default App;
