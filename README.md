# 🚑 SwiftCare — Emergency Transport Partner
### Stack: React + Node.js + MySQL + GROQ AI (Free)

---

## ⚙️ Setup — Step by Step

### Step 1 — Get a FREE GROQ API Key
1. Go to 👉 https://console.groq.com/?utm_source=chatgpt.com
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the key (starts with `AIzaSy...`)

---

### Step 2 — Setup MySQL Database
Open MySQL (Workbench / phpMyAdmin / terminal) and run:

```sql
CREATE DATABASE swiftcare;
```

Then run the schema file:
```bash
mysql -u root -p swiftcare < backend/db/schema.sql
```
Or paste the contents of `backend/db/schema.sql` into MySQL Workbench and run it.

This creates all tables and seeds 2 ambulances automatically.

---

### Step 3 — Configure Backend .env
```bash
cd backend
cp .env.example .env
```

Edit `.env`:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=swiftcare

JWT_SECRET=anyrandomstring123

GEMINI_API_KEY=AIzaSy_xxxxxxxxxxxxxxxx   ← paste your key here

PORT=5000
```

---

### Step 4 — Install & Run Backend
```bash
cd backend
npm install
node server.js
```

You should see:
```
MySQL Connected: localhost
Ambulance availability reset successfully.
Server running on port 5000
```

---

### Step 5 — Run Frontend
Open a second terminal:
```bash
cd lifelink
npm install
npm run dev
```

Open browser at: **http://localhost:5173** 🎉

---

## 🤖 How the AI Chatbot Works
1. User types emergency symptoms (e.g. "Patient is bleeding from the arm")
2. Frontend → `POST /api/reports/ai-chat` (backend)
3. Backend calls **Google Gemini 2.0 Flash** (free) with a first-aid system prompt
4. Gemini replies with calm, step-by-step first-aid instructions
5. Full conversation history is sent each time (multi-turn memory)
6. Click **"End Conversation & Generate Report"** to save/download

---

## 📁 Key Files Changed
| File | What Changed |
|---|---|
| `backend/db/mysql.js` | NEW — MySQL connection pool |
| `backend/db/schema.sql` | NEW — All tables + seed data |
| `backend/server.js` | MongoDB → MySQL |
| `backend/controllers/ambulanceController.js` | Mongoose → mysql2 queries |
| `backend/controllers/reportController.js` | Mock AI → Google Gemini API |
| `backend/routes/authRoutes.js` | Mongoose → mysql2 |
| `backend/routes/ambulanceRoutes.js` | Removed Mongoose model import |
| `backend/package.json` | Removed mongoose, added mysql2 |
| `backend/.env.example` | Updated for MySQL + Gemini |
| `lifelink/src/ui/AIHelp.jsx` | Calls backend API (already done) |
