import { useNavigate } from 'react-router-dom';
import './PageLayout.css';

export default function PageLayout({ title, children, className = '' }) {
    const navigate = useNavigate();

    return (
        <div className={`page-layout ${className}`}>
            <div className="page-header">
                <button className="page-back-btn" onClick={() => navigate('/')} title="Back to home">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                    <span>Home</span>
                </button>
                {title && <h1 className="page-title">{title}</h1>}
            </div>
            <div className="page-content">
                {children}
            </div>
        </div>
    );
}
