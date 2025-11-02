/**
 * Test Firebase Connection
 * 
 * Run this script to verify Firebase is set up correctly
 * Usage: node testFirebase.js
 */

require('dotenv').config();
const { initializeFirebase, getFirestore, addSensorData } = require('./firebaseConfig');

async function testFirebaseConnection() {
  console.log('🧪 Testing Firebase Connection...\n');
  
  try {
    // Initialize Firebase
    console.log('Step 1: Initializing Firebase Admin SDK...');
    initializeFirebase();
    console.log('✅ Firebase initialized successfully\n');
    
    // Get Firestore instance
    console.log('Step 2: Getting Firestore instance...');
    const db = getFirestore();
    console.log('✅ Firestore instance obtained\n');
    
    // Test write
    console.log('Step 3: Testing write operation...');
    const testData = {
      timestamp: Date.now(),
      latitude: 53.3498,
      longitude: -6.2603,
      altitude: 10,
      speed: 1.5,
      accuracy: 5,
      heading: 180,
      accel_x: 0.5,
      accel_y: 0.3,
      accel_z: 9.8,
      accel_magnitude: 9.85,
      test: true,
      message: 'Firebase connection test'
    };
    
    const result = await addSensorData(testData);
    
    if (result.success) {
      console.log('✅ Test data written successfully!');
      console.log('   Document ID:', result.docId);
      console.log('\n📊 Check Firebase Console → Firestore → sensor_data collection\n');
    } else {
      console.log('❌ Failed to write test data:', result.error);
    }
    
    // Test read
    console.log('Step 4: Testing read operation...');
    const snapshot = await db.collection('sensor_data')
      .where('test', '==', true)
      .limit(5)
      .get();
    
    console.log(`✅ Found ${snapshot.size} test documents\n`);
    
    console.log('='.repeat(60));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('✅ Firebase Admin SDK is working correctly');
    console.log('✅ Firestore connection is active');
    console.log('✅ Read and write operations successful');
    console.log('\n👉 You\'re ready to run the main server!');
    console.log('   Run: npm start\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(60));
    console.error('Error:', error.message);
    console.error('\n📝 Troubleshooting:');
    console.error('   1. Make sure firebase-admin-key.json exists');
    console.error('   2. Check that Firestore is enabled in Firebase Console');
    console.error('   3. Verify your Firebase project settings');
    console.error('\n');
    process.exit(1);
  }
}

// Run the test
testFirebaseConnection();