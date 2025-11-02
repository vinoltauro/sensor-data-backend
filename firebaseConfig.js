/**
 * Firebase Admin SDK Configuration
 * 
 * This file initializes Firebase Admin SDK for server-side operations
 * Used to write sensor data and Dublin Bikes data to Firestore
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// The service account key should be in firebase-admin-key.json
let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) {
    console.log('✅ Firebase already initialized');
    return admin;
  }

  try {
    // Try to load service account from file
    const serviceAccount = require('./firebase-admin-key.json');
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL // Optional, for Realtime DB
    });

    firebaseInitialized = true;
    console.log('🔥 Firebase Admin SDK initialized successfully');
    
  } catch (error) {
    console.error('❌ Error initializing Firebase:', error.message);
    console.error('Make sure firebase-admin-key.json exists in the root directory');
    throw error;
  }

  return admin;
}

// Get Firestore instance
function getFirestore() {
  if (!firebaseInitialized) {
    initializeFirebase();
  }
  return admin.firestore();
}

// Helper function to add sensor data to Firestore
async function addSensorData(dataPoint) {
  try {
    const db = getFirestore();
    const docRef = await db.collection('sensor_data').add({
      ...dataPoint,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true, docId: docRef.id };
  } catch (error) {
    console.error('Error adding sensor data:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to add multiple sensor data points (batch)
async function addSensorDataBatch(dataPoints) {
  try {
    const db = getFirestore();
    const batch = db.batch();
    
    const results = [];
    
    // Firebase batch limit is 500, so we'll do it in chunks
    const BATCH_SIZE = 500;
    
    for (let i = 0; i < dataPoints.length; i += BATCH_SIZE) {
      const chunk = dataPoints.slice(i, i + BATCH_SIZE);
      const currentBatch = db.batch();
      
      chunk.forEach(dataPoint => {
        const docRef = db.collection('sensor_data').doc();
        currentBatch.set(docRef, {
          ...dataPoint,
          created_at: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      
      await currentBatch.commit();
      results.push({ success: true, count: chunk.length });
    }
    
    return { 
      success: true, 
      totalAdded: dataPoints.length,
      batches: results.length 
    };
    
  } catch (error) {
    console.error('Error adding sensor data batch:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to add Dublin Bikes data to Firestore
async function addDublinBikesData(stationsData) {
  try {
    const db = getFirestore();
    const batch = db.batch();
    
    const timestamp = new Date();
    
    stationsData.forEach(station => {
      const docRef = db.collection('dublin_bikes').doc();
      batch.set(docRef, {
        ...station,
        fetched_at: admin.firestore.Timestamp.fromDate(timestamp),
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
    
    console.log(`✅ Added ${stationsData.length} Dublin Bikes stations to Firestore`);
    
    return { 
      success: true, 
      stationsAdded: stationsData.length,
      timestamp: timestamp.toISOString()
    };
    
  } catch (error) {
    console.error('Error adding Dublin Bikes data:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to query recent sensor data
async function getRecentSensorData(limit = 100) {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('sensor_data')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();
    
    const data = [];
    snapshot.forEach(doc => {
      data.push({ id: doc.id, ...doc.data() });
    });
    
    return { success: true, data, count: data.length };
    
  } catch (error) {
    console.error('Error querying sensor data:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to query recent Dublin Bikes data
async function getRecentBikesData(limit = 100) {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('dublin_bikes')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();
    
    const data = [];
    snapshot.forEach(doc => {
      data.push({ id: doc.id, ...doc.data() });
    });
    
    return { success: true, data, count: data.length };
    
  } catch (error) {
    console.error('Error querying bikes data:', error);
    return { success: false, error: error.message };
  }
}

// Export functions
module.exports = {
  initializeFirebase,
  getFirestore,
  addSensorData,
  addSensorDataBatch,
  addDublinBikesData,
  getRecentSensorData,
  getRecentBikesData,
  admin // Export admin for direct access if needed
};