/**
 * Firebase Admin SDK Configuration
 * Initializes Firebase for backend services
 */

const admin = require('firebase-admin');

let firebaseApp;

try {
  // Check if running on Render (has FIREBASE_CONFIG_BASE64)
  if (process.env.FIREBASE_CONFIG_BASE64) {
    console.log('🔐 Using FIREBASE_CONFIG_BASE64 from environment');
    
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_CONFIG_BASE64, 'base64').toString('utf8')
    );
    
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
    
    console.log('✅ Firebase Admin initialized with service account');
  } 
  // Local development - try to load from file
  else {
    console.log('📁 Loading firebase-admin-key.json from local file');
    
    const serviceAccount = require('./firebase-admin-key.json');
    
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
    
    console.log('✅ Firebase Admin initialized from local file');
  }
} catch (error) {
  console.error('❌ Firebase initialization failed:', error.message);
  console.error('💡 Make sure FIREBASE_CONFIG_BASE64 is set in Render environment variables');
  console.error('💡 Or firebase-admin-key.json exists locally');
  throw error;
}

module.exports = {
  admin,
  app: firebaseApp
};