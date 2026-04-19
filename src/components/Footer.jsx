import { useNavigate } from 'react-router-dom';
import logo from '../assets/logo.jpg';

export default function Footer() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-top">
        {/* Brand */}
        <div className="footer-section footer-brand">
          <div className="footer-logo" onClick={() => { navigate('/'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <img src={logo} alt="The Flavor Alchemist" />
            <h3>The Flavor Alchemist</h3>
          </div>
          <p className="footer-tagline">
            Crafting extraordinary flavors from the finest ingredients. Order your favorite meals and experience culinary magic delivered to your door.
          </p>
          <div className="footer-socials">
            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
            </a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter / X">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </a>
          </div>
        </div>

        {/* Quick Links */}
        <div className="footer-section">
          <h4>Quick Links</h4>
          <ul>
            <li><a onClick={() => { navigate('/'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Home</a></li>
            <li><a onClick={() => navigate('/menu')}>Menu</a></li>
            <li><a onClick={() => navigate('/about')}>About Us</a></li>
            <li><a onClick={() => navigate('/contact')}>Contact Us</a></li>
            <li><a onClick={() => navigate('/favorites')}>Favorites</a></li>
            <li><a onClick={() => navigate('/orders')}>Order History</a></li>
          </ul>
        </div>

        {/* Contact Us */}
        <div className="footer-section">
          <h4>Contact Us</h4>
          <ul className="footer-contact">
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>Plot No. 83, Opp. Cyber Towers, Hitech City Road, Madhapur, Hyderabad — 500081</span>
            </li>
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
              <span>040-4857-2936 / 040-4857-2937</span>
            </li>
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <a href="mailto:flavoralchemist9@gmail.com" style={{color: 'inherit'}}>flavoralchemist9@gmail.com</a>
            </li>
          </ul>
        </div>

        {/* Legal / Info */}
        <div className="footer-section">
          <h4>Information</h4>
          <ul>
            <li><a onClick={() => navigate('/about')}>About Us</a></li>
            <li><a onClick={() => navigate('/privacy-policy')}>Privacy Policy</a></li>
            <li><a onClick={() => navigate('/terms')}>Terms &amp; Conditions</a></li>
            <li><a onClick={() => navigate('/refund-policy')}>Refund Policy</a></li>
            <li><a onClick={() => navigate('/faqs')}>FAQs</a></li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom">
        <p>&copy; {currentYear} The Flavor Alchemist. All rights reserved.</p>
        <p className="footer-designed-by">
          Designed &amp; Developed by <strong>Shashank Raskas</strong>
        </p>
        <p className="footer-made-with">
          Made with <span className="footer-heart">♥</span> for food lovers everywhere
        </p>
      </div>
    </footer>
  );
}
