import { useState, useEffect, useContext } from 'react';
import AuthContext from './store/AuthContext';
import { API_ENDPOINTS } from '../config/api';
import { currencyFormatter } from '../util/formatting';
import './AdminDashboard.css';

function StatCard({ label, value, sub }) {
  return (
    <div className="adm-stat-card">
      <span className="adm-stat-value">{value}</span>
      <span className="adm-stat-label">{label}</span>
      {sub && <span className="adm-stat-sub">{sub}</span>}
    </div>
  );
}

export default function AdminDashboard() {
  const authCtx = useContext(AuthContext);
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);

  const adminEmail = authCtx.user?.email;

  useEffect(() => {
    if (!adminEmail) return;
    setLoading(true);
    setError(null);

    const fetchOrders = fetch(`${API_ENDPOINTS.ADMIN_ORDERS}?adminEmail=${encodeURIComponent(adminEmail)}`).then(r => r.json());
    const fetchUsers = fetch(`${API_ENDPOINTS.ADMIN_USERS}?adminEmail=${encodeURIComponent(adminEmail)}`).then(r => r.json());

    Promise.all([fetchOrders, fetchUsers])
      .then(([ordersData, usersData]) => {
        if (ordersData.orders) setOrders(ordersData.orders);
        if (usersData.users) setUsers(usersData.users);
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, [adminEmail]);

  const filteredOrders = orders.filter(o => {
    const q = search.toLowerCase();
    return (
      !q ||
      o.customer?.name?.toLowerCase().includes(q) ||
      o.customer?.email?.toLowerCase().includes(q) ||
      o.id?.toLowerCase().includes(q)
    );
  });

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
  });

  const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.totalPrice || 0), 0);
  const todayOrders = orders.filter(o => {
    const d = new Date(o.createdAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  if (loading) {
    return (
      <div className="adm-loading">
        <div className="adm-spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return <div className="adm-error">{error}</div>;
  }

  return (
    <div className="adm-dashboard">
      <div className="adm-header">
        <div>
          <h1 className="adm-title">🔥 Admin Dashboard</h1>
          <p className="adm-subtitle">The Flavor Alchemist — Control Panel</p>
        </div>
      </div>

      {/* Stats */}
      <div className="adm-stats-grid">
        <StatCard label="Total Orders" value={orders.length} />
        <StatCard label="Total Revenue" value={currencyFormatter.format(totalRevenue)} />
        <StatCard label="Registered Users" value={users.length} />
        <StatCard label="Today's Orders" value={todayOrders.length} sub={todayOrders.length > 0 ? currencyFormatter.format(todayOrders.reduce((s, o) => s + parseFloat(o.totalPrice || 0), 0)) : null} />
      </div>

      {/* Tab Bar */}
      <div className="adm-tabs">
        <button className={`adm-tab ${tab === 'orders' ? 'adm-tab--active' : ''}`} onClick={() => { setTab('orders'); setSearch(''); }}>
          Orders ({orders.length})
        </button>
        <button className={`adm-tab ${tab === 'users' ? 'adm-tab--active' : ''}`} onClick={() => { setTab('users'); setSearch(''); }}>
          Users ({users.length})
        </button>
      </div>

      {/* Search */}
      <div className="adm-search-wrap">
        <input
          className="adm-search"
          type="text"
          placeholder={tab === 'orders' ? 'Search by name, email or order ID…' : 'Search by name or email…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Orders Table */}
      {tab === 'orders' && (
        <div className="adm-table-wrap">
          {filteredOrders.length === 0 ? (
            <p className="adm-empty">No orders found.</p>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <>
                    <tr key={order.id} className="adm-row">
                      <td>{order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                      <td>{order.customer?.name || '—'}</td>
                      <td className="adm-email">{order.customer?.email || '—'}</td>
                      <td>{Array.isArray(order.items) ? order.items.length : '—'}</td>
                      <td className="adm-amount">{currencyFormatter.format(parseFloat(order.totalPrice || 0))}</td>
                      <td>
                        <button className="adm-expand-btn" onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
                          {expandedOrder === order.id ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {expandedOrder === order.id && (
                      <tr key={`${order.id}-detail`} className="adm-detail-row">
                        <td colSpan="6">
                          <div className="adm-order-detail">
                            <div className="adm-detail-section">
                              <strong>Address:</strong> {order.customer?.street}, {order.customer?.city} — {order.customer?.['postal-code']}
                            </div>
                            <div className="adm-detail-section">
                              <strong>Items:</strong>
                              <ul className="adm-items-list">
                                {(order.items || []).map((item, i) => (
                                  <li key={i}>{item.name} × {item.quantity} — {currencyFormatter.format(parseFloat(item.price) * item.quantity)}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="adm-detail-section adm-order-id">
                              <strong>Order ID:</strong> <code>{order.id}</code>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Users Table */}
      {tab === 'users' && (
        <div className="adm-table-wrap">
          {filteredUsers.length === 0 ? (
            <p className="adm-empty">No users found.</p>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id} className="adm-row">
                    <td>{user.name || '—'}</td>
                    <td className="adm-email">{user.email || '—'}</td>
                    <td>{user.phone || '—'}</td>
                    <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
