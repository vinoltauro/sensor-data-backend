/**
 * Activity Classification Module
 * 
 * Analyzes accelerometer data to classify user activity:
 * - Standing/Stationary
 * - Walking
 * - Running
 * - Cycling (with GPS speed validation)
 * - In Vehicle (using GPS speed)
 */

/**
 * Activity classification based on accelerometer patterns
 */
class ActivityClassifier {
  constructor() {
    // Thresholds calibrated for typical activities
    this.thresholds = {
      standing: {
        magnitude: { min: 9.0, max: 10.5 },
        variance: { max: 0.5 },
        frequency: { max: 0.5 } // Hz
      },
      walking: {
        magnitude: { min: 8.0, max: 13.0 },
        variance: { min: 0.5, max: 3.0 },
        frequency: { min: 1.5, max: 2.5 }, // ~2 Hz (120 steps/min)
        speed: { min: 0.5, max: 2.5 } // m/s
      },
      running: {
        magnitude: { min: 10.0, max: 20.0 },
        variance: { min: 3.0, max: 10.0 },
        frequency: { min: 2.5, max: 4.0 }, // ~3 Hz (180 steps/min)
        speed: { min: 2.5, max: 6.0 } // m/s
      },
      cycling: {
        magnitude: { min: 8.5, max: 11.0 },
        variance: { min: 0.3, max: 2.0 },
        frequency: { min: 0.5, max: 2.0 },
        speed: { min: 3.0, max: 10.0 } // m/s
      },
      vehicle: {
        speed: { min: 8.0 } // m/s (~30 km/h)
      }
    };
  }

  /**
   * Classify activity from a window of sensor data
   * @param {Array} dataWindow - Array of data points with accel_magnitude and speed
   * @returns {Object} - Classification result
   */
  classifyActivity(dataWindow) {
    if (!dataWindow || dataWindow.length < 5) {
      return {
        activity: 'unknown',
        confidence: 0,
        metrics: {}
      };
    }

    // Calculate metrics from the data window
    const metrics = this.calculateMetrics(dataWindow);
    
    // Classify based on metrics
    const classification = this.determineActivity(metrics);
    
    return {
      activity: classification.activity,
      confidence: classification.confidence,
      metrics: metrics,
      healthImpact: this.getHealthImpact(classification.activity),
      airQualitySensitivity: this.getAirQualitySensitivity(classification.activity)
    };
  }

  /**
   * Calculate statistical metrics from data window
   */
  calculateMetrics(dataWindow) {
    const magnitudes = dataWindow.map(d => d.accel_magnitude || 0);
    const speeds = dataWindow.map(d => d.speed || 0);
    
    return {
      magnitude: {
        mean: this.mean(magnitudes),
        variance: this.variance(magnitudes),
        min: Math.min(...magnitudes),
        max: Math.max(...magnitudes)
      },
      speed: {
        mean: this.mean(speeds),
        max: Math.max(...speeds)
      },
      frequency: this.estimateFrequency(magnitudes),
      dataPoints: dataWindow.length
    };
  }

