import { useContext, useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Cart from "./components/Cart";
import Checkout from "./components/Checkout";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Meals from "./components/Meals";
import LandingPage from "./components/LandingPage";
import AuthModal from "./components/AuthModal";
import UserProfile from "./components/UserProfile";
import Favorites from "./components/Favorites";
import OrderHistory from "./components/OrderHistory";
import MealDetail from "./components/MealDetail";
import AboutUs from "./components/AboutUs";
import ContactUs from "./components/ContactUs";
import PrivacyPolicy from "./components/PrivacyPolicy";
import TermsConditions from "./components/TermsConditions";
import RefundPolicy from "./components/RefundPolicy";
import FAQs from "./components/FAQs";
import ScrollToTop from "./components/UI/ScrollToTop";
import ProtectedRoute from "./components/UI/ProtectedRoute";
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

  return (
    <>
      <ScrollToTop />
      <Header />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/menu" element={<Meals />} />
        <Route path="/meal/:mealId" element={<MealDetail />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsConditions />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/faqs" element={<FAQs />} />
        <Route path="/favorites" element={
          <ProtectedRoute><Favorites /></ProtectedRoute>
        } />
        <Route path="/orders" element={
          <ProtectedRoute><OrderHistory /></ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><UserProfile /></ProtectedRoute>
        } />
      </Routes>
      {/* Global modals — always available regardless of route */}
      <AuthModal />
      {authCtx.isLoggedIn && (
        <>
          <Cart />
          <Checkout />
        </>
      )}
      <ScrollToTopButton />
      <Footer />
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
