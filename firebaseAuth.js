/**
 * Firebase Authentication Module
 * Handles Google Sign-In and user session management
 */

const { admin } = require('./firebaseConfig');

/**
 * Verify Firebase ID token from client
 */
async function verifyAuthToken(idToken) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return {
      success: true,
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture
    };
  } catch (error) {
    console.error('Token verification error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create or update user profile in Firestore
 */
async function createOrUpdateUser(userData) {
  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userData.uid);
    
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      // New user - create profile
      await userRef.set({
        uid: userData.uid,
        email: userData.email,
        displayName: userData.name,
        photoURL: userData.picture,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        totalSessions: 0,
        totalDistance: 0,
        totalDuration: 0,
        preferences: {
          activityType: 'walking', // walking, running, cycling
          airQualitySensitivity: 'medium' // low, medium, high
        }
      });
      
      console.log(`✅ New user created: ${userData.email}`);
    } else {
      // Existing user - update last login
      await userRef.update({
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        displayName: userData.name,
        photoURL: userData.picture
      });
      
      console.log(`✅ User updated: ${userData.email}`);
    }
    
    return { success: true, uid: userData.uid };
    
  } catch (error) {
    console.error('Create/update user error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user profile
 */
async function getUserProfile(uid) {
  try {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      return { success: false, error: 'User not found' };
    }
    
    return {
      success: true,
      user: userDoc.data()
    };
    
  } catch (error) {
    console.error('Get user profile error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update user preferences
 */
async function updateUserPreferences(uid, preferences) {
  try {
    const db = admin.firestore();
    await db.collection('users').doc(uid).update({
      preferences: preferences,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true };
    
  } catch (error) {
    console.error('Update preferences error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user's session history
 */
async function getUserSessions(uid, limit = 20) {
  try {
    const db = admin.firestore();
    const sessionsSnapshot = await db.collection('users')
      .doc(uid)
      .collection('sessions')
      .orderBy('endTime', 'desc')
      .limit(limit)
      .get();
    
    const sessions = [];
    sessionsSnapshot.forEach(doc => {
      sessions.push({ id: doc.id, ...doc.data() });
    });
    
    return {
      success: true,
      sessions: sessions,
      count: sessions.length
    };
    
  } catch (error) {
    console.error('Get sessions error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Middleware to verify authentication
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'No authentication token provided'
    });
  }
  
  const idToken = authHeader.split('Bearer ')[1];
  
  verifyAuthToken(idToken)
    .then(result => {
      if (result.success) {
        req.user = result; // Attach user info to request
        next();
      } else {
        res.status(401).json({
          success: false,
          error: 'Invalid authentication token'
        });
      }
    })
    .catch(error => {
      res.status(401).json({
        success: false,
        error: 'Authentication failed'
      });
    });
}

module.exports = {
  verifyAuthToken,
  createOrUpdateUser,
  getUserProfile,
  updateUserPreferences,
  getUserSessions,
  requireAuth
};
