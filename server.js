/**
 * BreathEasy Dublin - Backend Server
 * Assignment 4: Complete Implementation
 * 
 * Features:
 * - Firebase Authentication
 * - Dublin Bikes real-time data
 * - Air Quality monitoring (5 EPA stations)
 * - Luas real-time arrivals (25 stations)
 * - Activity classification with step counter
 * - Health score calculation
 * - Session management
 */

const express = require('express');
const cors = require('cors');
const { admin } = require('./firebaseConfig');

// Import authentication module
const {
  requireAuth,
  verifyAuthToken,
  createOrUpdateUser,
  getUserProfile,
  getUserSessions
} = require('./firebaseAuth');

// Import data fetchers
const {
  startDublinBikesFetcher,
  getDublinBikesStats
} = require('./dublinBikesFetcher');

const {
  startAirQualityFetcher,
  getAirQualityForLocation,
  getAirQualityStats
} = require('./airQualityFetcher');

const {
  startLuasFetcher,
  getNearestLuasStations,
  getLuasStats
} = require('./luasFetcher');

// Import classifiers and calculators
const {
  ActivityClassifier,
  classifyDataBatch,
  summarizeSession
} = require('./activityClassifier');

const {
  calculateHealthScore
} = require('./healthScoreCalculator');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Initialize Activity Classifier
const activityClassifier = new ActivityClassifier();

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

/**
 * Login/Register with Firebase
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided'
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyAuthToken(idToken);
    
    // Create or update user in Firestore
    const user = await createOrUpdateUser(decodedToken);
    
    res.json({
      success: true,
      user: user,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get user profile
 */
