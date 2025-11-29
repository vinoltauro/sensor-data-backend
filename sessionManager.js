/**
 * Session Manager
 * 
 * Handles user sessions for tracking multiple walking sessions
 * Stores session metadata to Firebase
 */

const { getFirestore, admin } = require('./firebaseConfig');

/**
 * Create a new session
 */
async function createSession(userId, deviceInfo = {}) {
  try {
    const db = getFirestore();
    
    const sessionId = `walk_${Date.now()}`;
    const sessionData = {
      session_id: sessionId,
      user_id: userId,
      device_info: deviceInfo,
      start_time: admin.firestore.FieldValue.serverTimestamp(),
      end_time: null,
      status: 'active',
      total_points: 0,
      distance_meters: 0,
      duration_seconds: 0,
      avg_speed: 0,
      route_name: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('sessions').doc(sessionId).set(sessionData);
    
    console.log(`✅ Session created: ${sessionId} for user: ${userId}`);
    
    return {
      success: true,
      session_id: sessionId,
      user_id: userId,
      start_time: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Error creating session:', error);
    return { success: false, error: error.message };
  }
}

/**
 * End a session and calculate statistics
 */
async function endSession(sessionId, routeName = null, sensorDataPoints = []) {
  try {
    const db = getFirestore();
    const sessionRef = db.collection('sessions').doc(sessionId);
    
    // Get session data
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      return { success: false, error: 'Session not found' };
    }
    
    const sessionData = sessionDoc.data();
    
    // Calculate statistics from sensor data
    const stats = calculateSessionStats(sensorDataPoints);
    
    // Update session
    const updateData = {
      end_time: admin.firestore.FieldValue.serverTimestamp(),
      status: 'completed',
      total_points: sensorDataPoints.length,
      distance_meters: stats.distance,
      duration_seconds: stats.duration,
      avg_speed: stats.avgSpeed,
      max_speed: stats.maxSpeed,
      avg_accuracy: stats.avgAccuracy,
      route_name: routeName,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await sessionRef.update(updateData);
    
    console.log(`✅ Session ended: ${sessionId}`);
    console.log(`   Distance: ${(stats.distance / 1000).toFixed(2)} km`);
    console.log(`   Duration: ${(stats.duration / 60).toFixed(1)} mins`);
    console.log(`   Points: ${sensorDataPoints.length}`);
    
    return {
      success: true,
      session_id: sessionId,
      stats: {
        distance_km: (stats.distance / 1000).toFixed(2),
        duration_mins: (stats.duration / 60).toFixed(1),
        total_points: sensorDataPoints.length,
        avg_speed: stats.avgSpeed.toFixed(2)
      }
    };
    
  } catch (error) {
    console.error('Error ending session:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate session statistics from sensor data
 */
function calculateSessionStats(dataPoints) {
  if (!dataPoints || dataPoints.length === 0) {
    return {
      distance: 0,
      duration: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      avgAccuracy: 0
    };
  }
  
  // Sort by timestamp
  const sorted = [...dataPoints].sort((a, b) => a.timestamp - b.timestamp);
  
  // Calculate distance using Haversine formula
  let totalDistance = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    if (prev.latitude && prev.longitude && curr.latitude && curr.longitude) {
      const dist = haversineDistance(
        prev.latitude, prev.longitude,
        curr.latitude, curr.longitude
      );
      totalDistance += dist;
    }
  }
  
  // Calculate duration
  const startTime = sorted[0].timestamp;
  const endTime = sorted[sorted.length - 1].timestamp;
  const duration = (endTime - startTime) / 1000; // seconds
  
  // Calculate average speed
  const avgSpeed = duration > 0 ? totalDistance / duration : 0;
  
  // Calculate max speed
  const speeds = sorted.filter(p => p.speed).map(p => p.speed);
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
  
  // Calculate average accuracy
  const accuracies = sorted.filter(p => p.accuracy).map(p => p.accuracy);
  const avgAccuracy = accuracies.length > 0 
    ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length 
    : 0;
  
  return {
    distance: totalDistance,
    duration: duration,
    avgSpeed: avgSpeed,
    maxSpeed: maxSpeed,
    avgAccuracy: avgAccuracy
  };
}

/**
 * Haversine formula to calculate distance between two GPS coordinates
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c; // Distance in meters
}

/**
 * Get all sessions for a user
 */
async function getUserSessions(userId, limit = 50) {
  try {
    const db = getFirestore();
    
    const snapshot = await db.collection('sessions')
      .where('user_id', '==', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .get();
    
    const sessions = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      sessions.push({
        session_id: data.session_id,
        user_id: data.user_id,
        start_time: data.start_time?.toDate().toISOString(),
        end_time: data.end_time?.toDate().toISOString(),
        status: data.status,
        distance_km: (data.distance_meters / 1000).toFixed(2),
        duration_mins: (data.duration_seconds / 60).toFixed(1),
        total_points: data.total_points,
        avg_speed: data.avg_speed?.toFixed(2),
        route_name: data.route_name
      });
    });
    
    return { success: true, sessions, count: sessions.length };
    
  } catch (error) {
    console.error('Error getting user sessions:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get session details
 */
async function getSessionDetails(sessionId) {
  try {
    const db = getFirestore();
    
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      return { success: false, error: 'Session not found' };
    }
    
    const data = sessionDoc.data();
    
    return {
      success: true,
      session: {
        session_id: data.session_id,
        user_id: data.user_id,
        start_time: data.start_time?.toDate().toISOString(),
        end_time: data.end_time?.toDate().toISOString(),
        status: data.status,
        distance_meters: data.distance_meters,
        distance_km: (data.distance_meters / 1000).toFixed(2),
        duration_seconds: data.duration_seconds,
        duration_mins: (data.duration_seconds / 60).toFixed(1),
        total_points: data.total_points,
        avg_speed: data.avg_speed,
        max_speed: data.max_speed,
        avg_accuracy: data.avg_accuracy,
        route_name: data.route_name
      }
    };
    
  } catch (error) {
    console.error('Error getting session details:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get sensor data for a specific session
 */
async function getSessionData(sessionId, limit = 10000) {
  try {
    const db = getFirestore();
    
    const snapshot = await db.collection('sensor_data')
      .where('session_id', '==', sessionId)
      .orderBy('timestamp', 'asc')
      .limit(limit)
      .get();
    
    const data = [];
    snapshot.forEach(doc => {
      data.push(doc.data());
    });
    
    return { success: true, data, count: data.length };
    
  } catch (error) {
    console.error('Error getting session data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update session route name
 */
async function updateSessionName(sessionId, routeName) {
  try {
    const db = getFirestore();
    
    await db.collection('sessions').doc(sessionId).update({
      route_name: routeName,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true, message: 'Session name updated' };
    
  } catch (error) {
    console.error('Error updating session name:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  createSession,
  endSession,
  getUserSessions,
  getSessionDetails,
  getSessionData,
  updateSessionName,
  calculateSessionStats
};