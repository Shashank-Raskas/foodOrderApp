# Food Order App - Setup & Running Guide

## 🎉 Changes Applied

### Backend Improvements
- ✅ Added environment variable support (.env configuration)
- ✅ Fixed CORS security (from `*` to specific origins)
- ✅ Added UUID for order IDs (unique and reliable)
- ✅ Removed hardcoded 1-second delay
- ✅ Added dotenv and uuid packages

### Frontend Improvements
- ✅ Centralized API configuration (no more hardcoded URLs)
- ✅ Added form validation for checkout
- ✅ Fixed context naming typo (userProgresCtx → userProgressCtx)
- ✅ Added error messages for invalid form inputs
- ✅ Added empty cart message
- ✅ Removed console.log statements
- ✅ Cleaned up commented code

### Security & Configuration
- ✅ Environment-based API URLs (.env.local for development, .env.production for production)
- ✅ Secure CORS with allowed origins configuration
- ✅ Service account key excluded from git

---

## 🚀 Running the Application Locally

### Prerequisites
- Node.js (v20 or v22 — see `engines` in package.json)
- npm (comes with Node.js)

### Step 1: Setup Backend Firebase

Before running the backend, you need to set up Firebase credentials:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use an existing one
3. Create a Firestore database
4. Generate a service account key:
   - Click on "Project Settings" (gear icon)
   - Go to "Service Accounts" tab
   - Click "Generate New Private Key"
   - Save the JSON file

5. Place the JSON file in: `backend/service-account-key.json`
   - OR set the FIREBASE_CREDENTIALS environment variable with the JSON string

### Step 2: Configure Environment Variables

**Frontend (.env.local already created):**
```
VITE_API_URL=http://localhost:3000
```

