/**
 * Sensor Data Collection API - Assignment 4 Version
 * "BreathEasy Dublin" - Urban Air Quality & Activity Tracker
 * 
 * Enhanced with:
 * - Firebase Authentication (Google Sign-In)
 * - Air Quality monitoring (EPA Ireland)
 * - Activity Classification (ML-based)
 * - User session management
 * - Health recommendations
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Import Firebase modules
const { 
  initializeFirebase, 
  addSensorDataBatch,
  getRecentSensorData,
  getRecentBikesData,
  admin
} = require('./firebaseConfig');

// Import authentication module
const {
  verifyAuthToken,
  createOrUpdateUser,
  getUserProfile,
  updateUserPreferences,
  getUserSessions,
  requireAuth
} = require('./firebaseAuth');

// Import data fetchers
const { 
  startDublinBikesFetcher, 
  getFetcherStats: getBikesStats,
  triggerManualFetch: triggerBikesFetch
} = require('./dublinBikesFetcher');

const {
  startAirQualityFetcher,
  getAirQualityForLocation,
  getAirQualityStats,
  fetchAirQualityData
} = require('./airQualityFetcher');

// Import activity classifier
const {
  classifyDataBatch,
  summarizeSession
} = require('./activityClassifier');

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
  console.error('   Error:', error.message);
}

// Start Dublin Bikes fetcher
try {
  startDublinBikesFetcher();
  console.log('✅ Dublin Bikes fetcher started');
} catch (error) {
  console.error('⚠️ Warning: Dublin Bikes fetcher failed');
  console.error('   Error:', error.message);
}

// Start Air Quality fetcher
try {
  startAirQualityFetcher();
  console.log('✅ Air Quality fetcher started');
} catch (error) {
  console.error('⚠️ Warning: Air Quality fetcher failed');
  console.error('   Error:', error.message);
}

// ============================================================
// PUBLIC ENDPOINTS (No authentication required)
// ============================================================

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    message: 'BreathEasy Dublin - Urban Air Quality & Activity Tracker',
    version: '4.0',
    features: {
      authentication: true,
      sensorData: true,
      dublinBikes: true,
      airQuality: true,
      activityClassification: true,
      healthRecommendations: true
    }
  });
});

// ============================================================
// AUTHENTICATION ENDPOINTS
// ============================================================

// User login/signup
app.post('/api/auth/login', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'ID token is required'
      });
    }
    
    // Verify token
    const authResult = await verifyAuthToken(idToken);
    
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    // Create or update user
    const userResult = await createOrUpdateUser(authResult);
    
    if (!userResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create user profile'
      });
    }
    
    // Get user profile
    const profileResult = await getUserProfile(authResult.uid);
    
    res.json({
      success: true,
      user: profileResult.user,
      message: 'Login successful'
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user profile
app.get('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const result = await getUserProfile(req.user.uid);
    
    if (result.success) {
      res.json({
        success: true,
        user: result.user
      });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update user preferences
app.put('/api/auth/preferences', requireAuth, async (req, res) => {
  try {
    const { preferences } = req.body;
    
    const result = await updateUserPreferences(req.user.uid, preferences);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Preferences updated'
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// SESSION MANAGEMENT ENDPOINTS (Authenticated)
// ============================================================

// Start new session (now with user association)
app.post('/api/session/start', requireAuth, async (req, res) => {
  try {
    const db = admin.firestore();
    const sessionRef = db.collection('users')
      .doc(req.user.uid)
      .collection('sessions')
      .doc();
    
    const newSession = {
      sessionId: sessionRef.id,
      userId: req.user.uid,
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      status: 'active',
      dataPoints: 0,
      activities: {},
      airQualityExposure: [],
      route: []
    };
    
    await sessionRef.set(newSession);
    
    // Also keep in memory for CSV export
    sessionId = sessionRef.id;
    sensorData = [];
    
    console.log('📱 Session started for user:', req.user.email);
    
    res.json({ 
      success: true, 
      sessionId: sessionRef.id,
      message: 'Session started'
    });
    
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Receive sensor data with activity classification
app.post('/api/data', requireAuth, async (req, res) => {
  const { data, sessionId: clientSessionId } = req.body;
  
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid data format' 
    });
  }

  try {
    // Classify activities in the data
    const classifiedData = classifyDataBatch(data);
    
    // Add user ID to each data point
    const enrichedData = classifiedData.map(point => ({
      ...point,
      userId: req.user.uid,
      sessionId: clientSessionId || sessionId
    }));
    
    // Add to in-memory storage for CSV
    sensorData.push(...enrichedData);
    
    // Store to Firestore
    const firestoreResult = await addSensorDataBatch(enrichedData);
    
    // Update session metadata
    if (clientSessionId) {
      const db = admin.firestore();
      const sessionRef = db.collection('users')
        .doc(req.user.uid)
        .collection('sessions')
        .doc(clientSessionId);
      
      const activitySummary = summarizeSession(enrichedData);
      
      await sessionRef.update({
        dataPoints: admin.firestore.FieldValue.increment(enrichedData.length),
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
        activities: activitySummary.summary
      });
    }
    
    console.log(`✅ Stored ${data.length} classified points for ${req.user.email}`);
    
    res.json({ 
      success: true, 
      totalPoints: sensorData.length,
      message: `Received ${data.length} points with activity classification`,
      storedToCloud: firestoreResult.success
    });
    
  } catch (error) {
    console.error('Data storage error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop session
app.post('/api/session/stop', requireAuth, async (req, res) => {
  try {
    const { sessionId: clientSessionId } = req.body;
    
    if (clientSessionId) {
      const db = admin.firestore();
      const sessionRef = db.collection('users')
        .doc(req.user.uid)
        .collection('sessions')
        .doc(clientSessionId);
      
      // Calculate final metrics
      const sessionData = sensorData; // Use in-memory data
      const activitySummary = summarizeSession(sessionData);
      
      // Calculate total distance (simplified)
      let totalDistance = 0;
      for (let i = 1; i < sessionData.length; i++) {
        if (sessionData[i].latitude && sessionData[i-1].latitude) {
          const dist = calculateDistance(
            sessionData[i-1].latitude, sessionData[i-1].longitude,
            sessionData[i].latitude, sessionData[i].longitude
          );
          totalDistance += dist;
        }
      }
      
      await sessionRef.update({
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        status: 'completed',
        totalDistance: totalDistance,
        totalDuration: activitySummary.totalDuration,
        activities: activitySummary.summary,
        primaryActivity: activitySummary.primaryActivity
      });
      
      // Update user stats
      const userRef = db.collection('users').doc(req.user.uid);
      await userRef.update({
        totalSessions: admin.firestore.FieldValue.increment(1),
        totalDistance: admin.firestore.FieldValue.increment(totalDistance),
        totalDuration: admin.firestore.FieldValue.increment(activitySummary.totalDuration)
      });
      
      console.log(`🛑 Session completed for ${req.user.email}`);
    }
    
    const dataCount = sensorData.length;
    
    res.json({ 
      success: true,
      message: 'Session stopped',
      dataPoints: dataCount,
      sessionId: clientSessionId
    });
    
  } catch (error) {
    console.error('Stop session error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user's session history
app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const result = await getUserSessions(req.user.uid, limit);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get specific session details
app.get('/api/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    const db = admin.firestore();
    const sessionDoc = await db.collection('users')
      .doc(req.user.uid)
      .collection('sessions')
      .doc(req.params.sessionId)
      .get();
    
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    // Get session data points
    const dataSnapshot = await db.collection('sensor_data')
      .where('sessionId', '==', req.params.sessionId)
      .where('userId', '==', req.user.uid)
      .orderBy('timestamp', 'asc')
      .limit(5000)
      .get();
    
    const dataPoints = [];
    dataSnapshot.forEach(doc => {
      dataPoints.push(doc.data());
    });
    
    res.json({
      success: true,
      session: sessionDoc.data(),
      dataPoints: dataPoints,
      count: dataPoints.length
    });
    
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// AIR QUALITY ENDPOINTS
// ============================================================

// Get current air quality for location
app.get('/api/air-quality/current', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude required'
      });
    }
    
    const result = await getAirQualityForLocation(
      parseFloat(lat),
      parseFloat(lng)
    );
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get air quality fetcher stats
app.get('/api/air-quality/stats', (req, res) => {
  const stats = getAirQualityStats();
  res.json({
    success: true,
    stats: stats
  });
});

// Trigger manual air quality fetch
app.post('/api/air-quality/fetch', async (req, res) => {
  try {
    const result = await fetchAirQualityData();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// HEALTH RECOMMENDATIONS ENDPOINT
// ============================================================

app.get('/api/recommendations', requireAuth, async (req, res) => {
  try {
    const { lat, lng, activity } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Location required'
      });
    }
    
    // Get current air quality
    const aqResult = await getAirQualityForLocation(
      parseFloat(lat),
      parseFloat(lng)
    );
    
    if (!aqResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Could not fetch air quality data'
      });
    }
    
    // Get user preferences
    const userProfile = await getUserProfile(req.user.uid);
    const sensitivity = userProfile.user?.preferences?.airQualitySensitivity || 'medium';
    
    // Generate recommendations
    const recommendations = generateRecommendations(
      aqResult.station,
      activity || 'walking',
      sensitivity
    );
    
    res.json({
      success: true,
      airQuality: aqResult.station,
      recommendations: recommendations
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// EXISTING ENDPOINTS (CSV, bikes, etc.)
// ============================================================

// Download CSV
app.get('/api/data/download', async (req, res) => {
  if (sensorData.length === 0) {
    return res.status(404).json({ 
      success: false, 
      error: 'No data available' 
    });
  }

  const sortedData = [...sensorData].sort((a, b) => a.timestamp - b.timestamp);

  const headers = [
    'timestamp', 'datetime', 'seconds_elapsed',
    'latitude', 'longitude', 'altitude', 'speed', 'accuracy', 'heading',
    'accel_x', 'accel_y', 'accel_z', 'accel_magnitude',
    'activity', 'activity_confidence', 'health_impact', 'air_quality_sensitivity'
  ];

  let csv = headers.join(',') + '\n';

  const startTime = sortedData[0].timestamp;

  sortedData.forEach(point => {
    const row = [
      point.timestamp,
      new Date(point.timestamp).toISOString(),
      ((point.timestamp - startTime) / 1000).toFixed(3),
      point.latitude || '', point.longitude || '', point.altitude || '',
      point.speed || '', point.accuracy || '', point.heading || '',
      point.accel_x || '', point.accel_y || '', point.accel_z || '',
      point.accel_magnitude || '',
      point.activity || '', point.activity_confidence || '',
      point.health_impact || '', point.air_quality_sensitivity || ''
    ];
    csv += row.join(',') + '\n';
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=sensor_data_${sessionId}.csv`);
  res.send(csv);
});

// Dublin Bikes endpoints
app.get('/api/firestore/dublin-bikes', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const result = await getRecentBikesData(limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/dublin-bikes/stats', (req, res) => {
  const stats = getBikesStats();
  res.json({ success: true, stats: stats });
});

app.post('/api/dublin-bikes/fetch', async (req, res) => {
  try {
    const result = await triggerBikesFetch();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function generateRecommendations(airQuality, activity, sensitivity) {
  const aqi = airQuality.aqi.overall;
  const recommendations = {
    safeToExercise: true,
    message: '',
    alternatives: [],
    tips: []
  };
  
  // Determine safety based on AQI and activity
  if (activity === 'running' && aqi > 100) {
    recommendations.safeToExercise = false;
    recommendations.message = 'Air quality is unhealthy for running. Consider indoor exercise or lighter activities.';
    recommendations.alternatives = ['Walking', 'Indoor gym', 'Yoga'];
  } else if (activity === 'cycling' && aqi > 150) {
    recommendations.safeToExercise = false;
    recommendations.message = 'Air quality is poor. Avoid cycling outdoors.';
    recommendations.alternatives = ['Dublin Bikes for shorter routes', 'Public transport', 'Walking slowly'];
  } else if (aqi > 50 && aqi <= 100) {
    recommendations.message = 'Air quality is moderate. Sensitive individuals should take precautions.';
    recommendations.tips = [
      'Reduce intensity of outdoor activity',
      'Take breaks in clean air areas',
      'Consider using Dublin Bikes for shorter exposure'
    ];
  } else if (aqi <= 50) {
    recommendations.message = 'Air quality is good! Great time for outdoor exercise.';
    recommendations.tips = [
      'Enjoy your outdoor activity',
      'Great time for running or cycling'
    ];
  }
  
  // Add general tips
  recommendations.tips.push(
    `Nearest air quality station: ${airQuality.station_name} (${airQuality.distance.toFixed(1)} km away)`,
    `Primary pollutant: ${airQuality.aqi.primaryPollutant}`
  );
  
  return recommendations;
}

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 BreathEasy Dublin - Urban Air Quality & Activity Tracker');
  console.log('='.repeat(70));
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/`);
  console.log(`🔐 Firebase Auth: Enabled`);
  console.log(`🔥 Firebase Firestore: Enabled`);
  console.log(`🚴 Dublin Bikes Fetcher: Running (every 2 minutes)`);
  console.log(`🌫️  Air Quality Fetcher: Running (every 15 minutes)`);
  console.log(`🤖 Activity Classifier: Enabled`);
  console.log(`💚 Health Recommendations: Enabled`);
  console.log('='.repeat(70) + '\n');
});