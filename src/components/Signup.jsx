import { useContext, useState } from "react";
import Modal from "./UI/Modal";
import Button from "./UI/Button";
import Input from "./UI/Input";
import AuthContext from "./store/AuthContext";
import './Auth.css';

export default function Signup({ onSwitchToLogin }) {
    const authCtx = useContext(AuthContext);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
    });
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
        if (!formData.name.trim()) {
            errors.name = 'Name is required';
        } else if (formData.name.trim().length < 2) {
            errors.name = 'Name must be at least 2 characters';
        }

        if (!formData.email.trim()) {
            errors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.email = 'Please enter a valid email';
        }

        if (!formData.password) {
            errors.password = 'Password is required';
        } else if (formData.password.length < 6) {
            errors.password = 'Password must be at least 6 characters';
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
            errors.password = 'Password must contain uppercase, lowercase, and number';
        }

        if (!formData.confirmPassword) {
            errors.confirmPassword = 'Please confirm your password';
        } else if (formData.password !== formData.confirmPassword) {
            errors.confirmPassword = 'Passwords do not match';
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        try {
            await authCtx.signup(formData.email, formData.password, formData.name);
        } catch (err) {
            setFormErrors({ submit: err.message });
        }
    }

    return (
        <Modal open={true} onClose={() => {}}>
            <div className="auth-container signup-container">
                {/* Left Side - Branding & Welcome Message */}
                <div className="auth-branding signup-branding">
                    <div className="auth-brand-content">
                        <div className="auth-brand-icon">✨</div>
                        <h1 className="auth-brand-name">The Flavor Alchemist</h1>
                        <p className="auth-brand-tagline">Join the Culinary Magic</p>
                        <div className="auth-decorative-line"></div>
                        <p className="auth-welcome-text">
                            Create your account and experience extraordinary flavors crafted with passion.
                        </p>
                    </div>
                    <div className="auth-food-icons">
                        <span className="food-emoji" style={{animationDelay: '0s'}}>🍱</span>
                        <span className="food-emoji" style={{animationDelay: '0.2s'}}>🥗</span>
                        <span className="food-emoji" style={{animationDelay: '0.4s'}}>🍛</span>
                        <span className="food-emoji" style={{animationDelay: '0.6s'}}>🍲</span>
                        <span className="food-emoji" style={{animationDelay: '0.8s'}}>🥙</span>
                    </div>
                </div>

                {/* Right Side - Form */}
                <form onSubmit={handleSubmit} className="auth-form signup-form">
                    <div className="form-header">
                        <h2>Create Account</h2>
                        <p className="form-subtitle">Join us and start your culinary journey</p>
                    </div>

                    {formErrors.submit && <p className="error-message">{formErrors.submit}</p>}

                    <Input
                        label='Full Name'
                        type='text'
                        id='name'
                        value={formData.name}
                        onChange={handleInputChange}
                        error={formErrors.name}
                    />

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

                    <Input
                        label='Confirm Password'
                        type='password'
                        id='confirmPassword'
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        error={formErrors.confirmPassword}
                    />

                    <p className="password-hint">
                        Password must contain at least 6 characters, including uppercase, lowercase, and a number
                    </p>

                    <div className="auth-actions">
                        <Button disabled={authCtx.isLoading}>
                            {authCtx.isLoading ? 'Creating account...' : 'Create Account'}
                        </Button>
                    </div>

                    <div className="auth-divider">
                        <span>Already have an account?</span>
                    </div>

                    <button
                        type="button"
                        className="auth-switch-btn-large"
                        onClick={onSwitchToLogin}
                    >
                        Sign In
                    </button>
                </form>
            </div>
        </Modal>
    );
}