  /**
   * Estimate dominant frequency using simple peak detection
   */
  estimateFrequency(magnitudes) {
    if (magnitudes.length < 10) return 0;
    
    // Find peaks (local maxima)
    const peaks = [];
    for (let i = 1; i < magnitudes.length - 1; i++) {
      if (magnitudes[i] > magnitudes[i-1] && magnitudes[i] > magnitudes[i+1]) {
        peaks.push(i);
      }
    }
    
    if (peaks.length < 2) return 0;
    
    // Calculate average time between peaks
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i-1]);
    }
    
    const avgInterval = this.mean(intervals);
    const samplingRate = 1.72; // Hz (from your data collection)
    
    // Frequency = samplingRate / avgInterval
    return avgInterval > 0 ? samplingRate / avgInterval : 0;
  }

  /**
   * Determine activity based on metrics
   */
  determineActivity(metrics) {
    const scores = {
      standing: 0,
      walking: 0,
      running: 0,
      cycling: 0,
      vehicle: 0
    };

    // Vehicle detection (highest priority - based on speed)
    if (metrics.speed.mean >= this.thresholds.vehicle.speed.min) {
      return { activity: 'vehicle', confidence: 0.95 };
    }

    // Standing detection
    if (this.isInRange(metrics.magnitude.mean, this.thresholds.standing.magnitude) &&
        metrics.magnitude.variance <= this.thresholds.standing.variance.max &&
        metrics.frequency <= this.thresholds.standing.frequency.max) {
      scores.standing = 0.9;
    }

    // Walking detection
    if (this.isInRange(metrics.magnitude.mean, this.thresholds.walking.magnitude) &&
        this.isInRange(metrics.magnitude.variance, this.thresholds.walking.variance) &&
        this.isInRange(metrics.frequency, this.thresholds.walking.frequency)) {
      scores.walking = 0.85;
      
      // Boost score if speed matches
      if (this.isInRange(metrics.speed.mean, this.thresholds.walking.speed)) {
        scores.walking += 0.1;
      }
    }

    // Running detection
    if (this.isInRange(metrics.magnitude.mean, this.thresholds.running.magnitude) &&
        this.isInRange(metrics.magnitude.variance, this.thresholds.running.variance) &&
        this.isInRange(metrics.frequency, this.thresholds.running.frequency)) {
      scores.running = 0.85;
      
      // Boost score if speed matches
      if (this.isInRange(metrics.speed.mean, this.thresholds.running.speed)) {
        scores.running += 0.1;
      }
    }

    // Cycling detection
    if (this.isInRange(metrics.magnitude.mean, this.thresholds.cycling.magnitude) &&
        this.isInRange(metrics.magnitude.variance, this.thresholds.cycling.variance) &&
        this.isInRange(metrics.speed.mean, this.thresholds.cycling.speed)) {
      scores.cycling = 0.8;
    }

    // Find activity with highest score
    let bestActivity = 'unknown';
    let bestScore = 0.5; // Minimum confidence threshold
    
    for (const [activity, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestActivity = activity;
      }
    }

    return {
      activity: bestActivity,
      confidence: Math.min(bestScore, 0.99)
    };
  }

  /**
   * Get health impact multiplier for activity
   * Higher values = more oxygen consumption = more pollution exposure
   */
  getHealthImpact(activity) {
    const impacts = {
      standing: 1.0,
      walking: 1.5,
      cycling: 2.0,
      running: 3.0,
      vehicle: 0.5, // Inside vehicle, some protection
      unknown: 1.0
    };
    
    return impacts[activity] || 1.0;
  }

  /**
   * Get air quality sensitivity for activity
   * Higher = more sensitive to poor air quality
   */
  getAirQualitySensitivity(activity) {
    const sensitivity = {
      standing: 'low',
      walking: 'medium',
      cycling: 'high',
      running: 'very_high',
      vehicle: 'low',
      unknown: 'medium'
    };
    
    return sensitivity[activity] || 'medium';
  }

  /**
   * Helper: Check if value is in range
   */
  isInRange(value, range) {
    if (!range) return true;
    if (range.min !== undefined && value < range.min) return false;
    if (range.max !== undefined && value > range.max) return false;
    return true;
  }

  /**
   * Helper: Calculate mean
   */
  mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Helper: Calculate variance
   */
  variance(values) {
    if (values.length === 0) return 0;
    const m = this.mean(values);
    return values.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / values.length;
  }
}

/**
 * Process sensor data batch and add activity classifications
 */
function classifyDataBatch(dataPoints) {
  const classifier = new ActivityClassifier();
  const windowSize = 10; // Classify based on 10-point windows
  const results = [];
  
  for (let i = 0; i < dataPoints.length; i++) {
    // Get window of data around current point
    const windowStart = Math.max(0, i - Math.floor(windowSize / 2));
    const windowEnd = Math.min(dataPoints.length, i + Math.ceil(windowSize / 2));
    const window = dataPoints.slice(windowStart, windowEnd);
    
    // Classify activity
    const classification = classifier.classifyActivity(window);
    
    // Add classification to data point
    results.push({
      ...dataPoints[i],
      activity: classification.activity,
      activity_confidence: classification.confidence,
      health_impact: classification.healthImpact,
      air_quality_sensitivity: classification.airQualitySensitivity
    });
  }
  
  return results;
}

/**
 * Summarize activities for a session
 */
function summarizeSession(dataPoints) {
  const activityCounts = {};
  const activityDurations = {};
  let totalPoints = dataPoints.length;
  
  dataPoints.forEach(point => {
    const activity = point.activity || 'unknown';
    activityCounts[activity] = (activityCounts[activity] || 0) + 1;
  });
  
  // Calculate percentages and durations (assuming ~1.72 Hz sampling)
  const samplingInterval = 1 / 1.72; // seconds
  const summary = {};
  
  for (const [activity, count] of Object.entries(activityCounts)) {
    const percentage = (count / totalPoints) * 100;
    const duration = count * samplingInterval; // seconds
    
    summary[activity] = {
      count: count,
      percentage: percentage.toFixed(1),
      duration: Math.round(duration),
      durationMinutes: (duration / 60).toFixed(1)
    };
  }
  
  // Determine primary activity
  const primaryActivity = Object.entries(activityCounts)
    .sort((a, b) => b[1] - a[1])[0];
  
  return {
    summary: summary,
    primaryActivity: primaryActivity ? primaryActivity[0] : 'unknown',
    totalDataPoints: totalPoints,
    totalDuration: Math.round(totalPoints * samplingInterval),
    totalDurationMinutes: ((totalPoints * samplingInterval) / 60).toFixed(1)
  };
}

module.exports = {
  ActivityClassifier,
  classifyDataBatch,
  summarizeSession
};
