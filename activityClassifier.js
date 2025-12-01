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
        magnitude: { min: 9.5, max: 10.5 },
        variance: { max: 0.4 },
        frequency: { max: 0.5 } // Hz
      },
      walking: {
        magnitude: { min: 8.5, max: 13.0 },
        variance: { min: 0.6, max: 6.0 },
        frequency: { min: 1.2, max: 2.5 }, // ~2 Hz (120 steps/min)
        speed: { min: 0.5, max: 2.5 } // m/s
      },
      running: {
        magnitude: { min: 10.0, max: 25.0 },
        variance: { min: 5.0, max: 20.0 },
        frequency: { min: 2.3, max: 5.0 }, // ~3 Hz (180 steps/min)
        speed: { min: 2.5, max: 10.0 } // m/s
      },
      cycling: {
        magnitude: { min: 9.0, max: 11.0 },
        variance: { min: 0.2, max: 2.0 },
        frequency: { min: 0.5, max: 2.0 },
        speed: { min: 3.5, max: 15.0 } // m/s
      },
      vehicle: {
        // Realistic: Very smooth magnitude (suspension) but high speed
        magnitude: { min: 9.0, max: 11.0 },
        variance: { max: 2.0 },
        speed: { min: 8.0 } // > ~30 km/h
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
  /**
    * Estimate dominant frequency using simple peak detection
    */
  estimateFrequency(magnitudes) {
    if (magnitudes.length < 10) return 0;

    // [NEW] Calculate dynamic threshold
    // Peaks must be above the mean AND above 10.5 (gravity + noise margin)
    // This prevents "Standing" jitter from counting as steps.
    const avgMag = this.mean(magnitudes);
    const minPeakHeight = Math.max(avgMag, 10.5);

    // Find peaks (local maxima)
    const peaks = [];
    for (let i = 1; i < magnitudes.length - 1; i++) {
      if (magnitudes[i] > magnitudes[i - 1] &&
        magnitudes[i] > magnitudes[i + 1] &&
        magnitudes[i] > minPeakHeight) { // [NEW] Check height
        peaks.push(i);
      }
    }

    if (peaks.length < 2) return 0;

    // Calculate average time between peaks
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i - 1]);
    }

    const avgInterval = this.mean(intervals);
    const samplingRate = 10; // Hz (Correct for your frontend)

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
/**
 * Process sensor data batch and add activity classifications
 */
function classifyDataBatch(dataPoints) {
  const classifier = new ActivityClassifier();
  const windowSize = 10;

  // [NEW] Pre-process: Smooth data using Simple Moving Average (SMA)
  // This removes high-frequency noise/spikes while keeping the motion trend.
  const smoothedData = dataPoints.map((point, i, arr) => {
    // Skip edges
    if (i < 2 || i > arr.length - 3) return point;

    // Average magnitude of current point + 2 neighbors on each side
    const avgMag = (
      (arr[i - 2].accel_magnitude || 0) +
      (arr[i - 1].accel_magnitude || 0) +
      (point.accel_magnitude || 0) +
      (arr[i + 1].accel_magnitude || 0) +
      (arr[i + 2].accel_magnitude || 0)
    ) / 5;

    return { ...point, accel_magnitude: avgMag };
  });

  const results = [];

  for (let i = 0; i < smoothedData.length; i++) {
    // Get window of data around current point (using SMOOTHED data)
    const windowStart = Math.max(0, i - Math.floor(windowSize / 2));
    const windowEnd = Math.min(smoothedData.length, i + Math.ceil(windowSize / 2));
    const window = smoothedData.slice(windowStart, windowEnd);

    // Classify activity
    const classification = classifier.classifyActivity(window);

    results.push({
      ...dataPoints[i], // Keep original raw values for record
      activity: classification.activity,
      activity_confidence: classification.confidence,
      health_impact: classification.healthImpact,
      air_quality_sensitivity: classification.airQualitySensitivity
    });
  }

  return results;
}

/**
 * Count steps from accelerometer data
 */
