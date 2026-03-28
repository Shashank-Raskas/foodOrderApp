import { useContext, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import AuthContext from "./store/AuthContext";
import UserProgressContext from "./store/UserProgressContext";
import Input from "./UI/Input";
import { API_ENDPOINTS } from "../config/api";

export default function AuthModal() {
    const authCtx = useContext(AuthContext);
    const userProgressCtx = useContext(UserProgressContext);
    const isOpen = userProgressCtx.authView !== null && !authCtx.isLoggedIn;

    // Login mode: "otp" (default, Zomato-style) | "password"
    const [loginMode, setLoginMode] = useState("otp");
    const [view, setView] = useState("login");
    const currentView = userProgressCtx.authView || view;

    // OTP flow steps: "input" | "otp-sent" | "needs-name" | "otp-sent-with-name"
    const [otpStep, setOtpStep] = useState("input");
    // OTP contact type: "email" | "phone"
    const [otpType, setOtpType] = useState("email");
    const [otpDestination, setOtpDestination] = useState("");
    const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""]);
    const [otpName, setOtpName] = useState("");

    // Available OTP methods from server config
    const [otpConfig, setOtpConfig] = useState({ emailOtp: false, phoneOtp: false });
    const configFetched = useRef(false);

    // Password auth state
    const [loginData, setLoginData] = useState({ email: "", password: "" });
    const [signupData, setSignupData] = useState({
        name: "", email: "", password: "", confirmPassword: "",
    });
    const [formErrors, setFormErrors] = useState({});

    // Timer for resend
    const [resendTimer, setResendTimer] = useState(0);
    const timerRef = useRef(null);

    // OTP input refs
    const otpRefs = useRef([]);

    // Fetch OTP config on mount
    useEffect(() => {
        if (configFetched.current) return;
        configFetched.current = true;
        fetch(API_ENDPOINTS.AUTH_CONFIG)
            .then((r) => r.json())
            .then((data) => setOtpConfig(data))
            .catch(() => {});
    }, []);

    // Resend timer countdown
    useEffect(() => {
        if (resendTimer <= 0) { clearInterval(timerRef.current); return; }
        timerRef.current = setInterval(() => {
            setResendTimer((prev) => {
                if (prev <= 1) { clearInterval(timerRef.current); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [resendTimer]);

    // ─── Handlers ──────────────────────────────────

    function handleClose() {
        userProgressCtx.hideAuth();
        resetOtp();
        setFormErrors({});
        setLoginMode("otp");
    }

    function resetOtp() {
        setOtpStep("input");
        setOtpCode(["", "", "", "", "", ""]);
        setOtpName("");
        setResendTimer(0);
    }

    function switchView(v) {
        userProgressCtx.showAuth(v);
        setFormErrors({});
        resetOtp();
        setLoginMode("otp");
    }

    // ─── OTP Input Handling ──────────────────────────

    function handleOtpChange(index, value) {
        if (!/^\d?$/.test(value)) return;
        const updated = [...otpCode];
        updated[index] = value;
        setOtpCode(updated);
        if (formErrors.otp) setFormErrors((p) => ({ ...p, otp: "" }));
        if (value && index < 5) otpRefs.current[index + 1]?.focus();
    }

    function handleOtpKeyDown(index, e) {
        if (e.key === "Backspace" && !otpCode[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    }

    function handleOtpPaste(e) {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (!pasted) return;
        const updated = [...otpCode];
        for (let i = 0; i < 6; i++) updated[i] = pasted[i] || "";
        setOtpCode(updated);
        otpRefs.current[Math.min(pasted.length, 5)]?.focus();
    }

    // ─── Password Login / Signup ────────────────────

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

    // ─── OTP Send / Verify / Resend ─────────────────

    async function handleSendOtp(e) {
        e.preventDefault();
        const errors = {};
        if (otpType === "email") {
            if (!otpDestination.trim()) errors.destination = "Email is required";
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpDestination))
                errors.destination = "Please enter a valid email";
        } else {
            if (!otpDestination.trim()) errors.destination = "Phone number is required";
            else if (!/^\+\d{10,15}$/.test(otpDestination.replace(/[\s\-()]/g, "")))
                errors.destination = "Enter with country code (e.g., +91XXXXXXXXXX)";
        }
        if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
        try {
            await authCtx.sendOtp(otpType, otpDestination.trim());
            setOtpStep("otp-sent");
            setFormErrors({});
            setResendTimer(30);
            setTimeout(() => otpRefs.current[0]?.focus(), 100);
        } catch (err) {
            setFormErrors({ submit: err.message });
        }
    }

    async function handleVerifyOtp(e) {
        e.preventDefault();
        const code = otpCode.join("");
        if (code.length !== 6) { setFormErrors({ otp: "Please enter the complete 6-digit code" }); return; }
        try {
            await authCtx.verifyOtp(otpType, otpDestination.trim(), code, otpName || undefined);
            handleClose();
            setOtpDestination("");
            setOtpCode(["", "", "", "", "", ""]);
            setOtpName("");
        } catch (err) {
            if (err.needsName) {
                setOtpStep("needs-name");
                setFormErrors({});
            } else {
                setFormErrors({ otp: err.message });
            }
        }
    }

    async function handleNameThenVerify(e) {
        e.preventDefault();
        if (!otpName.trim()) { setFormErrors({ name: "Name is required to create your account" }); return; }
        if (otpName.trim().length < 2) { setFormErrors({ name: "Name must be at least 2 characters" }); return; }
        // Reuse the already-verified OTP code + name to complete registration (no second OTP needed)
        const code = otpCode.join("");
        try {
            await authCtx.verifyOtp(otpType, otpDestination.trim(), code, otpName.trim());
            handleClose();
            setOtpDestination("");
            setOtpCode(["", "", "", "", "", ""]);
            setOtpName("");
        } catch (err) {
            setFormErrors({ submit: err.message });
        }
    }

    async function handleResendOtp() {
        if (resendTimer > 0) return;
        try {
            await authCtx.sendOtp(otpType, otpDestination.trim());
            setResendTimer(30);
            setOtpCode(["", "", "", "", "", ""]);
            setFormErrors({});
            setTimeout(() => otpRefs.current[0]?.focus(), 100);
        } catch (err) {
            setFormErrors({ submit: err.message });
        }
    }

    // ─── Render ──────────────────────────────────────

    if (!isOpen) return null;

    function renderOtpBoxes(onSubmit) {
        return (
            <form onSubmit={onSubmit} className="auth-modal-form" noValidate>
                {formErrors.submit && <p className="auth-modal-error-msg">{formErrors.submit}</p>}
                <p className="otp-sent-info">
                    Code sent to <strong>{otpDestination}</strong>
                    <button type="button" className="otp-change-btn" onClick={() => { setOtpStep("input"); setFormErrors({}); setOtpCode(["","","","","",""]); }}>Change</button>
                </p>
                <div className="otp-input-group" onPaste={handleOtpPaste}>
                    {otpCode.map((digit, i) => (
                        <input
                            key={i}
                            ref={(el) => (otpRefs.current[i] = el)}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            className={`otp-box${formErrors.otp ? " otp-box-error" : ""}`}
                            value={digit}
                            onChange={(e) => handleOtpChange(i, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(i, e)}
                            autoComplete="one-time-code"
                        />
                    ))}
                </div>
                {formErrors.otp && <p className="auth-modal-error-text">{formErrors.otp}</p>}
                <button type="submit" className="auth-modal-submit" disabled={authCtx.isLoading}>
                    {authCtx.isLoading ? "Verifying…" : "Verify OTP"}
                </button>
                <p className="otp-resend">
                    {resendTimer > 0
                        ? <>Resend OTP in <strong>{resendTimer}s</strong></>
                        : <>Didn't receive the code? <button type="button" className="otp-resend-btn" onClick={handleResendOtp}>Resend OTP</button></>
                    }
                </p>
            </form>
        );
    }

    return createPortal(
        <div className="auth-modal-backdrop" onClick={handleClose}>
            <div className="auth-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                {/* Close */}
                <button className="auth-modal-close" onClick={handleClose} title="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>

                {/* Brand */}
                <div className="auth-modal-brand">
                    <span className="auth-modal-logo">🔥</span>
                    <div>
                        <h2 className="auth-modal-title">The Flavor Alchemist</h2>
                        <p className="auth-modal-subtitle">
                            {currentView === "login"
                                ? (loginMode === "otp"
                                    ? (otpStep === "input" ? "Login with a one-time password" : "Enter the verification code")
                                    : "Sign in to your account")
                                : "Create an account to get started"}
                        </p>
                    </div>
                </div>

                {/* ═══ LOGIN — OTP mode (default, Zomato-style) ═══ */}
                {currentView === "login" && loginMode === "otp" && otpStep === "input" && (
                    <form onSubmit={handleSendOtp} className="auth-modal-form" noValidate>
                        {formErrors.submit && <p className="auth-modal-error-msg">{formErrors.submit}</p>}

                        {/* Email/Phone toggle — only shown if phone OTP is configured */}
                        {otpConfig.phoneOtp && (
                            <div className="otp-type-toggle">
                                <button type="button" className={`otp-type-btn${otpType === "email" ? " active" : ""}`}
                                    onClick={() => { setOtpType("email"); setOtpDestination(""); setFormErrors({}); }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                                    Email
                                </button>
                                <button type="button" className={`otp-type-btn${otpType === "phone" ? " active" : ""}`}
                                    onClick={() => { setOtpType("phone"); setOtpDestination(""); setFormErrors({}); }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                                    Phone
                                </button>
                            </div>
                        )}

                        <Input
                            label={otpType === "email" ? "Email Address" : "Phone Number"}
                            type={otpType === "email" ? "email" : "tel"}
                            id="otp-destination"
                            value={otpDestination}
                            placeholder={otpType === "email" ? "you@example.com" : "+91XXXXXXXXXX"}
                            onChange={(e) => { setOtpDestination(e.target.value); if (formErrors.destination) setFormErrors((p) => ({ ...p, destination: "" })); }}
                            error={formErrors.destination}
                        />

                        <button type="submit" className="auth-modal-submit" disabled={authCtx.isLoading}>
                            {authCtx.isLoading ? "Sending…" : "Send One Time Password"}
                        </button>

                        <div className="auth-modal-divider"><span>or</span></div>

                        <button type="button" className="auth-modal-alt-btn" onClick={() => { setLoginMode("password"); setFormErrors({}); }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            Continue with Password
                        </button>

                        <p className="auth-modal-switch">New to The Flavor Alchemist? <button type="button" onClick={() => switchView("signup")}>Create account</button></p>
                    </form>
                )}

                {/* ═══ LOGIN — OTP verify ═══ */}
                {currentView === "login" && loginMode === "otp" && otpStep === "otp-sent" && renderOtpBoxes(handleVerifyOtp)}

                {/* ═══ LOGIN — OTP needs name (new user) ═══ */}
                {currentView === "login" && loginMode === "otp" && otpStep === "needs-name" && (
                    <form onSubmit={handleNameThenVerify} className="auth-modal-form" noValidate>
                        {formErrors.submit && <p className="auth-modal-error-msg">{formErrors.submit}</p>}
                        <p className="otp-new-user-msg">Welcome! We just need your name to create your account.</p>
                        <Input label="Full Name" type="text" id="otp-name" value={otpName}
                            onChange={(e) => { setOtpName(e.target.value); if (formErrors.name) setFormErrors((p) => ({ ...p, name: "" })); }}
                            error={formErrors.name} />
                        <button type="submit" className="auth-modal-submit" disabled={authCtx.isLoading}>
                            {authCtx.isLoading ? "Sending new code…" : "Continue"}
                        </button>
                    </form>
                )}

                {/* ═══ LOGIN — Password mode ═══ */}
                {currentView === "login" && loginMode === "password" && (
                    <form onSubmit={handleLoginSubmit} className="auth-modal-form" noValidate>
                        {formErrors.submit && <p className="auth-modal-error-msg">{formErrors.submit}</p>}
                        <Input label="Email Address" type="email" id="modal-email" value={loginData.email}
                            onChange={(e) => { setLoginData((p) => ({ ...p, email: e.target.value })); if (formErrors.email) setFormErrors((p) => ({ ...p, email: "" })); }}
                            error={formErrors.email} />
                        <Input label="Password" type="password" id="modal-password" value={loginData.password}
                            onChange={(e) => { setLoginData((p) => ({ ...p, password: e.target.value })); if (formErrors.password) setFormErrors((p) => ({ ...p, password: "" })); }}
                            error={formErrors.password} />
                        <button type="submit" className="auth-modal-submit" disabled={authCtx.isLoading}>
                            {authCtx.isLoading ? "Signing in…" : "Login"}
                        </button>

                        <div className="auth-modal-divider"><span>or</span></div>

                        <button type="button" className="auth-modal-alt-btn" onClick={() => { setLoginMode("otp"); setFormErrors({}); resetOtp(); }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                            Login with OTP instead
                        </button>

                        <p className="auth-modal-switch">New to The Flavor Alchemist? <button type="button" onClick={() => switchView("signup")}>Create account</button></p>
                    </form>
                )}

                {/* ═══ SIGNUP ═══ */}
                {currentView === "signup" && (
                    <form onSubmit={handleSignupSubmit} className="auth-modal-form" noValidate>
                        {formErrors.submit && <p className="auth-modal-error-msg">{formErrors.submit}</p>}
                        <Input label="Full Name" type="text" id="modal-name" value={signupData.name}
                            onChange={(e) => { setSignupData((p) => ({ ...p, name: e.target.value })); if (formErrors.name) setFormErrors((p) => ({ ...p, name: "" })); }}
                            error={formErrors.name} />
                        <Input label="Email Address" type="email" id="modal-signup-email" value={signupData.email}
                            onChange={(e) => { setSignupData((p) => ({ ...p, email: e.target.value })); if (formErrors.email) setFormErrors((p) => ({ ...p, email: "" })); }}
                            error={formErrors.email} />
                        <Input label="Password" type="password" id="modal-signup-password" value={signupData.password}
                            onChange={(e) => { setSignupData((p) => ({ ...p, password: e.target.value })); if (formErrors.password) setFormErrors((p) => ({ ...p, password: "" })); }}
                            error={formErrors.password} />
                        <Input label="Confirm Password" type="password" id="modal-confirm-password" value={signupData.confirmPassword}
                            onChange={(e) => { setSignupData((p) => ({ ...p, confirmPassword: e.target.value })); if (formErrors.confirmPassword) setFormErrors((p) => ({ ...p, confirmPassword: "" })); }}
                            error={formErrors.confirmPassword} />
                        {signupData.password.length > 0 && (signupData.password.length < 6 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(signupData.password)) && (
                            <p className="auth-modal-hint">Password: min 6 chars, uppercase, lowercase &amp; number</p>
                        )}
                        <button type="submit" className="auth-modal-submit" disabled={authCtx.isLoading}>
                            {authCtx.isLoading ? "Creating account…" : "Create Account"}
                        </button>
                        <p className="auth-modal-switch">Already have an account? <button type="button" onClick={() => switchView("login")}>Login</button></p>
                    </form>
                )}

            </div>
        </div>,
        document.getElementById("modal")
    );
}
