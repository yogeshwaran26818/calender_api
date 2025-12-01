# Google OAuth Calendar API

Complete Google OAuth 2.0 implementation with Node.js/Express backend and React frontend.

## ⚠️ Security Notice

**IMPORTANT:** Never commit your `.env` file or expose your API credentials in public repositories. Always use environment variables and keep sensitive data secure.

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
Create a `.env` file in the `backend` directory with the following variables:
```env
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
MONGODB_URI=your_mongodb_connection_string_here
SESSION_SECRET=your_random_session_secret_here
USE_MONGODB=true
OPENAI_API_KEY=your_openai_api_key_here
```

**How to get credentials:**
1. **Google OAuth:** Visit [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. **MongoDB:** Visit [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
3. **OpenAI:** Visit [OpenAI Platform](https://platform.openai.com/api-keys)

### 4. Add .env to .gitignore
Make sure your `.env` file is in `.gitignore` to prevent exposing credentials:
```bash
echo ".env" >> backend/.gitignore
```

### 5. Google OAuth Configuration
Make sure your Google OAuth settings have:
- **Authorized JavaScript origins:** http://localhost:3000
- **Authorized redirect URIs:** http://localhost:5000/auth/google/callback

### 6. Run the Application

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