function countSteps(dataPoints) {
  if (!dataPoints || dataPoints.length < 10) return 0;

  let steps = 0;
  let lastPeakTime = 0;

  // Thresholds
  const peakThreshold = 10.5; // m/s² - minimum magnitude to be a step
  const minTimeBetweenSteps = 300; // ms - max ~200 steps/min

  for (let i = 2; i < dataPoints.length - 2; i++) {
    const current = dataPoints[i].accel_magnitude || 0;
    const prev = dataPoints[i - 1].accel_magnitude || 0;
    const next = dataPoints[i + 1].accel_magnitude || 0;
    const currentTime = dataPoints[i].timestamp;

    // Detect peak: current is local maximum and above threshold
    if (current > peakThreshold &&
      current > prev &&
      current > next &&
      (currentTime - lastPeakTime) > minTimeBetweenSteps) {

      // Additional validation: check if it's a sharp peak
      const prev2 = dataPoints[i - 2].accel_magnitude || 0;
      const next2 = dataPoints[i + 2].accel_magnitude || 0;

      if (current > prev2 && current > next2) {
        steps++;
        lastPeakTime = currentTime;
      }
    }
  }

  return steps;
}

/**
 * Calculate pace (min/km) from distance and duration
 */
function calculatePace(distanceKm, durationSeconds) {
  if (distanceKm <= 0 || durationSeconds <= 0) return null;

  const paceMinPerKm = (durationSeconds / 60) / distanceKm;
  const minutes = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - minutes) * 60);

  return {
    value: paceMinPerKm,
    display: `${minutes}:${seconds.toString().padStart(2, '0')}`
  };
}

/**
 * Estimate calories burned
 */
function estimateCalories(steps, distanceKm, durationMinutes, userWeight = 70) {
  // Multiple methods, use average

  // Method 1: Based on steps
  const caloriesFromSteps = steps * 0.04 * (userWeight / 70);

  // Method 2: Based on distance
  const caloriesFromDistance = distanceKm * userWeight * 0.75;

  // Method 3: Based on MET (Metabolic Equivalent)
  // Walking ~3.5 MET, Running ~8 MET
  const avgMET = 5; // Mixed activity
  const caloriesFromMET = (avgMET * userWeight * durationMinutes) / 60;

  // Average of all methods
  return Math.round((caloriesFromSteps + caloriesFromDistance + caloriesFromMET) / 3);
}

/**
 * Summarize activities for a session
 */
/**
 * Summarize activities for a session
 */
function summarizeSession(dataPoints, distanceKm = 0) {
  const activityCounts = {};
  let totalPoints = dataPoints.length;

  if (totalPoints === 0) {
    return {
      summary: {},
      primaryActivity: 'unknown',
      totalDataPoints: 0,
      totalDuration: 0,
      totalDurationMinutes: "0.0",
      steps: 0,
      pace: null,
      calories: 0,
      distanceKm: distanceKm
    };
  }

  // Count activities
  dataPoints.forEach(point => {
    const activity = point.activity || 'unknown';
    activityCounts[activity] = (activityCounts[activity] || 0) + 1;
  });

  // [FIX] Calculate REAL duration from timestamps
  let totalDuration = 0;
  if (totalPoints > 1) {
    // Sort just in case, to ensure we get true start/end
    const sortedPoints = [...dataPoints].sort((a, b) => a.timestamp - b.timestamp);
    const startTime = sortedPoints[0].timestamp;
    const endTime = sortedPoints[sortedPoints.length - 1].timestamp;
    totalDuration = (endTime - startTime) / 1000; // Convert ms to seconds
  }

  // [FIX] Calculate dynamic sampling interval based on actual data
  // This allows the math to work for ANY sampling rate (1Hz, 10Hz, etc.)
  const samplingInterval = totalDuration > 0 ? totalDuration / totalPoints : 0;

  const summary = {};

  for (const [activity, count] of Object.entries(activityCounts)) {
    const percentage = (count / totalPoints) * 100;
    const duration = count * samplingInterval; // Distribute time proportionally

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

  // Count steps
  const steps = countSteps(dataPoints);

  // Calculate total duration in minutes
  const totalDurationMinutes = (totalDuration / 60);

  // Calculate pace if we have distance
  const pace = distanceKm > 0 ? calculatePace(distanceKm, totalDuration) : null;

  // Estimate calories
  const calories = estimateCalories(steps, distanceKm, totalDurationMinutes);

  return {
    summary: summary,
    primaryActivity: primaryActivity ? primaryActivity[0] : 'unknown',
    totalDataPoints: totalPoints,
    totalDuration: Math.round(totalDuration),
    totalDurationMinutes: totalDurationMinutes.toFixed(1),
    steps: steps,
    pace: pace,
    calories: calories,
    distanceKm: distanceKm
  };
}

module.exports = {
  ActivityClassifier,
  classifyDataBatch,
  summarizeSession,
  countSteps,
  calculatePace,
  estimateCalories
};