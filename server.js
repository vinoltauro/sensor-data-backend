/**
 * Sensor Data Collection API - Assignment 3 Version
 * 
 * Enhanced with:
 * - Firebase Firestore integration for real-time data storage
 * - Dublin Bikes API fetcher running every 5 minutes
 * - All original CSV export functionality maintained
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Import Firebase and Dublin Bikes modules
const { 
  initializeFirebase, 
  addSensorDataBatch,
  getRecentSensorData,
  getRecentBikesData
} = require('./firebaseConfig');

const { 
  startDublinBikesFetcher, 
  getFetcherStats,
  triggerManualFetch
} = require('./dublinBikesFetcher');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// In-memory storage for sensor data (kept for CSV export)
let sensorData = [];
let sessionId = null;

// Initialize Firebase on startup
try {
  initializeFirebase();
  console.log('✅ Firebase initialized');
} catch (error) {
  console.error('⚠️ Warning: Firebase initialization failed');
  console.error('   Server will run but data won\'t be stored to cloud');
  console.error('   Error:', error.message);
}

// Start Dublin Bikes fetcher
try {
  startDublinBikesFetcher();
  console.log('✅ Dublin Bikes fetcher started');
} catch (error) {
  console.error('⚠️ Warning: Dublin Bikes fetcher failed to start');
  console.error('   Error:', error.message);
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    message: 'Sensor Data Collection API - Assignment 3',
    features: {
      sensorData: true,
      dublinBikes: true,
      firestore: true
    },
    dataPoints: sensorData.length,
    sessionId: sessionId
  });
});

// Start new session
app.post('/api/session/start', (req, res) => {
  sessionId = Date.now().toString();
  sensorData = [];
  console.log('📱 New session started:', sessionId);
  res.json({ 
    success: true, 
    sessionId: sessionId,
    message: 'Session started'
  });
});

// Receive sensor data - NOW WITH FIREBASE!
app.post('/api/data', async (req, res) => {
  const { data } = req.body;
  
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid data format' 
    });
  }

  // Add data to in-memory storage (for CSV export)
  sensorData.push(...data);
  
  // ASSIGNMENT 3 ADDITION: Store to Firebase Firestore in real-time!
  try {
    const firestoreResult = await addSensorDataBatch(data);
    
    if (firestoreResult.success) {
      console.log(`✅ Stored ${data.length} points to Firestore. Total in memory: ${sensorData.length}`);
    } else {
      console.log(`⚠️ Firestore storage failed: ${firestoreResult.error}`);
    }
  } catch (error) {
    console.error('❌ Error storing to Firestore:', error.message);
    // Continue anyway - we still have in-memory data
  }
  
  res.json({ 
    success: true, 
    totalPoints: sensorData.length,
    message: `Received ${data.length} points`,
    storedToCloud: true
  });
});

// Get current data count
app.get('/api/data/count', (req, res) => {
  res.json({ 
    count: sensorData.length,
    sessionId: sessionId
  });
});

// Download CSV (original functionality maintained)
app.get('/api/data/download', (req, res) => {
  if (sensorData.length === 0) {
    return res.status(404).json({ 
      success: false, 
      error: 'No data available' 
    });
  }

  // Sort by timestamp
  const sortedData = [...sensorData].sort((a, b) => a.timestamp - b.timestamp);

  // Create CSV content
  const headers = [
    'timestamp',
    'datetime',
    'seconds_elapsed',
    'latitude',
    'longitude',
    'altitude',
    'speed',
    'accuracy',
    'heading',
    'accel_x',
    'accel_y',
    'accel_z',
    'accel_magnitude'
  ];

  let csv = headers.join(',') + '\n';

  const startTime = sortedData[0].timestamp;

  sortedData.forEach(point => {
    const row = [
      point.timestamp,
      new Date(point.timestamp).toISOString(),
      ((point.timestamp - startTime) / 1000).toFixed(3),
      point.latitude || '',
      point.longitude || '',
      point.altitude || '',
      point.speed || '',
      point.accuracy || '',
      point.heading || '',
      point.accel_x || '',
      point.accel_y || '',
      point.accel_z || '',
      point.accel_magnitude || ''
    ];
    csv += row.join(',') + '\n';
  });

  // Set headers for download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=sensor_data_${sessionId}.csv`);
  res.send(csv);

  console.log('📥 CSV downloaded:', sensorData.length, 'points');
});

// Stop session and clear data
app.post('/api/session/stop', (req, res) => {
  const dataCount = sensorData.length;
  console.log('🛑 Session stopped:', sessionId, 'Points:', dataCount);
  
  res.json({ 
    success: true,
    message: 'Session stopped',
    dataPoints: dataCount,
    sessionId: sessionId
  });
});

// NEW: Get recent sensor data from Firestore
app.get('/api/firestore/sensor-data', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const result = await getRecentSensorData(limit);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        count: result.count
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// NEW: Get recent Dublin Bikes data from Firestore
app.get('/api/firestore/dublin-bikes', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const result = await getRecentBikesData(limit);
    
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        count: result.count
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// NEW: Get Dublin Bikes fetcher stats
app.get('/api/dublin-bikes/stats', (req, res) => {
  const stats = getFetcherStats();
  res.json({
    success: true,
    stats: stats
  });
});

// NEW: Trigger manual Dublin Bikes fetch (for testing)
app.post('/api/dublin-bikes/fetch', async (req, res) => {
  try {
    console.log('🔧 Manual fetch requested');
    const result = await triggerManualFetch();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Fetch completed successfully',
        stationsCount: result.stationsCount
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Sensor Data Collection API - Assignment 3');
  console.log('='.repeat(60));
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/`);
  console.log(`🔥 Firebase Firestore: Enabled`);
  console.log(`🚴 Dublin Bikes Fetcher: Running (every 5 minutes)`);
  console.log('='.repeat(60) + '\n');
});