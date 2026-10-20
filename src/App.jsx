import { useContext, useState, useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
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
import Error from "./components/Error";
import ScrollToTop from "./components/UI/ScrollToTop";
import ProtectedRoute from "./components/UI/ProtectedRoute";
import { CartContextProvider } from "./components/store/CartContext";
import { UserProgressContextProvider } from "./components/store/UserProgressContext";
import { AuthContextProvider } from "./components/store/AuthContext";
import { FavoritesContextProvider } from "./components/store/FavoritesContext";
import { SearchContextProvider } from "./components/store/SearchContext";
import AuthContext from "./components/store/AuthContext";

/**
 * Load a page only when its route is visited, so the main bundle stays small.
 * After a new deploy the old hashed chunk files are gone; if a tab that's been open since before the
 * deploy can't fetch a chunk, reload once to pick up the new build instead of showing a blank page.
 */
function lazyPage(importPage) {
  return lazy(() =>
    importPage()
      .then((module) => {
        try { sessionStorage.removeItem('chunk-reload'); } catch { /* storage unavailable */ }
        return module;
      })
      .catch((err) => {
        let alreadyReloaded = true;
        try {
          alreadyReloaded = sessionStorage.getItem('chunk-reload') === '1';
          sessionStorage.setItem('chunk-reload', '1');
        } catch { /* storage unavailable */ }
        if (!alreadyReloaded) {
          window.location.reload();
          return new Promise(() => {}); // keep showing the fallback while the page reloads
        }
        throw err;
      })
  );
}

// Pages most visitors never open — split out of the main bundle
const AboutUs = lazyPage(() => import("./components/AboutUs"));
const ContactUs = lazyPage(() => import("./components/ContactUs"));
const PrivacyPolicy = lazyPage(() => import("./components/PrivacyPolicy"));
const TermsConditions = lazyPage(() => import("./components/TermsConditions"));
const RefundPolicy = lazyPage(() => import("./components/RefundPolicy"));
const FAQs = lazyPage(() => import("./components/FAQs"));
const AdminDashboard = lazyPage(() => import("./components/AdminDashboard"));

// Holds the page height while a lazy page loads, so the footer doesn't jump up
const pageFallback = <div style={{ minHeight: '60vh' }} aria-busy="true" />;

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
      <Suspense fallback={pageFallback}>
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
        <Route path="/admin" element={
          <ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>
        } />
        {/* Handle Render redirect to /index.html */}
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        {/* Catch-all 404 route */}
        <Route path="*" element={<Error title="404 Not Found" message="Sorry, the page you requested does not exist." />} />
      </Routes>
      </Suspense>
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