app.get('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.uid);
    res.json({
      success: true,
      profile: profile
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// SESSION MANAGEMENT ENDPOINTS
// ==========================================

/**
 * Start a new recording session
 */
app.post('/api/session/start', requireAuth, async (req, res) => {
  try {
    const { startLocation } = req.body;
    
    const db = admin.firestore();
    const sessionRef = db.collection('users')
      .doc(req.user.uid)
      .collection('sessions')
      .doc();
    
    await sessionRef.set({
      userId: req.user.uid,
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      startLocation: startLocation || null,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Session started: ${sessionRef.id} for user: ${req.user.uid}`);
    
    res.json({
      success: true,
      sessionId: sessionRef.id
    });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Stop recording session and calculate metrics
 */
app.post('/api/session/stop', requireAuth, async (req, res) => {
  try {
    const { sessionId: clientSessionId } = req.body;
    
    if (clientSessionId) {
      const db = admin.firestore();
      const sessionRef = db.collection('users')
        .doc(req.user.uid)
        .collection('sessions')
        .doc(clientSessionId);
      
      // Get session data points
      const dataSnapshot = await db.collection('sensor_data')
        .where('sessionId', '==', clientSessionId)
        .where('userId', '==', req.user.uid)
        .orderBy('timestamp', 'asc')
        .get();
      
      const sessionData = [];
      dataSnapshot.forEach(doc => sessionData.push(doc.data()));
      
      console.log(`📊 Processing ${sessionData.length} data points for session ${clientSessionId}`);
      
      // Calculate metrics using enhanced classifier
      const activitySummary = summarizeSession(sessionData);
      
      // Calculate total distance
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
      
      // Get air quality history for session
      const airQualityHistory = sessionData
        .filter(d => d.airQuality)
        .map(d => ({ aqi: d.airQuality?.aqi?.overall || 0 }));
      
      // Calculate health score
      const healthScore = calculateHealthScore(
        {
          distanceKm: totalDistance,
          activities: activitySummary.summary,
          durationMinutes: parseFloat(activitySummary.totalDurationMinutes)
        },
        airQualityHistory
      );
      
      console.log(`💚 Health score: ${healthScore.totalScore}/10`);
      
      // Update session with enhanced metrics
      await sessionRef.update({
        endTime: admin.firestore.FieldValue.serverTimestamp(),
        status: 'completed',
        totalDistance: totalDistance,
        totalDuration: activitySummary.totalDuration,
        activities: activitySummary.summary,
        primaryActivity: activitySummary.primaryActivity,
        steps: activitySummary.steps,
        pace: activitySummary.pace,
        calories: activitySummary.calories,
        healthScore: healthScore,
        dataPointsCount: sessionData.length
      });
      
      // Update user stats
      const userRef = db.collection('users').doc(req.user.uid);
      await userRef.update({
        totalSessions: admin.firestore.FieldValue.increment(1),
        totalDistance: admin.firestore.FieldValue.increment(totalDistance),
        totalDuration: admin.firestore.FieldValue.increment(activitySummary.totalDuration),
        totalSteps: admin.firestore.FieldValue.increment(activitySummary.steps || 0)
      });
      
      console.log(`✅ Session ${clientSessionId} completed successfully`);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Stop session error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get user's sessions
 */
app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const sessions = await getUserSessions(req.user.uid, limit);
    
    res.json({
      success: true,
      sessions: sessions
    });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get specific session details with all data points
 */
app.get('/api/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const db = admin.firestore();
    
    // Get session metadata
    const sessionDoc = await db.collection('users')
      .doc(req.user.uid)
      .collection('sessions')
      .doc(sessionId)
      .get();
    
    if (!sessionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    // Get session data points
    const dataSnapshot = await db.collection('sensor_data')
      .where('sessionId', '==', sessionId)
      .where('userId', '==', req.user.uid)
      .orderBy('timestamp', 'asc')
      .get();
    
    const dataPoints = [];
    dataSnapshot.forEach(doc => dataPoints.push(doc.data()));
    
    res.json({
      success: true,
      data: {
        ...sessionDoc.data(),
        id: sessionDoc.id,
        dataPoints: dataPoints
      }
    });
  } catch (error) {
    console.error('Get session details error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// SENSOR DATA ENDPOINTS
// ==========================================

/**
 * Receive and process sensor data
 */
app.post('/api/data', requireAuth, async (req, res) => {
  try {
    const { sessionId, sensorData } = req.body;
    
    if (!sessionId || !sensorData || !Array.isArray(sensorData)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid data format'
      });
    }
    
    // Classify activities
    const classifiedData = classifyDataBatch(sensorData);
    
    // Add userId and sessionId to each point
    const enrichedData = classifiedData.map(point => ({
      ...point,
      userId: req.user.uid,
      sessionId: sessionId,
      receivedAt: admin.firestore.FieldValue.serverTimestamp()
    }));
    
    // Save to Firestore
    const db = admin.firestore();
    const batch = db.batch();
    
    enrichedData.forEach(point => {
      const docRef = db.collection('sensor_data').doc();
      batch.set(docRef, point);
    });
    
    await batch.commit();
    
    res.json({
      success: true,
      classifiedData: enrichedData,
      count: enrichedData.length
    });
  } catch (error) {
    console.error('Data processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Download session data as CSV
 */
app.get('/api/data/download', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID required'
      });
    }
    
    const db = admin.firestore();
    const snapshot = await db.collection('sensor_data')
      .where('sessionId', '==', sessionId)
      .where('userId', '==', req.user.uid)
      .orderBy('timestamp', 'asc')
      .get();
    
    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        error: 'No data found'
      });
    }
    
    // Generate CSV
    let csv = 'timestamp,latitude,longitude,accel_x,accel_y,accel_z,accel_magnitude,speed,activity,activity_confidence\n';
    
    snapshot.forEach(doc => {
      const data = doc.data();
      csv += `${data.timestamp},${data.latitude},${data.longitude},${data.accel_x},${data.accel_y},${data.accel_z},${data.accel_magnitude},${data.speed},${data.activity},${data.activity_confidence}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=session_${sessionId}.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// AIR QUALITY ENDPOINTS
// ==========================================

/**
 * Get current air quality for location
 */
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
    console.error('Air quality error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get air quality fetcher statistics
 */
app.get('/api/air-quality/stats', (req, res) => {
  const stats = getAirQualityStats();
  res.json({ success: true, stats });
});

/**
 * Manually trigger air quality fetch
 */
app.post('/api/air-quality/fetch', async (req, res) => {
  try {
    const { fetchAirQualityData } = require('./airQualityFetcher');
    const result = await fetchAirQualityData();
    res.json(result);
  } catch (error) {
    console.error('Manual fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// HEALTH RECOMMENDATIONS ENDPOINT
// ==========================================

/**
 * Get personalized health recommendations
 */
app.get('/api/recommendations', async (req, res) => {
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
      return res.json({
        success: true,
        recommendation: {
          safeToExercise: true,
          message: 'Air quality data unavailable',
          alternatives: [],
          tips: ['Check local air quality before intense exercise']
        }
      });
    }
    
    const aqi = aqResult.data.aqi.overall;
    const category = aqResult.data.aqi.category;
    const currentActivity = activity || 'walking';
    
    // Activity intensity multipliers
    const intensityMultipliers = {
      standing: 1.0,
      walking: 1.5,
      running: 3.0,
      cycling: 2.0,
      vehicle: 1.0
    };
    
    const multiplier = intensityMultipliers[currentActivity.toLowerCase()] || 1.5;
    const adjustedAQI = aqi * multiplier;
    
    // Generate recommendations
    let safeToExercise = adjustedAQI <= 100;
    let message = '';
    let alternatives = [];
    let tips = [];
    
    if (adjustedAQI <= 50) {
      message = 'Excellent conditions for all activities!';
      tips = ['Great time for outdoor exercise', 'Air quality is optimal'];
    } else if (adjustedAQI <= 100) {
      message = 'Good conditions for moderate exercise';
      tips = ['Air quality is acceptable', 'Safe for most outdoor activities'];
    } else if (adjustedAQI <= 150) {
      message = 'Consider reducing exercise intensity';
      alternatives = ['Try walking instead of running', 'Exercise indoors if possible'];
      tips = ['Sensitive groups should be cautious', 'Avoid prolonged outdoor exertion'];
    } else {
      message = 'Not recommended for outdoor exercise';
      alternatives = ['Exercise indoors', 'Wait for better air quality', 'Use gym facilities'];
      tips = ['Air quality is unhealthy', 'Avoid outdoor activities'];
      safeToExercise = false;
    }
    
    res.json({
      success: true,
      recommendation: {
        safeToExercise,
        message,
        alternatives,
        tips,
        aqi,
        category,
        adjustedAQI: Math.round(adjustedAQI),
        nearestStation: aqResult.data.station_name,
        distance: aqResult.data.distance,
        primaryPollutant: aqResult.data.aqi.primaryPollutant
      }
    });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// DUBLIN BIKES ENDPOINTS
// ==========================================

/**
 * Get Dublin Bikes data from Firestore
 */
app.get('/api/firestore/dublin-bikes', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    const db = admin.firestore();
    const snapshot = await db.collection('dublin_bikes')
      .orderBy('fetched_at', 'desc')
      .limit(limit)
      .get();
    
    if (snapshot.empty) {
      return res.json({
        success: true,
        data: [],
        message: 'No bike data available yet'
      });
    }
    
    const bikeData = [];
    snapshot.forEach(doc => {
      bikeData.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json({
      success: true,
      data: bikeData,
      count: bikeData.length
    });
  } catch (error) {
    console.error('Firestore bikes error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get Dublin Bikes fetcher statistics
 */
app.get('/api/bikes/stats', (req, res) => {
  const stats = getDublinBikesStats();
  res.json({ success: true, stats });
});

/**
 * Manually trigger Dublin Bikes fetch
 */
app.post('/api/bikes/fetch', async (req, res) => {
  try {
    const { fetchDublinBikes } = require('./dublinBikesFetcher');
    const result = await fetchDublinBikes();
    res.json(result);
  } catch (error) {
    console.error('Manual bikes fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// LUAS ENDPOINTS
// ==========================================

/**
 * Get Luas fetcher statistics
 */
app.get('/api/luas/stats', (req, res) => {
  const stats = getLuasStats();
  res.json({ success: true, stats });
});

/**
 * Get nearest Luas stations
 */
app.get('/api/luas/nearest', async (req, res) => {
  try {
    const { lat, lng, limit } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude required'
      });
    }
    
    const result = await getNearestLuasStations(
      parseFloat(lat),
      parseFloat(lng),
      parseInt(limit) || 3
    );
    
    res.json(result);
  } catch (error) {
    console.error('Nearest Luas error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get all Luas real-time data
 */
app.get('/api/luas/realtime', async (req, res) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('luas_realtime')
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();
    
    if (snapshot.empty) {
      return res.json({
        success: true,
        stations: [],
        message: 'No Luas data available yet'
      });
    }
    
    const stations = [];
    const seen = new Set();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!seen.has(data.station_code)) {
        seen.add(data.station_code);
        stations.push(data);
      }
    });
    
    res.json({
      success: true,
      stations: stations
    });
  } catch (error) {
    console.error('Luas realtime error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Manually trigger Luas fetch
 */
app.post('/api/luas/fetch', async (req, res) => {
  try {
    const { fetchLuasData } = require('./luasFetcher');
    const result = await fetchLuasData();
    res.json(result);
  } catch (error) {
    console.error('Manual Luas fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

// ==========================================
// HEALTH CHECK ENDPOINT
// ==========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      firebase: '✅',
      dublinBikes: '✅',
      airQuality: '✅',
      luas: '✅',
      activityClassifier: '✅'
    }
  });
});

// ==========================================
// ERROR HANDLING
// ==========================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// ==========================================
// SERVER INITIALIZATION
// ==========================================

async function startServer() {
  try {
    console.log('🚀 Starting BreathEasy Dublin Backend...\n');
    
    // Initialize Firebase
    console.log('🔥 Initializing Firebase...');
    const db = admin.firestore();
    await db.collection('_health').doc('check').set({
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Firebase initialized\n');
    
    // Start Dublin Bikes fetcher
    console.log('🚴 Starting Dublin Bikes fetcher...');
    try {
      startDublinBikesFetcher();
      console.log('✅ Dublin Bikes fetcher started\n');
    } catch (error) {
      console.error('⚠️ Dublin Bikes fetcher failed:', error.message, '\n');
    }
    
    // Start Air Quality fetcher
    console.log('🌫️ Starting Air Quality fetcher...');
    try {
      startAirQualityFetcher();
      console.log('✅ Air Quality fetcher started\n');
    } catch (error) {
      console.error('⚠️ Air Quality fetcher failed:', error.message, '\n');
    }
    
    // Start Luas fetcher
    console.log('🚊 Starting Luas fetcher...');
    try {
      startLuasFetcher();
      console.log('✅ Luas fetcher started\n');
    } catch (error) {
      console.error('⚠️ Luas fetcher failed:', error.message, '\n');
    }
    
    // Log enabled features
    console.log('📋 Features enabled:');
    console.log('   🔐 Firebase Auth: Enabled');
    console.log('   🤖 Activity Classifier: Enabled');
    console.log('   💚 Health Score Calculator: Enabled');
    console.log('   📊 Session Analytics: Enabled');
    console.log('   👣 Step Counter: Enabled\n');
    
    // Start Express server
    app.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('🎉 BreathEasy Dublin is ready!\n');
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});