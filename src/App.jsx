import { useContext, useState } from "react";
import Cart from "./components/Cart";
import Checkout from "./components/Checkout";
import Header from "./components/Header";
import Meals from "./components/Meals";
import Login from "./components/Login";
import Signup from "./components/Signup";
import UserProfile from "./components/UserProfile";
import Favorites from "./components/Favorites";
import OrderHistory from "./components/OrderHistory";
import { CartContextProvider } from "./components/store/CartContext";
import { UserProgressContextProvider } from "./components/store/UserProgressContext";
import { AuthContextProvider } from "./components/store/AuthContext";
import { FavoritesContextProvider } from "./components/store/FavoritesContext";
import AuthContext from "./components/store/AuthContext";

function AppContent() {
  const authCtx = useContext(AuthContext);
  const [showSignup, setShowSignup] = useState(false);

  if (!authCtx.isLoggedIn) {
    return showSignup ? (
      <Signup onSwitchToLogin={() => setShowSignup(false)} />
    ) : (
      <Login onSwitchToSignup={() => setShowSignup(true)} />
    );
  }

  return (
    <UserProgressContextProvider>
      <CartContextProvider>
        <FavoritesContextProvider>
          <Header />
          <Meals />
          <Cart />
          <Checkout />
          <UserProfile />
          <Favorites />
          <OrderHistory />
        </FavoritesContextProvider>
      </CartContextProvider>
    </UserProgressContextProvider>
  );
}

function App() {
  return (
    <AuthContextProvider>
      <AppContent />
    </AuthContextProvider>
  );
}

export default App;
