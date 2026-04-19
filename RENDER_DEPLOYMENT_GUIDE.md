# Render Deployment Configuration Guide

## 🎯 Understanding Your CORS Error

**Error:** `Access to fetch at 'http://localhost:3000/meals' from origin 'https://foodorderapp-99re.onrender.com' has been blocked by CORS policy`

**Root Cause:** Frontend deployed on Render was still trying to fetch from localhost instead of the cloud backend.

**Solution:** We've implemented smart URL detection that automatically uses the correct backend URL based on the deployment environment.

---

## ✅ Fixed Code Changes

### 1. **Smart API Configuration** (`src/config/api.js`)
- Automatically detects if running on localhost → uses `http://localhost:3000`
- Automatically detects if running on cloud → constructs backend URL dynamically
- Falls back to environment variable if explicitly set

### 2. **Improved CORS Handling** (`backend/app.js`)
- Properly handles CORS preflight OPTIONS requests
- Supports multiple allowed origins with trim/whitespace handling
- Credentials support added

---

## 🚀 Step-by-Step Render Setup

### **Verify Your Service Names First**

You should have two services on Render:
- **Frontend:** `foodorderapp-99re` (or similar)
- **Backend:** `orderapp-backend-czwe` (or similar)

Check both service names in your Render dashboard.

---

## 📋 Step 1: Backend Environment Variables

**Go to Render Dashboard:**

1. Select your **Backend Service** (`orderapp-backend-czwe`)
2. Click **Settings** → **Environment**
3. Add these variables:

```
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://foodorderapp-99re.onrender.com,http://localhost:5173
FIREBASE_CREDENTIALS={"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}
```

**Where to get Firebase credentials:**
1. Go to Firebase Console → Your Project
2. Project Settings → Service Accounts
3. Click "Generate New Private Key" (for Node.js)
4. Copy the entire JSON content into `FIREBASE_CREDENTIALS` env var

---

## 📋 Step 2: Frontend - Optional (Usually Not Needed Now)

Since we implemented smart URL detection, frontend doesn't strictly need env vars. But if issues persist:

1. Select your **Frontend Service** (`foodorderapp-99re`)
2. Click **Settings** → **Environment**
3. Optional - add:

```
VITE_API_URL=https://orderapp-backend-czwe.onrender.com
```

---

## 📋 Step 3: Verify Backend Service Names Match

**Check in `src/config/api.js` line 20:**

```javascript
// IMPORTANT: Update 'orderapp-backend-czwe' to match your actual backend service name
const backendHost = host.replace('foodorderapp-99re', 'orderapp-backend-czwe');
```

**Your actual service names:**
- Find them here: Render Dashboard → Your service → **Service Name** (shown in URL bar)
- Example: If backend URL is `https://orderapp-backend-czwe.onrender.com`
- Then service name is: `orderapp-backend-czwe`

**If your names are different, update the mapping:**

```javascript
// If frontend is "my-food-app" and backend is "my-food-api"
const backendHost = host.replace('my-food-app', 'my-food-api');
```

---

## 🔄 Step 4: Push and Redeploy

1. **Make the service name changes** (if needed) in `src/config/api.js`
2. **Push changes:**
   ```bash
   git add .
   git commit -m "Fix: Smart API URL detection and improved CORS handling"
   git push origin main  # or dev, depending on your branch
   ```

3. **Render will auto-redeploy** both services (watch the Logs tab)

---

## ⚠️ Fix: 404 on Page Refresh (SPA Routing)

**Problem:** Navigating directly to `/menu`, `/about`, etc. or refreshing returns a 404.

**Root Cause:** Render's static site server looks for an actual file at each URL path; it doesn't know to always serve `index.html` for a React SPA.

### Fix A — Render Dashboard (for existing services)
1. Open your **Frontend** static site in the Render dashboard
2. Go to **Settings → Redirects/Rewrites**
3. Click **"Add Rule"** and set:
   - **Source:** `/*`
   - **Destination:** `/index.html`
   - **Action:** `Rewrite`
