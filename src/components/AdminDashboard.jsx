import { useState, useEffect, useContext, useMemo } from 'react';
import AuthContext from './store/AuthContext';
import { API_ENDPOINTS } from '../config/api';
import authFetch from '../config/authFetch';
import { currencyFormatter } from '../util/formatting';
import './AdminDashboard.css';

function StatCard({ label, value, sub, icon }) {
  return (
    <div className="adm-stat-card">
      {icon && <span className="adm-stat-icon">{icon}</span>}
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
  const [meals, setMeals] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);

  // Meal form state
  const [mealForm, setMealForm] = useState(null);
  const [mealSaving, setMealSaving] = useState(false);

  // Coupon form state
  const [couponForm, setCouponForm] = useState(null);
  const [couponSaving, setCouponSaving] = useState(false);

  useEffect(() => {
    if (!authCtx.isAdmin) return;
    setLoading(true);
    setError(null);

    Promise.all([
      authFetch(API_ENDPOINTS.ADMIN_ORDERS).then(r => r.json()),
      authFetch(API_ENDPOINTS.ADMIN_USERS).then(r => r.json()),
      authFetch(API_ENDPOINTS.ADMIN_MEALS).then(r => r.json()),
      authFetch(API_ENDPOINTS.ADMIN_COUPONS).then(r => r.json()),
    ])
      .then(([ordersData, usersData, mealsData, couponsData]) => {
        if (ordersData.orders) setOrders(ordersData.orders);
        if (usersData.users) setUsers(usersData.users);
        if (mealsData.meals) setMeals(mealsData.meals);
        if (couponsData.coupons) setCoupons(couponsData.coupons);
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, [authCtx.isAdmin]);

  // Search filtering
  const filteredOrders = orders.filter(o => {
    const q = search.toLowerCase();
    return !q || o.customer?.name?.toLowerCase().includes(q) || o.customer?.email?.toLowerCase().includes(q) || o.id?.toLowerCase().includes(q);
  });

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q);
  });

  const filteredMeals = meals.filter(m => {
    const q = search.toLowerCase();
    return !q || m.name?.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q);
  });

  const filteredCoupons = coupons.filter(c => {
    const q = search.toLowerCase();
    return !q || c.code?.toLowerCase().includes(q);
  });

  // Stats
  const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total || o.totalPrice || o.items?.reduce((s, i) => s + i.price * i.quantity, 0) || 0), 0);
  const todayOrders = orders.filter(o => {
    const d = new Date(o.createdAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  // Analytics data
  const analytics = useMemo(() => {
    const revenueByDay = {};
    const popularItems = {};
    const hourCounts = new Array(24).fill(0);

    orders.forEach(o => {
      const date = new Date(o.createdAt);
      const dayKey = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      const total = parseFloat(o.total || o.totalPrice || o.items?.reduce((s, i) => s + i.price * i.quantity, 0) || 0);
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + total;

      const hour = date.getHours();
      hourCounts[hour]++;

      (o.items || []).forEach(item => {
        popularItems[item.name] = (popularItems[item.name] || 0) + (item.quantity || 1);
      });
    });

    const dayEntries = Object.entries(revenueByDay).slice(-14);
    const maxRevenue = Math.max(...dayEntries.map(([, v]) => v), 1);

    const topItems = Object.entries(popularItems).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const maxItemCount = Math.max(...topItems.map(([, v]) => v), 1);

    const maxHour = Math.max(...hourCounts, 1);

    return { dayEntries, maxRevenue, topItems, maxItemCount, hourCounts, maxHour };
  }, [orders]);

  // Meal CRUD
  async function handleSaveMeal() {
    if (!mealForm?.name || !mealForm?.price) return;
    setMealSaving(true);
    try {
      const isEdit = !!mealForm.id;
      const url = isEdit ? `${API_ENDPOINTS.ADMIN_MEALS}/${mealForm.id}` : API_ENDPOINTS.ADMIN_MEALS;
      const res = await authFetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal: mealForm }),
      });
      const data = await res.json();
      if (res.ok) {
        if (isEdit) {
          setMeals(prev => prev.map(m => m.id === mealForm.id ? data.meal : m));
        } else {
          setMeals(prev => [...prev, data.meal]);
        }
        setMealForm(null);
      }
    } catch { /* silent */ }
    finally { setMealSaving(false); }
  }

  async function handleDeleteMeal(id) {
    if (!confirm('Delete this meal?')) return;
    try {
      await authFetch(`${API_ENDPOINTS.ADMIN_MEALS}/${id}`, { method: 'DELETE' });
      setMeals(prev => prev.filter(m => m.id !== id));
    } catch { /* silent */ }
  }

  // Coupon CRUD
  async function handleSaveCoupon() {
    if (!couponForm?.code || !couponForm?.type || couponForm?.value === undefined) return;
    setCouponSaving(true);
    try {
      const res = await authFetch(API_ENDPOINTS.ADMIN_COUPONS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon: couponForm }),
      });
      const data = await res.json();
      if (res.ok) {
        setCoupons(prev => [data.coupon, ...prev]);
        setCouponForm(null);
      }
    } catch { /* silent */ }
    finally { setCouponSaving(false); }
  }

  async function handleToggleCoupon(id, active) {
    try {
      await authFetch(`${API_ENDPOINTS.ADMIN_COUPONS}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      setCoupons(prev => prev.map(c => c.id === id ? { ...c, active } : c));
    } catch { /* silent */ }
  }

  async function handleDeleteCoupon(id) {
    if (!confirm('Delete this coupon?')) return;
    try {
      await authFetch(`${API_ENDPOINTS.ADMIN_COUPONS}/${id}`, { method: 'DELETE' });
      setCoupons(prev => prev.filter(c => c.id !== id));
    } catch { /* silent */ }
  }

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
        <StatCard icon="📦" label="Total Orders" value={orders.length} />
        <StatCard icon="💰" label="Total Revenue" value={currencyFormatter.format(totalRevenue)} />
        <StatCard icon="👥" label="Registered Users" value={users.length} />
        <StatCard icon="🍽️" label="Menu Items" value={meals.length} />
        <StatCard icon="📅" label="Today's Orders" value={todayOrders.length}
          sub={todayOrders.length > 0 ? currencyFormatter.format(todayOrders.reduce((s, o) => s + parseFloat(o.total || o.totalPrice || 0), 0)) : null} />
        <StatCard icon="🏷️" label="Active Coupons" value={coupons.filter(c => c.active).length} />
      </div>

      {/* Tab Bar */}
      <div className="adm-tabs">
        {['orders', 'users', 'analytics', 'meals', 'coupons'].map(t => (
          <button
            key={t}
            className={`adm-tab ${tab === t ? 'adm-tab--active' : ''}`}
            onClick={() => { setTab(t); setSearch(''); }}
          >
            {t === 'orders' && `Orders (${orders.length})`}
            {t === 'users' && `Users (${users.length})`}
            {t === 'analytics' && 'Analytics'}
            {t === 'meals' && `Menu (${meals.length})`}
            {t === 'coupons' && `Coupons (${coupons.length})`}
          </button>
        ))}
      </div>

      {/* Search (not for analytics) */}
      {tab !== 'analytics' && (
        <div className="adm-search-wrap">
          <input
            className="adm-search"
            type="text"
            placeholder={
              tab === 'orders' ? 'Search by name, email or order ID…' :
              tab === 'meals' ? 'Search by meal name or category…' :
              tab === 'coupons' ? 'Search by coupon code…' :
              'Search by name or email…'
            }
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* ═══ ORDERS TAB ═══ */}
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
                      <td className="adm-amount">{currencyFormatter.format(parseFloat(order.total || order.totalPrice || 0))}</td>
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
                            {order.promoCode && (
                              <div className="adm-detail-section">
                                <strong>Promo:</strong> {order.promoCode} (-{currencyFormatter.format(order.discount || 0)})
                              </div>
                            )}
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

      {/* ═══ USERS TAB ═══ */}
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

      {/* ═══ ANALYTICS TAB ═══ */}
      {tab === 'analytics' && (
        <div className="adm-analytics">
          {/* Revenue Trend */}
          <div className="adm-chart-card">
            <h3>📈 Revenue Trend (Last 14 days)</h3>
            <div className="adm-bar-chart">
              {analytics.dayEntries.map(([day, rev]) => (
                <div key={day} className="adm-bar-col">
                  <div className="adm-bar-fill" style={{ height: `${(rev / analytics.maxRevenue) * 100}%` }}>
                    <span className="adm-bar-tooltip">{currencyFormatter.format(rev)}</span>
                  </div>
                  <span className="adm-bar-label">{day}</span>
                </div>
              ))}
              {analytics.dayEntries.length === 0 && <p className="adm-empty">No order data yet.</p>}
            </div>
          </div>

          {/* Popular Items */}
          <div className="adm-chart-card">
            <h3>🏆 Top 10 Popular Items</h3>
            <div className="adm-h-bar-chart">
              {analytics.topItems.map(([name, count]) => (
                <div key={name} className="adm-h-bar-row">
                  <span className="adm-h-bar-name">{name}</span>
                  <div className="adm-h-bar-track">
                    <div className="adm-h-bar-fill" style={{ width: `${(count / analytics.maxItemCount) * 100}%` }} />
                  </div>
                  <span className="adm-h-bar-value">{count}</span>
                </div>
              ))}
              {analytics.topItems.length === 0 && <p className="adm-empty">No items ordered yet.</p>}
            </div>
          </div>

          {/* Peak Hours */}
          <div className="adm-chart-card">
            <h3>⏰ Peak Order Hours</h3>
            <div className="adm-bar-chart adm-hours-chart">
              {analytics.hourCounts.map((count, hour) => (
                <div key={hour} className="adm-bar-col">
                  <div className="adm-bar-fill" style={{ height: `${(count / analytics.maxHour) * 100}%` }}>
                    {count > 0 && <span className="adm-bar-tooltip">{count}</span>}
                  </div>
                  <span className="adm-bar-label">{hour % 6 === 0 ? `${hour}:00` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MENU MANAGEMENT TAB ═══ */}
      {tab === 'meals' && (
        <div className="adm-meals-section">
          <button className="adm-add-btn" onClick={() => setMealForm({
            name: '', price: '', description: '', category: 'entrees',
            dietary: [], spiceLevel: 'mild', protein: 'vegetarian',
            servingSize: 'individual', isChefSpecial: false, availableTime: 'all-day', image: 'images/default-meal.jpg'
          })}>
            + Add New Meal
          </button>

          {/* Meal Form Modal */}
          {mealForm && (
            <div className="adm-modal-backdrop" onClick={() => setMealForm(null)}>
              <div className="adm-modal" onClick={e => e.stopPropagation()}>
                <h3>{mealForm.id ? 'Edit Meal' : 'Add New Meal'}</h3>
                <div className="adm-form-grid">
                  <div className="adm-form-field">
                    <label>Name *</label>
                    <input value={mealForm.name || ''} onChange={e => setMealForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="adm-form-field">
                    <label>Price (₹) *</label>
                    <input type="number" value={mealForm.price || ''} onChange={e => setMealForm(p => ({ ...p, price: e.target.value }))} />
                  </div>
                  <div className="adm-form-field adm-span-2">
                    <label>Description</label>
                    <textarea value={mealForm.description || ''} onChange={e => setMealForm(p => ({ ...p, description: e.target.value }))} rows={2} />
                  </div>
                  <div className="adm-form-field">
                    <label>Category</label>
                    <select value={mealForm.category} onChange={e => setMealForm(p => ({ ...p, category: e.target.value }))}>
                      <option value="entrees">Entrees</option>
                      <option value="sides">Sides</option>
                      <option value="desserts">Desserts</option>
                      <option value="beverages">Beverages</option>
                      <option value="appetizers">Appetizers</option>
                    </select>
                  </div>
                  <div className="adm-form-field">
                    <label>Spice Level</label>
                    <select value={mealForm.spiceLevel} onChange={e => setMealForm(p => ({ ...p, spiceLevel: e.target.value }))}>
                      <option value="non-spicy">Non-Spicy</option>
                      <option value="mild">Mild</option>
                      <option value="medium">Medium</option>
                      <option value="spicy">Spicy</option>
                      <option value="extra-spicy">Extra Spicy</option>
                    </select>
                  </div>
                  <div className="adm-form-field">
                    <label>Protein</label>
                    <select value={mealForm.protein} onChange={e => setMealForm(p => ({ ...p, protein: e.target.value }))}>
                      {['vegetarian', 'chicken', 'pork', 'beef', 'fish', 'seafood', 'lamb', 'egg'].map(p => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="adm-form-field">
                    <label>Serving Size</label>
                    <select value={mealForm.servingSize} onChange={e => setMealForm(p => ({ ...p, servingSize: e.target.value }))}>
                      <option value="individual">Individual</option>
                      <option value="sharing">Sharing</option>
                      <option value="family">Family</option>
                    </select>
                  </div>
                  <div className="adm-form-field">
                    <label>Available Time</label>
                    <select value={mealForm.availableTime} onChange={e => setMealForm(p => ({ ...p, availableTime: e.target.value }))}>
                      {['all-day', 'breakfast', 'lunch', 'dinner', 'late-night'].map(t => (
                        <option key={t} value={t}>{t.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="adm-form-field">
                    <label>
                      <input type="checkbox" checked={mealForm.isChefSpecial || false} onChange={e => setMealForm(p => ({ ...p, isChefSpecial: e.target.checked }))} />
                      {' '}Chef's Special
                    </label>
                  </div>
                </div>
                <div className="adm-modal-actions">
                  <button className="adm-cancel-btn" onClick={() => setMealForm(null)}>Cancel</button>
                  <button className="adm-save-btn" onClick={handleSaveMeal} disabled={mealSaving}>
                    {mealSaving ? 'Saving...' : 'Save Meal'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Meals Table */}
          <div className="adm-table-wrap">
            {filteredMeals.length === 0 ? (
              <p className="adm-empty">No meals found.</p>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Spice</th>
                    <th>Special</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMeals.map(meal => (
                    <tr key={meal.id} className="adm-row">
                      <td>{meal.name}</td>
                      <td>{meal.category}</td>
                      <td className="adm-amount">{currencyFormatter.format(Number(meal.price))}</td>
                      <td>{meal.spiceLevel}</td>
                      <td>{meal.isChefSpecial ? '⭐' : '—'}</td>
                      <td>
                        <button className="adm-expand-btn" onClick={() => setMealForm({ ...meal })}>Edit</button>
                        <button className="adm-delete-btn" onClick={() => handleDeleteMeal(meal.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══ COUPONS TAB ═══ */}
      {tab === 'coupons' && (
        <div className="adm-coupons-section">
          <button className="adm-add-btn" onClick={() => setCouponForm({
            code: '', type: 'percent', value: '', maxDiscount: '', minOrder: '', maxUses: ''
          })}>
            + Create Coupon
          </button>

          {/* Coupon Form Modal */}
          {couponForm && (
            <div className="adm-modal-backdrop" onClick={() => setCouponForm(null)}>
              <div className="adm-modal" onClick={e => e.stopPropagation()}>
                <h3>Create New Coupon</h3>
                <div className="adm-form-grid">
                  <div className="adm-form-field">
                    <label>Code *</label>
                    <input value={couponForm.code || ''} onChange={e => setCouponForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="e.g. SAVE20" />
                  </div>
                  <div className="adm-form-field">
                    <label>Type *</label>
                    <select value={couponForm.type} onChange={e => setCouponForm(p => ({ ...p, type: e.target.value }))}>
                      <option value="percent">Percentage (%)</option>
                      <option value="flat">Flat (₹)</option>
                    </select>
                  </div>
                  <div className="adm-form-field">
                    <label>Value * ({couponForm.type === 'percent' ? '%' : '₹'})</label>
                    <input type="number" value={couponForm.value || ''} onChange={e => setCouponForm(p => ({ ...p, value: e.target.value }))} />
                  </div>
                  <div className="adm-form-field">
                    <label>Max Discount (₹)</label>
                    <input type="number" value={couponForm.maxDiscount || ''} onChange={e => setCouponForm(p => ({ ...p, maxDiscount: e.target.value }))} placeholder="0 = no limit" />
                  </div>
                  <div className="adm-form-field">
                    <label>Min Order (₹)</label>
                    <input type="number" value={couponForm.minOrder || ''} onChange={e => setCouponForm(p => ({ ...p, minOrder: e.target.value }))} placeholder="0 = no minimum" />
                  </div>
                  <div className="adm-form-field">
                    <label>Max Uses</label>
                    <input type="number" value={couponForm.maxUses || ''} onChange={e => setCouponForm(p => ({ ...p, maxUses: e.target.value }))} placeholder="0 = unlimited" />
                  </div>
                </div>
                <div className="adm-modal-actions">
                  <button className="adm-cancel-btn" onClick={() => setCouponForm(null)}>Cancel</button>
                  <button className="adm-save-btn" onClick={handleSaveCoupon} disabled={couponSaving}>
                    {couponSaving ? 'Creating...' : 'Create Coupon'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Coupons Table */}
          <div className="adm-table-wrap">
            {filteredCoupons.length === 0 ? (
              <p className="adm-empty">No coupons found.</p>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Value</th>
                    <th>Max Disc.</th>
                    <th>Min Order</th>
                    <th>Used</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCoupons.map(coupon => (
                    <tr key={coupon.id} className="adm-row">
                      <td><strong>{coupon.code}</strong></td>
                      <td>{coupon.type === 'percent' ? '%' : '₹'}</td>
                      <td className="adm-amount">{coupon.value}{coupon.type === 'percent' ? '%' : ''}</td>
                      <td>{coupon.maxDiscount ? currencyFormatter.format(coupon.maxDiscount) : '—'}</td>
                      <td>{coupon.minOrder ? currencyFormatter.format(coupon.minOrder) : '—'}</td>
                      <td>{coupon.usedCount || 0}{coupon.maxUses ? `/${coupon.maxUses}` : ''}</td>
                      <td>
                        <span className={`adm-status ${coupon.active ? 'adm-status--active' : 'adm-status--inactive'}`}>
                          {coupon.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button className="adm-expand-btn" onClick={() => handleToggleCoupon(coupon.id, !coupon.active)}>
                          {coupon.active ? 'Disable' : 'Enable'}
                        </button>
                        <button className="adm-delete-btn" onClick={() => handleDeleteCoupon(coupon.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
