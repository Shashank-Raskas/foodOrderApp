import { useContext, useState } from "react";
import Modal from "./UI/Modal";
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
        <Modal open={true} onClose={() => {}}>
            <form onSubmit={handleSubmit} className="auth-form">
                <h2>Login</h2>
                <p className="auth-subtitle">Sign in to your account to order food</p>

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
                        {authCtx.isLoading ? 'Logging in...' : 'Login'}
                    </Button>
                </div>

                <p className="auth-switch-text">
                    Don't have an account?{' '}
                    <button
                        type="button"
                        className="auth-switch-btn"
                        onClick={onSwitchToSignup}
                    >
                        Sign up here
                    </button>
                </p>
            </form>
        </Modal>
    );
}