**Backend (backend/.env.local already created):**
```
PORT=3000
NODE_ENV=development
FIREBASE_CREDENTIALS=
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

See `backend/.env.example` for every variable. Locally `JWT_SECRET` / `JWT_REFRESH_SECRET` are optional
(a random secret is used and logins reset when the server restarts); on Render they are required.
The menu is stored in Firestore (`meals` collection) and seeded from `backend/data/available-meals.json`
the first time the backend runs.

### Step 3: Start the Backend Server

Open **Terminal 1** and run:

```bash
cd backend
npm run dev
```

You should see:
```
Server running on port 3000
```

### Step 4: Start the Frontend Development Server

Open **Terminal 2** and run:

```bash
npm run dev
```

You should see:
```
VITE v4.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  press h to show help
```

### Step 5: Open in Browser

Navigate to: **http://localhost:5173**

---

## 🧪 Testing the Application

1. **View Meals**: Should fetch from http://localhost:3000/meals
2. **Add to Cart**: Click "Add to cart" on any meal
3. **Open Cart**: Click "Cart (n)" button in header
4. **Checkout**: Click "Go to Checkout" and fill in your details
   - Form validation will check for:
     - Valid email format
     - Non-empty name, street, postal code, city
5. **Submit Order**: Click "Submit Order"
   - Order should be saved to Firebase Firestore
   - Success message should appear

### Automated tests

None of the tests touch the real Firebase project or send real emails: the backend runs against an
in-memory copy of Firestore (`backend/test/support/fakeFirestore.js`).

| Command (from the repo root) | What it runs |
|---|---|
| `npm test` | Frontend component/unit tests (Jest + React Testing Library) — `src/**/*.test.jsx` |
| `npm run test:backend` | API tests (Jest + Supertest) — `backend/test/*.test.js` |
| `npm run test:e2e` | Browser tests (Playwright) — `e2e/*.spec.js`. Builds the frontend, starts the backend on port 3100 and clicks through the real app in Microsoft Edge |
| `npm run test:all` | Lint + all three of the above |
| `npm run test:coverage` | Jest coverage reports for frontend and backend (`coverage/` folders) |

Set `TEST_LOGS=1` to see the app's console output while Jest runs (it's hidden by default).

First time only: `npm install` in the root **and** in `backend/`. The e2e tests use the installed Edge;
on a machine without Edge (e.g. CI) run `npx playwright install chromium` and set `PW_CHANNEL=chromium`.
After a failed e2e run, `npx playwright show-report` shows screenshots and traces.

---

## 📁 Project Structure After Changes

```
foodOrderApp/
├── .env.local                  # Frontend development env
├── .env.production             # Frontend production env
├── backend/
│   ├── .env.local             # Backend development env
│   ├── .env.production        # Backend production env
│   ├── app.js                 # Express server with CORS & env config
│   ├── createApp.js           # Builds the Express app (middleware + routes); app.js starts it
│   ├── config/env.js          # Loads .env and the JWT secrets
│   ├── routes/                # auth, user, orders, meals, admin
│   ├── services/              # menu, coupons, tokens, OTP, email, SMS
│   ├── firebase.js            # Firebase setup
│   ├── service-account-key.json # Firebase credentials (git ignored)
│   ├── package.json           # Added dotenv & uuid
│   ├── data/
│   │   └── available-meals.json  # Seed for the Firestore menu
│   ├── test/                  # Jest API tests (in-memory Firestore)
│   └── public/
│       └── images/
├── src/
│   ├── App.jsx
│   ├── config/
│   │   └── api.js            # NEW: Centralized API configuration
│   ├── components/
│   │   ├── Meals.jsx         # UPDATED: Uses API config
│   │   ├── MealItem.jsx      # UPDATED: Uses API config
│   │   ├── Cart.jsx          # UPDATED: Shows empty cart message
│   │   ├── Checkout.jsx      # UPDATED: Form validation, UUID order IDs
│   │   └── UI/
│   │       ├── Input.jsx     # UPDATED: Error display support
│   ├── util/
│   │   ├── formatting.js
│   │   └── validation.js     # NEW: Form validation utilities
│   └── hooks/
│       └── useHttp.js
└── vite.config.js
```

---

## 🐛 Troubleshooting

### Backend not starting
- Check if port 3000 is already in use
- Verify Firebase credentials are set up correctly
- Check `.env.local` file exists in `backend/` folder

### Frontend can't connect to backend
- Ensure backend is running on `http://localhost:3000`
- Check browser console for CORS errors
- Verify VITE_API_URL in `.env.local` is correct

### Meals not loading
- Make sure backend is running first
- Check Network tab in browser DevTools
- Verify `backend/data/available-meals.json` exists

### Form validation not working
- Clear browser cache (Ctrl+Shift+Delete)
- Check console for errors
- Verify Input component has error styling

### Firebase errors
- Ensure service account key is valid
- Check Firestore is enabled in Firebase project
- Verify ALLOWED_ORIGINS matches your URLs

---

## 📝 Additional Notes

### Environment Variables Explained

**VITE_API_URL**: The base URL for API calls
- Development: `http://localhost:3000`
- Production: Your deployed backend URL

**ALLOWED_ORIGINS**: Which domains can access your backend
- Can be comma-separated: `http://localhost:5173,https://example.com`

**NODE_ENV**: Controls how the app runs
- `development`: Shows detailed errors
- `production`: Optimized for deployment

---

## 🚀 Building for Production

### Frontend
```bash
npm run build
preview: npm run preview
```

### Deploy
Update `.env.production` with your production API URL, then build and deploy the `dist/` folder to your hosting service.

---

## ✨ Features to Enhance Further

1. **Categories & Filtering**: Filter meals by type
2. **Search**: Search meals by name
3. **Order History**: View past orders
4. **User Authentication**: Login/Sign up system
5. **Payment Integration**: Stripe or PayPal
6. **Admin Dashboard**: Manage meals & orders
7. **Mobile Responsive**: Better mobile experience
8. **Dark/Light Theme**: User preference

---

## 📞 Support

If you encounter any issues:
1. Check the Troubleshooting section
2. Verify all environment variables are set
3. Check browser console and network requests
4. Ensure both frontend and backend are running
