import { useContext } from "react";
import Cart from "./components/Cart";
import Checkout from "./components/Checkout";
import Header from "./components/Header";
import Meals from "./components/Meals";
import AuthModal from "./components/AuthModal";
import UserProfile from "./components/UserProfile";
import Favorites from "./components/Favorites";
import OrderHistory from "./components/OrderHistory";
import { CartContextProvider } from "./components/store/CartContext";
import { UserProgressContextProvider } from "./components/store/UserProgressContext";
import { AuthContextProvider } from "./components/store/AuthContext";
import { FavoritesContextProvider } from "./components/store/FavoritesContext";
import { SearchContextProvider } from "./components/store/SearchContext";
import AuthContext from "./components/store/AuthContext";

function AppContent() {
  const authCtx = useContext(AuthContext);

  return (
    <>
      <Header />
      <Meals />
      <AuthModal />
      {authCtx.isLoggedIn && (
        <>
          <Cart />
          <Checkout />
          <UserProfile />
          <Favorites />
          <OrderHistory />
        </>
      )}
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