4. Save — 404s on refresh will be gone immediately

### Fix B — `_redirects` file (already committed)
`public/_redirects` contains `/* /index.html 200`, which Vite copies to `dist/_redirects` on every build. Render reads this automatically for static sites. Fix A takes priority but this acts as a reliable fallback.

Verify after a build:
```bash
npm run build
cat dist/_redirects
# Should output: /* /index.html 200
```

---

## ✔️ After Deployment - Verification Checklist

### **1. Check Backend Service**
- Navigate to: `https://orderapp-backend-czwe.onrender.com/meals`
- You should see JSON meal data, NOT an error

### **2. Check Logs**
- Backend → **Logs** tab
- Should show: `Server running on port 3000`
- Should NOT show CORS errors

### **3. Test Frontend**
- Go to: `https://foodorderapp-99re.onrender.com`
- Open **Browser Developer Tools** → **Console** tab
- Add a meal to cart
- Go to Checkout
- Fill form and submit

### **4. If Still Getting CORS Error**
- Backend → Logs: Check error messages
- Frontend → Logs: Check if backend URL is correct
- Run this in browser console to test:
  ```javascript
  fetch('https://orderapp-backend-czwe.onrender.com/meals')
    .then(r => r.json())
    .then(d => console.log(d))
  ```

---

## 🔍 Troubleshooting

### **Frontend still shows `localhost:3000` in error?**
- **Solution:** Clear browser cache and force hard refresh (Ctrl+Shift+R)
- Or open in Incognito/Private window
- Render frontend might need 5-10 minutes to fully rebuild

### **Getting 403 or "Not found" from backend?**
- Check `ALLOWED_ORIGINS` includes your frontend URL
- Make sure `FIREBASE_CREDENTIALS` is valid JSON (no newlines issues)
- Check backend logs for specific errors

### **Firebase errors when submitting order?**
- Verify `FIREBASE_CREDENTIALS` is complete JSON
- Check Firebase project is active
- Verify Firestore database exists and is accessible
- Check Firebase rules allow writes to `orders` collection

### **Backend never starts?**
- Check `FIREBASE_CREDENTIALS` format - must be single line valid JSON
- Check for syntax errors in `.env.production` if present
- View backend logs for exact error

---

## 📱 Local Testing (Before Deployment)

Test locally first to ensure everything works:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Should show: Server running on port 3000
```

**Terminal 2 - Frontend:**
```bash
npm run dev
# Should show: Local: http://localhost:5173
```

**Test in browser:**
- Open `http://localhost:5173`
- Functions should work normally
- Check console for no errors

---

## 🔐 Security Notes

1. **Never commit `.env` files** ✓ Already in `.gitignore`
2. **Firebase credentials handled via environment variables** ✓ Secure
3. **CORS properly configured** ✓ Only specific origins allowed
4. **Production uses HTTPS** ✓ Render enforces this

---

## 📊 Service Name Reference

| Component | Type | URL Pattern | Service Name |
|-----------|------|-------------|--------------|
| Frontend | Web Service | `https://[name].onrender.com` | `foodorderapp-99re` |
| Backend | Web Service | `https://[name].onrender.com` | `orderapp-backend-czwe` |

Update the replace logic in `src/config/api.js` if your names are different!

---

## ✨ What's Different This Deployment

### **Before (Broken)**
- Frontend hardcoded: `https://orderapp-backend-czwe.onrender.com/meals`
- CORS didn't handle preflight properly
- Env variables not picked up in build

### **After (Fixed)**
✅ Frontend auto-detects backend based on its own domain
✅ Smart fallback to localhost for local development
✅ Proper CORS with preflight request handling
✅ No environment variables needed in Render (but still supported)

---

## 🎉 You're All Set!

After following these steps, your app should:
1. ✅ Load meals from cloud backend
2. ✅ Add items to cart
3. ✅ Checkout with validation
4. ✅ Save orders to Firebase
5. ✅ Show success message

**Need help?** Check the Logs tab on Render dashboard for any errors!
