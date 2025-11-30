/**
 * Health Score Calculator
 * 
 * Calculates a 0-10 health score for exercise sessions based on:
 * - Distance covered
 * - Activity variety
 * - Air quality exposure
 * - Activity consistency
 */

/**
 * Calculate health score for a session
 * 
 * @param {Object} sessionData - Session summary data
 * @param {number} sessionData.distanceKm - Distance covered in km
 * @param {Object} sessionData.activities - Activity breakdown
 * @param {number} sessionData.durationMinutes - Duration in minutes
 * @param {Array} airQualityHistory - Array of AQI readings during session
 * @param {Object} userHistory - User's past session data (optional)
 * @returns {Object} - Health score and breakdown
 */
function calculateHealthScore(sessionData, airQualityHistory = [], userHistory = null) {
  const scores = {
    distance: 0,
    variety: 0,
    airQuality: 0,
    consistency: 0
  };
  
  const weights = {
    distance: 0.30,
    variety: 0.20,
    airQuality: 0.40,
    consistency: 0.10
  };
  
  // 1. Distance Score (0-10)
  scores.distance = calculateDistanceScore(
    sessionData.distanceKm,
    sessionData.durationMinutes
  );
  
  // 2. Activity Variety Score (0-10)
  scores.variety = calculateVarietyScore(sessionData.activities);
  
  // 3. Air Quality Score (0-10)
  scores.airQuality = calculateAirQualityScore(
    airQualityHistory,
    sessionData.activities
  );
  
  // 4. Consistency Score (0-10)
  if (userHistory) {
    scores.consistency = calculateConsistencyScore(userHistory);
  } else {
    scores.consistency = 5; // Default for first session
  }
  
  // Calculate weighted total
  const totalScore = (
    scores.distance * weights.distance +
    scores.variety * weights.variety +
    scores.airQuality * weights.airQuality +
    scores.consistency * weights.consistency
  );
  
  // Generate insights
  const insights = generateInsights(scores, sessionData, airQualityHistory);
  
  // Determine rating
  const rating = getRating(totalScore);
  
  return {
    totalScore: Math.round(totalScore * 10) / 10,
    breakdown: scores,
    weights: weights,
    rating: rating,
    insights: insights
  };
}

/**
 * Calculate distance score based on distance and duration
 */
function calculateDistanceScore(distanceKm, durationMinutes) {
  if (distanceKm <= 0) return 0;
  
  // Optimal distance depends on duration
  // Rough guide: 3-5 km in 30 min = good
  const distancePerMinute = distanceKm / durationMinutes;
  
  // Score ranges
  if (distanceKm >= 5) return 10; // Excellent
  if (distanceKm >= 3) return 8;  // Good
  if (distanceKm >= 2) return 6;  // Moderate
  if (distanceKm >= 1) return 4;  // Light
  return 2; // Minimal
}

/**
 * Calculate activity variety score
 * Higher score for mixed activities (better overall fitness)
 */
function calculateVarietyScore(activities) {
  const activityTypes = Object.keys(activities).filter(key => 
    key !== 'unknown' && parseFloat(activities[key].percentage) > 5
  );
  
  const numActivities = activityTypes.length;
  
  // Single activity
  if (numActivities === 1) {
    // Check if it's a good primary activity
    const primaryActivity = activityTypes[0];
    if (primaryActivity === 'walking' || primaryActivity === 'running') {
      return 7; // Good, but could be more varied
    }
    return 5;
  }
  
  // Two activities
  if (numActivities === 2) return 8;
  
  // Three or more activities
  if (numActivities >= 3) return 10;
  
  return 3; // Mostly unknown/standing
}

/**
 * Calculate air quality exposure score
 * Lower AQI = higher score
 * Activity intensity matters (running in bad air = worse)
 */
