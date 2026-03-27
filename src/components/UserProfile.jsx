import { useContext, useState, useEffect } from "react";
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
    const [addressMode, setAddressMode] = useState(false);
    const [addAddressMode, setAddAddressMode] = useState(false);
    const [addresses, setAddresses] = useState([]);
    const [addressLoading, setAddressLoading] = useState(false);
    const [newAddr, setNewAddr] = useState({ label: 'Home', street: '', postalCode: '', city: '', phone: '', countryCode: '+91' });
    const [formData, setFormData] = useState({
        name: authCtx.user?.name || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [formErrors, setFormErrors] = useState({});
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Fetch addresses when profile opens
    useEffect(() => {
        if (userProgressCtx.progress === 'profile' && authCtx.user) {
            fetchAddresses();
        }
    }, [userProgressCtx.progress]);

    async function fetchAddresses() {
        if (!authCtx.user) return;
        setAddressLoading(true);
        try {
            const res = await fetch(`${API_ENDPOINTS.USER_ADDRESSES}?userId=${authCtx.user.userId}`);
            const data = await res.json();
            setAddresses(data.addresses || []);
        } catch (err) {
            console.error('Failed to fetch addresses:', err);
        } finally {
            setAddressLoading(false);
        }
    }

    if (!authCtx.isLoggedIn) {
        return null;
    }

    function handleClose() {
        userProgressCtx.hideProfile?.();
        setEditMode(false);
        setChangePasswordMode(false);
        setAddressMode(false);
        setAddAddressMode(false);
        setFormErrors({});
        setSuccessMessage('');
    }

    // ---- Address management handlers ----
    async function handleAddAddress(e) {
        e.preventDefault();
        const errors = {};
        if (!newAddr.street.trim()) errors.street = 'Street is required';
        if (!newAddr.postalCode.trim()) errors.postalCode = 'Postal code is required';
        if (!newAddr.city.trim()) errors.city = 'City is required';
        if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }

        setIsLoading(true);
        try {
            const res = await fetch(API_ENDPOINTS.USER_ADDRESSES, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: authCtx.user.userId,
                    address: {
                        ...newAddr,
                        name: authCtx.user.name,
                        phone: newAddr.phone ? `${newAddr.countryCode}${newAddr.phone}` : (authCtx.user.phone || ''),
                        isDefault: addresses.length === 0,
                    },
                }),
            });
            const data = await res.json();
            if (data.address) {
                setAddresses(prev => [data.address, ...prev]);
                setNewAddr({ label: 'Home', street: '', postalCode: '', city: '', phone: '', countryCode: '+91' });
                setAddAddressMode(false);
                setSuccessMessage('Address added!');
                setTimeout(() => setSuccessMessage(''), 3000);
            }
        } catch (err) {
            setFormErrors({ submit: 'Failed to save address' });
        } finally {
            setIsLoading(false);
        }
    }

    async function handleDeleteAddress(id) {
        try {
            await fetch(`${API_ENDPOINTS.USER_ADDRESSES}/${id}`, { method: 'DELETE' });
            setAddresses(prev => prev.filter(a => a.id !== id));
        } catch (err) {
            console.error('Failed to delete address:', err);
        }
    }

    async function handleSetDefault(id) {
        try {
            const addr = addresses.find(a => a.id === id);
            if (!addr) return;
            await fetch(API_ENDPOINTS.USER_ADDRESSES, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: authCtx.user.userId,
                    address: { ...addr, id: addr.id, isDefault: true },
                }),
            });
            setAddresses(prev => prev.map(a => ({ ...a, isDefault: a.id === id })));
        } catch (err) {
            console.error('Failed to set default:', err);
        }
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
    const joinDate = authCtx.user?.createdAt ? new Date(authCtx.user.createdAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    }) : 'Unknown';

    return (
        <Modal open={userProgressCtx.progress === 'profile'} onClose={handleClose} className="profile-modal">
            <div className="user-profile-container">
                {/* Close Button - Top Right */}
                <button className="profile-close-btn" onClick={handleClose} title="Close">
                    ✕
                </button>

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
                {!editMode && !changePasswordMode && !addressMode && (
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
                            {authCtx.user?.phone && (
                                <div className="info-item">
                                    <span className="info-label">Phone:</span>
                                    <span className="info-value">{authCtx.user.phone}</span>
                                </div>
                            )}
                        </div>

                        {/* Quick address preview */}
                        <div className="profile-section">
                            <h3>Saved Addresses <span className="address-count-badge">{addresses.length}</span></h3>
                            {addresses.length === 0 && (
                                <p className="no-addresses-hint">No saved addresses yet. Add one for faster checkout!</p>
                            )}
                            {addresses.slice(0, 2).map(addr => (
                                <div key={addr.id} className="address-preview">
                                    <span className="address-preview-label">{addr.label || 'Address'}</span>
                                    <span className="address-preview-text">{addr.street}, {addr.city}</span>
                                    {addr.isDefault && <span className="address-preview-default">Default</span>}
                                </div>
                            ))}
                            {addresses.length > 2 && (
                                <p className="more-addresses-hint">+{addresses.length - 2} more</p>
                            )}
                        </div>

                        <div className="profile-actions">
                            <Button onClick={() => setEditMode(true)}>Edit Profile</Button>
                            <Button onClick={() => { setAddressMode(true); setFormErrors({}); }}>
                                Manage Addresses
                            </Button>
                            <Button onClick={() => setChangePasswordMode(true)} textOnly>
                                Change Password
                            </Button>
                        </div>
                    </div>
                )}

                {/* Address Management View */}
                {addressMode && !editMode && !changePasswordMode && (
                    <div className="profile-display">
                        <div className="profile-section">
                            <div className="addr-section-header">
                                <h3>📍 Saved Addresses</h3>
                                <button 
                                    className="addr-back-btn"
                                    onClick={() => { setAddressMode(false); setAddAddressMode(false); setFormErrors({}); }}
                                >
                                    ← Back
                                </button>
                            </div>

                            {addressLoading && <p className="addr-loading">Loading addresses...</p>}

                            {!addressLoading && addresses.length === 0 && !addAddressMode && (
                                <div className="addr-empty">
                                    <p>📭 No saved addresses</p>
                                    <p className="addr-empty-hint">Add an address so you don't have to enter it every time!</p>
                                </div>
                            )}

                            {!addAddressMode && addresses.map(addr => (
                                <div key={addr.id} className={`addr-card${addr.isDefault ? ' addr-default' : ''}`}>
                                    <div className="addr-card-top">
                                        <span className="addr-label">{addr.label || 'Address'}</span>
                                        {addr.isDefault && <span className="addr-default-tag">✓ Default</span>}
                                    </div>
                                    <p className="addr-street">{addr.street}</p>
                                    <p className="addr-city">{addr.city}, {addr.postalCode}</p>
                                    {addr.phone && <p className="addr-phone">📞 {addr.phone}</p>}
                                    <div className="addr-card-actions">
                                        {!addr.isDefault && (
                                            <button className="addr-set-default" onClick={() => handleSetDefault(addr.id)}>
                                                Set as Default
                                            </button>
                                        )}
                                        <button className="addr-delete" onClick={() => handleDeleteAddress(addr.id)}>
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {!addAddressMode && (
                                <button className="addr-add-btn" onClick={() => { setAddAddressMode(true); setFormErrors({}); }}>
                                    + Add New Address
                                </button>
                            )}

                            {addAddressMode && (
                                <form onSubmit={handleAddAddress} className="addr-form">
                                    <h4>Add New Address</h4>
                                    {formErrors.submit && <p className="error-message">{formErrors.submit}</p>}
                                    <div className="addr-label-options">
                                        {['Home', 'Work', 'Other'].map(lbl => (
                                            <button
                                                key={lbl}
                                                type="button"
                                                className={`addr-label-btn${newAddr.label === lbl ? ' active' : ''}`}
                                                onClick={() => setNewAddr(prev => ({ ...prev, label: lbl }))}
                                            >
                                                {lbl === 'Home' ? '🏠' : lbl === 'Work' ? '🏢' : '📍'} {lbl}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="addr-field">
                                        <label>Street Address</label>
                                        <input
                                            value={newAddr.street}
                                            onChange={e => { setNewAddr(prev => ({ ...prev, street: e.target.value })); setFormErrors(prev => ({ ...prev, street: '' })); }}
                                            placeholder="123 Main St, Apt 4"
                                            className={formErrors.street ? 'input-error' : ''}
                                        />
                                        {formErrors.street && <span className="addr-error">{formErrors.street}</span>}
                                    </div>
                                    <div className="addr-field">
                                        <label>Phone Number</label>
                                        <div className="addr-phone-row">
                                            <select
                                                value={newAddr.countryCode}
                                                onChange={e => setNewAddr(prev => ({ ...prev, countryCode: e.target.value }))}
                                                className="addr-country-select"
                                            >
                                                <option value="+91">🇮🇳 +91</option>
                                                <option value="+1">🇺🇸 +1</option>
                                                <option value="+44">🇬🇧 +44</option>
                                                <option value="+61">🇦🇺 +61</option>
                                                <option value="+81">🇯🇵 +81</option>
                                                <option value="+49">🇩🇪 +49</option>
                                                <option value="+86">🇨🇳 +86</option>
                                                <option value="+971">🇦🇪 +971</option>
                                                <option value="+65">🇸🇬 +65</option>
                                                <option value="+33">🇫🇷 +33</option>
                                            </select>
                                            <input
                                                type="tel"
                                                value={newAddr.phone}
                                                onChange={e => { setNewAddr(prev => ({ ...prev, phone: e.target.value.replace(/[^0-9]/g, '') })); }}
                                                placeholder="9876543210"
                                                className={formErrors.phone ? 'input-error' : ''}
                                            />
                                        </div>
                                        {formErrors.phone && <span className="addr-error">{formErrors.phone}</span>}
                                    </div>
                                    <div className="addr-field-row">
                                        <div className="addr-field">
                                            <label>Postal Code</label>
                                            <input
                                                value={newAddr.postalCode}
                                                onChange={e => { setNewAddr(prev => ({ ...prev, postalCode: e.target.value })); setFormErrors(prev => ({ ...prev, postalCode: '' })); }}
                                                placeholder="110001"
                                                className={formErrors.postalCode ? 'input-error' : ''}
                                            />
                                            {formErrors.postalCode && <span className="addr-error">{formErrors.postalCode}</span>}
                                        </div>
                                        <div className="addr-field">
                                            <label>City</label>
                                            <input
                                                value={newAddr.city}
                                                onChange={e => { setNewAddr(prev => ({ ...prev, city: e.target.value })); setFormErrors(prev => ({ ...prev, city: '' })); }}
                                                placeholder="New Delhi"
                                                className={formErrors.city ? 'input-error' : ''}
                                            />
                                            {formErrors.city && <span className="addr-error">{formErrors.city}</span>}
                                        </div>
                                    </div>
                                    <div className="addr-form-actions">
                                        <Button type="submit" disabled={isLoading}>
                                            {isLoading ? 'Saving...' : 'Save Address'}
                                        </Button>
                                        <Button type="button" textOnly onClick={() => { setAddAddressMode(false); setFormErrors({}); }}>
                                            Cancel
                                        </Button>
                                    </div>
                                </form>
                            )}
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

            </div>
        </Modal>
    );
}
