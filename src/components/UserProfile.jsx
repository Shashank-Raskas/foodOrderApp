import { useContext, useState } from "react";
import Modal from "./UI/Modal";
import Button from "./UI/Button";
import Input from "./UI/Input";
import AuthContext from "./store/AuthContext";
import UserProgressContext from "./store/UserProgressContext";
import { API_ENDPOINTS } from "../config/api";
import './UserProfile.css';

export default function UserProfile() {
    const authCtx = useContext(AuthContext);
    const userProgressCtx = useContext(UserProgressContext);
    const [editMode, setEditMode] = useState(false);
    const [changePasswordMode, setChangePasswordMode] = useState(false);
    const [formData, setFormData] = useState({
        name: authCtx.user?.name || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [formErrors, setFormErrors] = useState({});
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    if (!authCtx.isLoggedIn) {
        return null;
    }

    function handleClose() {
        userProgressCtx.hideProfile?.();
        setEditMode(false);
        setChangePasswordMode(false);
        setFormErrors({});
        setSuccessMessage('');
    }

    function handleInputChange(e) {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
        if (formErrors[id]) {
            setFormErrors(prev => ({ ...prev, [id]: '' }));
        }
    }

    async function handleProfileUpdate(e) {
        e.preventDefault();
        const errors = {};

        if (!formData.name.trim()) {
            errors.name = 'Name is required';
        } else if (formData.name.trim().length < 2) {
            errors.name = 'Name must be at least 2 characters';
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(API_ENDPOINTS.USER_PROFILE, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: authCtx.user.userId,
                    name: formData.name.trim(),
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to update profile');
            }

            // Update auth context with new user data
            authCtx.updateUser({ name: formData.name.trim() });
            
            setSuccessMessage('Profile updated successfully!');
            setEditMode(false);
            
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
            setFormErrors({ submit: err.message });
        } finally {
            setIsLoading(false);
        }
    }

    async function handlePasswordChange(e) {
        e.preventDefault();
        const errors = {};

        if (!formData.currentPassword) {
            errors.currentPassword = 'Current password is required';
        }

        if (!formData.newPassword) {
            errors.newPassword = 'New password is required';
        } else if (formData.newPassword.length < 6) {
            errors.newPassword = 'Password must be at least 6 characters';
        } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.newPassword)) {
            errors.newPassword = 'Password must contain uppercase, lowercase, and number';
        }

        if (!formData.confirmPassword) {
            errors.confirmPassword = 'Please confirm your password';
        } else if (formData.newPassword !== formData.confirmPassword) {
            errors.confirmPassword = 'Passwords do not match';
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(API_ENDPOINTS.USER_CHANGE_PASSWORD, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: authCtx.user.userId,
                    oldPassword: formData.currentPassword,
                    newPassword: formData.newPassword,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to change password');
            }

            setSuccessMessage('Password changed successfully!');
            setChangePasswordMode(false);
            setFormData(prev => ({
                ...prev,
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            }));
            
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (err) {
            setFormErrors({ submit: err.message });
        } finally {
            setIsLoading(false);
        }
    }

    const userInitial = authCtx.user?.name?.[0]?.toUpperCase() || '👤';
    const joinDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });

    return (
        <Modal open={userProgressCtx.progress === 'profile'} onClose={handleClose}>
            <div className="user-profile-container">
                {/* Profile Header */}
                <div className="profile-header">
                    <div className="user-avatar">{userInitial}</div>
                    <div className="user-info">
                        <h2>{authCtx.user?.name}</h2>
                        <p className="user-email">{authCtx.user?.email}</p>
                        <p className="join-date">Member since {joinDate}</p>
                    </div>
                </div>

                {/* Success Message */}
                {successMessage && (
                    <p className="success-message">{successMessage}</p>
                )}

                {/* Profile Display View */}
                {!editMode && !changePasswordMode && (
                    <div className="profile-display">
                        <div className="profile-section">
                            <h3>Account Information</h3>
                            <div className="info-item">
                                <span className="info-label">Name:</span>
                                <span className="info-value">{authCtx.user?.name}</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label">Email:</span>
                                <span className="info-value">{authCtx.user?.email}</span>
                            </div>
                        </div>

                        <div className="profile-actions">
                            <Button onClick={() => setEditMode(true)}>Edit Profile</Button>
                            <Button onClick={() => setChangePasswordMode(true)} textOnly>
                                Change Password
                            </Button>
                        </div>
                    </div>
                )}

                {/* Edit Profile Form */}
                {editMode && (
                    <form onSubmit={handleProfileUpdate} className="profile-form">
                        <h3>Edit Profile</h3>
                        {formErrors.submit && <p className="error-message">{formErrors.submit}</p>}
                        
                        <Input
                            label='Full Name'
                            type='text'
                            id='name'
                            value={formData.name}
                            onChange={handleInputChange}
                            error={formErrors.name}
                        />

                        <div className="form-buttons">
                            <Button type='submit' disabled={isLoading}>
                                {isLoading ? 'Saving...' : 'Save Changes'}
                            </Button>
                            <Button 
                                type='button' 
                                textOnly 
                                onClick={() => {
                                    setEditMode(false);
                                    setFormData(prev => ({
                                        ...prev,
                                        name: authCtx.user?.name || '',
                                    }));
                                    setFormErrors({});
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                )}

                {/* Change Password Form */}
                {changePasswordMode && (
                    <form onSubmit={handlePasswordChange} className="profile-form">
                        <h3>Change Password</h3>
                        {formErrors.submit && <p className="error-message">{formErrors.submit}</p>}
                        
                        <Input
                            label='Current Password'
                            type='password'
                            id='currentPassword'
                            value={formData.currentPassword}
                            onChange={handleInputChange}
                            error={formErrors.currentPassword}
                        />

                        <Input
                            label='New Password'
                            type='password'
                            id='newPassword'
                            value={formData.newPassword}
                            onChange={handleInputChange}
                            error={formErrors.newPassword}
                        />

                        <Input
                            label='Confirm New Password'
                            type='password'
                            id='confirmPassword'
                            value={formData.confirmPassword}
                            onChange={handleInputChange}
                            error={formErrors.confirmPassword}
                        />

                        <p className="password-hint">
                            Password must contain at least 6 characters, including uppercase, lowercase, and a number
                        </p>

                        <div className="form-buttons">
                            <Button type='submit' disabled={isLoading}>
                                {isLoading ? 'Changing...' : 'Change Password'}
                            </Button>
                            <Button 
                                type='button' 
                                textOnly 
                                onClick={() => {
                                    setChangePasswordMode(false);
                                    setFormData(prev => ({
                                        ...prev,
                                        currentPassword: '',
                                        newPassword: '',
                                        confirmPassword: '',
                                    }));
                                    setFormErrors({});
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                )}

                {/* Close Button */}
                <div className="profile-footer">
                    <button className="close-btn" onClick={handleClose}>
                        ✕ Close
                    </button>
                </div>
            </div>
        </Modal>
    );
}
