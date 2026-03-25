import { useContext, useState } from "react";
import { createPortal } from "react-dom";
import AuthContext from "./store/AuthContext";
import UserProgressContext from "./store/UserProgressContext";
import Input from "./UI/Input";

export default function AuthModal() {
    const authCtx = useContext(AuthContext);
    const userProgressCtx = useContext(UserProgressContext);
    const isOpen = userProgressCtx.authView !== null && !authCtx.isLoggedIn;
    const [view, setView] = useState("login"); // "login" | "signup"
    const [formErrors, setFormErrors] = useState({});

    // Sync modal view with what triggered it
    const currentView = userProgressCtx.authView || view;

    const [loginData, setLoginData] = useState({ email: "", password: "" });
    const [signupData, setSignupData] = useState({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
    });

    function handleClose() {
        userProgressCtx.hideAuth();
        setFormErrors({});
    }

    function switchView(v) {
        userProgressCtx.showAuth(v);
        setFormErrors({});
    }

    async function handleLoginSubmit(e) {
        e.preventDefault();
        const errors = {};
        if (!loginData.email.trim()) errors.email = "Email is required";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginData.email))
            errors.email = "Please enter a valid email";
        if (!loginData.password.trim()) errors.password = "Password is required";
        if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
        try {
            await authCtx.login(loginData.email, loginData.password);
            handleClose();
            setLoginData({ email: "", password: "" });
        } catch (err) {
            setFormErrors({ submit: err.message });
        }
    }

    async function handleSignupSubmit(e) {
        e.preventDefault();
        const errors = {};
        if (!signupData.name.trim()) errors.name = "Name is required";
        else if (signupData.name.trim().length < 2) errors.name = "Name must be at least 2 characters";
        if (!signupData.email.trim()) errors.email = "Email is required";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupData.email))
            errors.email = "Please enter a valid email";
        if (!signupData.password) errors.password = "Password is required";
        else if (signupData.password.length < 6) errors.password = "Password must be at least 6 characters";
        else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(signupData.password))
            errors.password = "Password must contain uppercase, lowercase, and number";
        if (!signupData.confirmPassword) errors.confirmPassword = "Please confirm your password";
        else if (signupData.password !== signupData.confirmPassword)
            errors.confirmPassword = "Passwords do not match";
        if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
        try {
            await authCtx.signup(signupData.email, signupData.password, signupData.name);
            handleClose();
            setSignupData({ name: "", email: "", password: "", confirmPassword: "" });
        } catch (err) {
            setFormErrors({ submit: err.message });
        }
    }

    if (!isOpen) return null;

    return createPortal(
        <div className="auth-modal-backdrop" onClick={handleClose}>
            <div
                className="auth-modal"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                {/* Close button */}
                <button className="auth-modal-close" onClick={handleClose} title="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>

                {/* Brand header */}
                <div className="auth-modal-brand">
                    <span className="auth-modal-logo">🔥</span>
                    <div>
                        <h2 className="auth-modal-title">The Flavor Alchemist</h2>
                        <p className="auth-modal-subtitle">
                            {currentView === "login"
                                ? "Sign in to place your order"
                                : "Create an account to get started"}
                        </p>
                    </div>
                </div>

                {/* Tab switcher */}
                <div className="auth-modal-tabs">
                    <button
                        className={`auth-tab${currentView === "login" ? " active" : ""}`}
                        onClick={() => switchView("login")}
                        type="button"
                    >
                        Login
                    </button>
                    <button
                        className={`auth-tab${currentView === "signup" ? " active" : ""}`}
                        onClick={() => switchView("signup")}
                        type="button"
                    >
                        Sign Up
                    </button>
                </div>

                {/* Login form */}
                {currentView === "login" && (
                    <form onSubmit={handleLoginSubmit} className="auth-modal-form" noValidate>
                        {formErrors.submit && (
                            <p className="auth-modal-error-msg">{formErrors.submit}</p>
                        )}
                        <Input
                            label="Email Address"
                            type="email"
                            id="modal-email"
                            value={loginData.email}
                            onChange={(e) => {
                                setLoginData((p) => ({ ...p, email: e.target.value }));
                                if (formErrors.email) setFormErrors((p) => ({ ...p, email: "" }));
                            }}
                            error={formErrors.email}
                        />
                        <Input
                            label="Password"
                            type="password"
                            id="modal-password"
                            value={loginData.password}
                            onChange={(e) => {
                                setLoginData((p) => ({ ...p, password: e.target.value }));
                                if (formErrors.password) setFormErrors((p) => ({ ...p, password: "" }));
                            }}
                            error={formErrors.password}
                        />
                        <button type="submit" className="auth-modal-submit" disabled={authCtx.isLoading}>
                            {authCtx.isLoading ? "Signing in…" : "Login"}
                        </button>
                        <p className="auth-modal-switch">
                            Don't have an account?{" "}
                            <button type="button" onClick={() => switchView("signup")}>
                                Sign Up
                            </button>
                        </p>
                    </form>
                )}

                {/* Signup form */}
                {currentView === "signup" && (
                    <form onSubmit={handleSignupSubmit} className="auth-modal-form" noValidate>
                        {formErrors.submit && (
                            <p className="auth-modal-error-msg">{formErrors.submit}</p>
                        )}
                        <Input
                            label="Full Name"
                            type="text"
                            id="modal-name"
                            value={signupData.name}
                            onChange={(e) => {
                                setSignupData((p) => ({ ...p, name: e.target.value }));
                                if (formErrors.name) setFormErrors((p) => ({ ...p, name: "" }));
                            }}
                            error={formErrors.name}
                        />
                        <Input
                            label="Email Address"
                            type="email"
                            id="modal-signup-email"
                            value={signupData.email}
                            onChange={(e) => {
                                setSignupData((p) => ({ ...p, email: e.target.value }));
                                if (formErrors.email) setFormErrors((p) => ({ ...p, email: "" }));
                            }}
                            error={formErrors.email}
                        />
                        <Input
                            label="Password"
                            type="password"
                            id="modal-signup-password"
                            value={signupData.password}
                            onChange={(e) => {
                                setSignupData((p) => ({ ...p, password: e.target.value }));
                                if (formErrors.password) setFormErrors((p) => ({ ...p, password: "" }));
                            }}
                            error={formErrors.password}
                        />
                        <Input
                            label="Confirm Password"
                            type="password"
                            id="modal-confirm-password"
                            value={signupData.confirmPassword}
                            onChange={(e) => {
                                setSignupData((p) => ({ ...p, confirmPassword: e.target.value }));
                                if (formErrors.confirmPassword) setFormErrors((p) => ({ ...p, confirmPassword: "" }));
                            }}
                            error={formErrors.confirmPassword}
                        />
                        <p className="auth-modal-hint">
                            Password: min 6 chars, uppercase, lowercase &amp; number
                        </p>
                        <button type="submit" className="auth-modal-submit" disabled={authCtx.isLoading}>
                            {authCtx.isLoading ? "Creating account…" : "Create Account"}
                        </button>
                        <p className="auth-modal-switch">
                            Already have an account?{" "}
                            <button type="button" onClick={() => switchView("login")}>
                                Login
                            </button>
                        </p>
                    </form>
                )}
            </div>
        </div>,
        document.getElementById("modal")
    );
}
