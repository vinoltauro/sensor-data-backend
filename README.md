# 🚀 Urban Computing Assignment 3 - Setup Instructions

## Overview

This enhanced backend integrates:
- ✅ **Firebase Firestore** for real-time sensor data storage
- ✅ **Dublin Bikes API** fetcher (updates every 5 minutes)
- ✅ Original CSV export functionality maintained

---

## 📋 Prerequisites

1. **Node.js** (v18 or higher)
2. **Firebase Project** with Firestore enabled
3. **JCDecaux API Key** for Dublin Bikes data

---

## 🔧 Setup Instructions

### Step 1: Install Dependencies

```bash
npm install
```

This installs:
- `express` - Web server
- `cors` - Cross-origin requests
- `dotenv` - Environment variables
- `firebase-admin` - Firebase SDK
- `node-cron` - Scheduled tasks

---

### Step 2: Firebase Setup

#### 2.1 Create Firebase Project

1. Go to https://console.firebase.google.com/
2. Click "Add project"
3. Name it: `urban-computing-assignment3`
4. Disable Google Analytics
5. Click "Create project"

#### 2.2 Enable Firestore

1. In Firebase Console → **Build** → **Firestore Database**
2. Click "Create database"
3. Choose **"Start in test mode"**
4. Select location: **europe-west1** (closest to Ireland)
5. Click "Enable"

#### 2.3 Get Service Account Key

1. Firebase Console → **Project Settings** (⚙️ icon)
2. Go to **"Service accounts"** tab
3. Click **"Generate new private key"**
4. Download the JSON file
5. **Rename it to:** `firebase-admin-key.json`
6. **Place it in the root directory** of this project
7. **NEVER commit this file to Git!** (already in .gitignore)

---

### Step 3: JCDecaux API Key

1. Go to https://developer.jcdecaux.com/
2. Create an account
3. Register a new application
4. Copy your API key

---

### Step 4: Environment Variables

1. Copy the template:
```bash
cp .env.example .env
```

2. Edit `.env` and add your JCDecaux API key:
```env
JCDECAUX_API_KEY=your_actual_api_key_here
PORT=10000
```

---

### Step 5: Verify Firebase Credentials

Make sure you have:
- ✅ `firebase-admin-key.json` in root directory
- ✅ File is in `.gitignore`
- ✅ File is NOT committed to Git

---

## 🚀 Running the Server

### Development Mode (with auto-reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

You should see:
```
============================================================
🚀 Sensor Data Collection API - Assignment 3
============================================================
📡 Server running on port 10000
🌐 Health check: http://localhost:10000/
🔥 Firebase Firestore: Enabled
🚴 Dublin Bikes Fetcher: Running (every 5 minutes)
============================================================
```

---

## 🧪 Testing the Integration

### Test 1: Check Server Status

```bash
curl http://localhost:10000/
```

Expected response:
```json
{
  "status": "running",
  "message": "Sensor Data Collection API - Assignment 3",
  "features": {
    "sensorData": true,
    "dublinBikes": true,
    "firestore": true
  }
}
```

---

### Test 2: Check Dublin Bikes Fetcher

```bash
curl http://localhost:10000/api/dublin-bikes/stats
```

Should show fetcher statistics including fetch count and last fetch time.

---

### Test 3: Trigger Manual Dublin Bikes Fetch

```bash
curl -X POST http://localhost:10000/api/dublin-bikes/fetch
```

Then check Firebase Console → Firestore → `dublin_bikes` collection

---

### Test 4: Collect Sensor Data

1. Open your React frontend
2. Start data collection
3. Walk around for a minute
4. Check Firebase Console → Firestore → `sensor_data` collection
5. You should see data appearing in real-time!

---

## 📊 Verifying Data in Firebase

### Check Sensor Data:
1. Go to Firebase Console
2. Click **Firestore Database**
3. Look for collection: **`sensor_data`**
4. You should see documents with:
   - timestamp
   - latitude, longitude
   - speed, accuracy
   - accel_x, accel_y, accel_z
   - created_at (server timestamp)

### Check Dublin Bikes Data:
1. Same Firebase Console
2. Look for collection: **`dublin_bikes`**
3. You should see documents with:
   - station_number
   - station_name
   - available_bikes
   - available_bike_stands
   - position (lat/lng)
   - fetched_at (timestamp)

---

## 🌐 API Endpoints

### Original Endpoints (maintained):
- `GET /` - Health check
- `POST /api/session/start` - Start new session
- `POST /api/data` - Upload sensor data (**NOW SAVES TO FIREBASE!**)
- `GET /api/data/count` - Get data count
- `GET /api/data/download` - Download CSV
- `POST /api/session/stop` - Stop session

