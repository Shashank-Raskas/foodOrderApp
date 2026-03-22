import { useContext, useState } from "react";
import Button from "./UI/Button";
import Input from "./UI/Input";
import AuthContext from "./store/AuthContext";
import './Auth.css';

export default function Login({ onSwitchToSignup }) {
    const authCtx = useContext(AuthContext);
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [formErrors, setFormErrors] = useState({});

    function handleInputChange(e) {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
        // Clear error for this field when user starts typing
        if (formErrors[id]) {
            setFormErrors(prev => ({ ...prev, [id]: '' }));
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const errors = {};

        // Validation
        if (!formData.email.trim()) {
            errors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.email = 'Please enter a valid email';
        }

        if (!formData.password.trim()) {
            errors.password = 'Password is required';
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        try {
            await authCtx.login(formData.email, formData.password);
        } catch (err) {
            setFormErrors({ submit: err.message });
        }
    }

    return (
        <div className="auth-page login-page">
            <div className="auth-container">
                {/* Left Side - Branding & Welcome Message */}
                <div className="auth-branding">
                    <div className="auth-brand-content">
                        <div className="auth-brand-icon">🔥</div>
                        <h1 className="auth-brand-name">The Flavor Alchemist</h1>
                        <p className="auth-brand-tagline">Alchemize Your Cravings</p>
                        <div className="auth-decorative-line"></div>
                        <p className="auth-welcome-text">
                            Welcome back! Sign in to discover culinary magic and place your order.
                        </p>
                    </div>
                    <div className="auth-food-icons">
                        <span className="food-emoji" style={{animationDelay: '0s'}}>🍕</span>
                        <span className="food-emoji" style={{animationDelay: '0.2s'}}>🍝</span>
                        <span className="food-emoji" style={{animationDelay: '0.4s'}}>🥘</span>
                        <span className="food-emoji" style={{animationDelay: '0.6s'}}>🍜</span>
                        <span className="food-emoji" style={{animationDelay: '0.8s'}}>🌮</span>
                    </div>
                </div>

                {/* Right Side - Form */}
                <form onSubmit={handleSubmit} className="auth-form login-form">
                    <div className="form-header">
                        <h2>Login</h2>
                        <p className="form-subtitle">Sign in to your account</p>
                    </div>

                    {formErrors.submit && <p className="error-message">{formErrors.submit}</p>}

                    <Input
                        label='Email Address'
                        type='email'
                        id='email'
                        value={formData.email}
                        onChange={handleInputChange}
                        error={formErrors.email}
                    />

                    <Input
                        label='Password'
                        type='password'
                        id='password'
                        value={formData.password}
                        onChange={handleInputChange}
                        error={formErrors.password}
                    />

                    <div className="auth-actions">
                        <Button disabled={authCtx.isLoading}>
                            {authCtx.isLoading ? 'Signing in...' : 'Login'}
                        </Button>
                    </div>

                    <div className="auth-divider">
                        <span>Don't have an account?</span>
                    </div>

                    <button
                        type="button"
                        className="auth-switch-btn-large"
                        onClick={onSwitchToSignup}
                    >
                        Create New Account
                    </button>
                </form>
            </div>
        </div>
    );
}
