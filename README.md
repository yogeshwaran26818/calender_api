# Google OAuth Calendar API

Complete Google OAuth 2.0 implementation with Node.js/Express backend and React frontend.

## Project Structure
```
calender_api/
├── backend/
│   ├── config/
│   │   └── passport.js
│   ├── models/
│   │   └── User.js
│   ├── routes/
│   │   └── auth.js
│   ├── .env
│   ├── package.json
│   └── server.js
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── components/
    │   │   ├── Dashboard.js
    │   │   └── Login.js
    │   ├── App.css
    │   ├── App.js
    │   └── index.js
    └── package.json
```

## Setup Instructions

### 1. Install Backend Dependencies
```bash
cd backend
npm install
```

### 2. Install Frontend Dependencies
```bash
cd frontend
npm install
```

### 3. Environment Variables
The `.env` file is already configured with your credentials:
- GOOGLE_CLIENT_ID: 1034039399224-mf140bku4hbd9r14adgupr9nehtt9t4o.apps.googleusercontent.com
- GOOGLE_CLIENT_SECRET: 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
- MongoDB URI: Your cluster connection string

### 4. Google OAuth Configuration
Make sure your Google OAuth settings have:
- **Authorized JavaScript origins:** http://localhost:3000
- **Authorized redirect URIs:** http://localhost:5000/auth/google/callback

### 5. Run the Application

**Start Backend (Terminal 1):**
```bash
cd backend
npm run dev
```
Backend will run on: http://localhost:5000

**Start Frontend (Terminal 2):**
```bash
cd frontend
npm start
```
Frontend will run on: http://localhost:3000

## Features

✅ Google OAuth 2.0 login  
✅ User session management  
✅ Protected dashboard route  
✅ User profile display (name, email, picture)  
✅ Logout functionality  
✅ Error handling  
✅ CORS configuration  
✅ MongoDB user storage  

## API Endpoints

- `GET /auth/google` - Initiate Google OAuth
- `GET /auth/google/callback` - Handle OAuth callback
- `GET /auth/user` - Get current user info
- `POST /auth/logout` - Logout user
- `GET /dashboard` - Protected dashboard route

## Usage

1. Open http://localhost:3000
2. Click "Sign in with Google"
3. Complete Google authentication
4. Get redirected to dashboard with user profile
5. Access to dashboard is protected - redirects to login if not authenticated

## Error Handling

- Authentication failures redirect to login with error message
- Network errors are caught and displayed
- Protected routes check authentication status
- Session management handles expired sessions