function calculateAirQualityScore(airQualityHistory, activities) {
  if (!airQualityHistory || airQualityHistory.length === 0) {
    return 5; // Default if no AQ data
  }
  
  // Calculate average AQI
  const avgAQI = airQualityHistory.reduce((sum, reading) => 
    sum + (reading.aqi || 0), 0
  ) / airQualityHistory.length;
  
  // Determine primary activity intensity multiplier
  let intensityMultiplier = 1.0;
  
  if (activities.running && parseFloat(activities.running.percentage) > 30) {
    intensityMultiplier = 1.5; // Running = more sensitive to air quality
  } else if (activities.cycling && parseFloat(activities.cycling.percentage) > 30) {
    intensityMultiplier = 1.3; // Cycling = moderately sensitive
  }
  
  // Adjust AQI for intensity
  const adjustedAQI = avgAQI * intensityMultiplier;
  
  // Score based on AQI
  if (adjustedAQI <= 50) return 10;  // Good
  if (adjustedAQI <= 100) return 7;  // Moderate
  if (adjustedAQI <= 150) return 4;  // Unhealthy for sensitive
  if (adjustedAQI <= 200) return 2;  // Unhealthy
  return 1; // Very unhealthy
}

/**
 * Calculate consistency score based on user history
 */
function calculateConsistencyScore(userHistory) {
  if (!userHistory || !userHistory.recentSessions) {
    return 5; // Default
  }
  
  const sessions = userHistory.recentSessions;
  
  // Sessions in last 7 days
  const weekCount = sessions.filter(s => {
    const daysSince = (Date.now() - s.timestamp) / (1000 * 60 * 60 * 24);
    return daysSince <= 7;
  }).length;
  
  // Scoring based on weekly frequency
  if (weekCount >= 5) return 10; // Excellent consistency
  if (weekCount >= 3) return 8;  // Good
  if (weekCount >= 2) return 6;  // Moderate
  if (weekCount >= 1) return 4;  // Light
  return 2; // Infrequent
}

/**
 * Generate insights based on scores
 */
function generateInsights(scores, sessionData, airQualityHistory) {
  const insights = [];
  
  // Distance insights
  if (scores.distance >= 8) {
    insights.push({
      type: 'positive',
      icon: '✅',
      message: 'Great distance covered for fitness!'
    });
  } else if (scores.distance < 5) {
    insights.push({
      type: 'suggestion',
      icon: '💡',
      message: 'Try increasing distance gradually for better fitness gains'
    });
  }
  
  // Activity variety insights
  if (scores.variety >= 8) {
    insights.push({
      type: 'positive',
      icon: '✅',
      message: 'Excellent activity variety - balanced workout!'
    });
  } else if (scores.variety < 6) {
    insights.push({
      type: 'suggestion',
      icon: '💡',
      message: 'Mix activities (walk + run + bike) for better overall fitness'
    });
  }
  
  // Air quality insights
  if (scores.airQuality >= 8) {
    insights.push({
      type: 'positive',
      icon: '✅',
      message: 'Good air quality during session - minimal pollution exposure'
    });
  } else if (scores.airQuality < 5) {
    if (sessionData.activities.running && parseFloat(sessionData.activities.running.percentage) > 30) {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        message: 'High pollution exposure while running - consider earlier/later times'
      });
    } else {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        message: 'Moderate pollution exposure - try exercising during off-peak hours'
      });
    }
  }
  
  // Consistency insights
  if (scores.consistency >= 8) {
    insights.push({
      type: 'positive',
      icon: '🔥',
      message: 'Excellent consistency - keep up the great routine!'
    });
  } else if (scores.consistency < 5) {
    insights.push({
      type: 'suggestion',
      icon: '💡',
      message: 'Aim for 3-5 sessions per week for best results'
    });
  }
  
  return insights;
}

/**
 * Get rating description
 */
function getRating(score) {
  if (score >= 9) return { stars: 5, label: 'Excellent', emoji: '⭐⭐⭐⭐⭐' };
  if (score >= 7.5) return { stars: 4, label: 'Very Good', emoji: '⭐⭐⭐⭐' };
  if (score >= 6) return { stars: 3, label: 'Good', emoji: '⭐⭐⭐' };
  if (score >= 4) return { stars: 2, label: 'Fair', emoji: '⭐⭐' };
  return { stars: 1, label: 'Needs Improvement', emoji: '⭐' };
}

module.exports = {
  calculateHealthScore,
  calculateDistanceScore,
  calculateVarietyScore,
  calculateAirQualityScore,
  calculateConsistencyScore,
  getRating
};