### New Endpoints (Assignment 3):
- `GET /api/firestore/sensor-data?limit=100` - Query sensor data from Firestore
- `GET /api/firestore/dublin-bikes?limit=100` - Query Dublin Bikes data
- `GET /api/dublin-bikes/stats` - Get fetcher statistics
- `POST /api/dublin-bikes/fetch` - Trigger manual fetch

---

## 🔍 Troubleshooting

### Problem: "Cannot find module './firebase-admin-key.json'"

**Solution:**
- Make sure you downloaded the Firebase service account key
- Rename it to exactly `firebase-admin-key.json`
- Place it in the root directory (same level as server.js)

---

### Problem: "JCDECAUX_API_KEY not found"

**Solution:**
- Check that `.env` file exists
- Make sure it contains: `JCDECAUX_API_KEY=your_key`
- Restart the server after editing .env

---

### Problem: "Firebase permission denied"

**Solution:**
- Go to Firebase Console → Firestore Database → Rules
- Make sure rules allow write access:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
*Note: These are test rules. For production, add proper authentication!*

---

### Problem: Dublin Bikes data not appearing

**Solution:**
- Check server logs for "Fetching Dublin Bikes data..."
- Wait 5 minutes for first scheduled fetch
- Or trigger manual fetch: `POST /api/dublin-bikes/fetch`
- Check your JCDecaux API key is valid

---

## 📁 File Structure

```
sensor-data-backend/
├── server.js                  # Main server (use this!)
├── firebaseConfig.js          # Firebase setup
├── dublinBikesFetcher.js      # Dublin Bikes API fetcher
├── firebase-admin-key.json    # YOUR Firebase credentials (DON'T COMMIT!)
├── .env                       # Environment variables (DON'T COMMIT!)
├── .env.example               # Environment template
├── .gitignore                 # Git ignore rules
├── package.json               # Dependencies
└── README.md                  # This file
```

---

## 🎯 What Happens When Server Starts

1. ✅ Express server initializes
2. ✅ Firebase Admin SDK connects to Firestore
3. ✅ Dublin Bikes fetcher makes immediate first fetch
4. ✅ Cron job schedules fetches every 5 minutes
5. ✅ Server ready to receive sensor data
6. ✅ All data automatically saved to Firebase!

---

## 📸 Screenshots for Report

Take screenshots of:

1. **Firebase Console - Firestore Database**
   - Show `sensor_data` collection with documents
   - Show `dublin_bikes` collection with documents

2. **Server Terminal Output**
   - Show successful startup messages
   - Show "Fetching Dublin Bikes data..." logs
   - Show "Stored X points to Firestore" messages

3. **API Response**
   - Show response from `/api/dublin-bikes/stats`
   - Show response from `/api/firestore/sensor-data`

---

## 🚀 Deployment to Render.com

### Step 1: Add Environment Variable
In Render dashboard:
- Add: `JCDECAUX_API_KEY` = your_key

### Step 2: Add Firebase Credentials
Two options:

**Option A: Base64 encode (recommended)**
```bash
base64 firebase-admin-key.json > firebase-key-base64.txt
```
Then in Render, add environment variable:
- `FIREBASE_CONFIG_BASE64` = contents of firebase-key-base64.txt

Update `firebaseConfig.js` to decode if needed.

**Option B: Manual paste**
- Copy entire contents of `firebase-admin-key.json`
- In Render, add environment variable:
- `FIREBASE_CONFIG` = paste JSON
- Update code to use process.env.FIREBASE_CONFIG

---

## ✅ Assignment 3 Checklist

- [ ] Firebase project created
- [ ] Firestore database enabled
- [ ] Service account key downloaded and placed
- [ ] JCDecaux API key obtained
- [ ] .env file created with API key
- [ ] Dependencies installed (`npm install`)
- [ ] Server runs without errors
- [ ] Sensor data appears in Firestore
- [ ] Dublin Bikes data appears in Firestore
- [ ] Screenshots taken for report
- [ ] Code deployed to Render.com

---

## 📝 For Your Report

**Task 1: Sensor Data to Cloud**
- ✅ Modified `POST /api/data` endpoint to write to Firestore
- ✅ Uses `addSensorDataBatch()` function
- ✅ Data stored in real-time as it's collected
- ✅ Screenshot showing data in Firebase Console

**Task 2: Open Data to Cloud**
- ✅ Created `dublinBikesFetcher.js` service
- ✅ Fetches JCDecaux API every 5 minutes using cron
- ✅ Stores to `dublin_bikes` Firestore collection
- ✅ Screenshot showing data in Firebase Console

---

## 🎉 You're Done!

Your Assignment 3 infrastructure is ready! 

Next steps:
1. ✅ Run the server
2. ✅ Collect some sensor data
3. ✅ Verify data in Firebase
4. ✅ Take screenshots
5. ✅ Write report
6. ✅ Submit!

**Need help? Check the troubleshooting section above!**