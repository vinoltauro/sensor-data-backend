/**
 * Air Quality Data Fetcher
 * 
 * Fetches real-time air quality data for Dublin from EPA Ireland
 * Runs every 15 minutes and stores to Firebase Firestore
 * 
 * API: https://www.epa.ie/our-services/monitoring--assessment/assessment/air-quality/
 */

const cron = require('node-cron');
const { admin } = require('./firebaseConfig');

// EPA Ireland Air Quality API
const EPA_API_BASE = 'https://airquality.ie/assets/php/get-monitor-results.php';

// Dublin monitoring stations with coordinates
const DUBLIN_STATIONS = [
  { id: 'D08001', name: 'Rathmines', lat: 53.3214, lng: -6.2658 },
  { id: 'D08002', name: 'Ballyfermot', lat: 53.3392, lng: -6.3589 },
  { id: 'D08003', name: 'Phoenix Park', lat: 53.3607, lng: -6.3289 },
  { id: 'D08004', name: 'Dun Laoghaire', lat: 53.2943, lng: -6.1389 },
  { id: 'D08005', name: 'Blanchardstown', lat: 53.3892, lng: -6.3764 }
];

// Air Quality Index thresholds (μg/m³)
const AQI_THRESHOLDS = {
  PM2_5: {
    good: 10,
    moderate: 20,
    unhealthySensitive: 25,
    unhealthy: 50,
    veryUnhealthy: 75,
    hazardous: 100
  },
  PM10: {
    good: 20,
    moderate: 40,
    unhealthySensitive: 50,
    unhealthy: 100,
    veryUnhealthy: 150,
    hazardous: 200
  },
  NO2: {
    good: 40,
    moderate: 80,
    unhealthySensitive: 100,
    unhealthy: 200,
    veryUnhealthy: 300,
    hazardous: 400
  }
};

let fetchCount = 0;
let lastFetchTime = null;
let lastFetchStatus = 'Not started';

/**
 * Calculate Air Quality Index category
 */
function calculateAQI(pollutant, value) {
  const thresholds = AQI_THRESHOLDS[pollutant];
  if (!thresholds || value === null || value === undefined) {
    return { category: 'unknown', index: 0, color: '#999999' };
  }
  
  let category, index, color, healthMessage;
  
  if (value <= thresholds.good) {
    category = 'good';
    index = Math.round((value / thresholds.good) * 50);
    color = '#00E400';
    healthMessage = 'Air quality is satisfactory';
  } else if (value <= thresholds.moderate) {
    category = 'moderate';
    index = 50 + Math.round(((value - thresholds.good) / (thresholds.moderate - thresholds.good)) * 50);
    color = '#FFFF00';
    healthMessage = 'Acceptable for most people';
  } else if (value <= thresholds.unhealthySensitive) {
    category = 'unhealthy_sensitive';
    index = 100 + Math.round(((value - thresholds.moderate) / (thresholds.unhealthySensitive - thresholds.moderate)) * 50);
    color = '#FF7E00';
    healthMessage = 'Sensitive groups should reduce outdoor activity';
  } else if (value <= thresholds.unhealthy) {
    category = 'unhealthy';
    index = 150 + Math.round(((value - thresholds.unhealthySensitive) / (thresholds.unhealthy - thresholds.unhealthySensitive)) * 50);
    color = '#FF0000';
    healthMessage = 'Everyone should reduce outdoor activity';
  } else if (value <= thresholds.veryUnhealthy) {
    category = 'very_unhealthy';
    index = 200 + Math.round(((value - thresholds.unhealthy) / (thresholds.veryUnhealthy - thresholds.unhealthy)) * 100);
    color = '#8F3F97';
    healthMessage = 'Health alert - avoid outdoor activity';
  } else {
    category = 'hazardous';
    index = 300 + Math.round(((value - thresholds.veryUnhealthy) / (thresholds.hazardous - thresholds.veryUnhealthy)) * 200);
    color = '#7E0023';
    healthMessage = 'Health warning - stay indoors';
  }
  
  return { category, index, color, healthMessage };
}

/**
 * Fetch air quality data from EPA Ireland
 * Note: This is a mock implementation since EPA Ireland's API structure may vary
 * You'll need to adjust based on actual API response format
 */
async function fetchAirQualityData() {
  try {
    console.log('🌫️ Fetching air quality data...');
    
    const allStationData = [];
    
    // For now, we'll use mock data since EPA API access may require specific setup
    // Replace this with actual API calls when you have EPA API access
    
    for (const station of DUBLIN_STATIONS) {
      // MOCK DATA - Replace with actual API call
      const mockData = {
        station_id: station.id,
        station_name: station.name,
        position: {
          lat: station.lat,
          lng: station.lng
        },
        timestamp: new Date(),
        pollutants: {
          PM2_5: {
            value: Math.random() * 30, // Mock value 0-30 μg/m³
            unit: 'μg/m³'
          },
          PM10: {
            value: Math.random() * 50, // Mock value 0-50 μg/m³
            unit: 'μg/m³'
          },
          NO2: {
            value: Math.random() * 100, // Mock value 0-100 μg/m³
            unit: 'μg/m³'
          }
        }
      };
      
      /* ACTUAL API CALL TEMPLATE (uncomment and modify when ready):
      try {
        const response = await fetch(`${EPA_API_BASE}?station=${station.id}`);
        const data = await response.json();
        
        const stationData = {
          station_id: station.id,
          station_name: station.name,
          position: { lat: station.lat, lng: station.lng },
          timestamp: new Date(data.timestamp),
          pollutants: {
            PM2_5: { value: data.pm25, unit: 'μg/m³' },
            PM10: { value: data.pm10, unit: 'μg/m³' },
            NO2: { value: data.no2, unit: 'μg/m³' }
          }
        };
        
        allStationData.push(stationData);
      } catch (error) {
        console.error(`Error fetching station ${station.id}:`, error);
      }
      */
      
      // Calculate AQI for each pollutant
      const pm25_aqi = calculateAQI('PM2_5', mockData.pollutants.PM2_5.value);
      const pm10_aqi = calculateAQI('PM10', mockData.pollutants.PM10.value);
      const no2_aqi = calculateAQI('NO2', mockData.pollutants.NO2.value);
      
      // Overall AQI is the worst (highest) of all pollutants
      const overallAQI = Math.max(pm25_aqi.index, pm10_aqi.index, no2_aqi.index);
      const worstPollutant = [
        { name: 'PM2.5', aqi: pm25_aqi },
        { name: 'PM10', aqi: pm10_aqi },
        { name: 'NO2', aqi: no2_aqi }
      ].reduce((worst, current) => 
        current.aqi.index > worst.aqi.index ? current : worst
      );
      
      const enrichedData = {
        ...mockData,
        aqi: {
          overall: overallAQI,
          category: worstPollutant.aqi.category,
          color: worstPollutant.aqi.color,
          healthMessage: worstPollutant.aqi.healthMessage,
          primaryPollutant: worstPollutant.name
        },
        pollutant_details: {
          PM2_5: { ...mockData.pollutants.PM2_5, aqi: pm25_aqi },
          PM10: { ...mockData.pollutants.PM10, aqi: pm10_aqi },
          NO2: { ...mockData.pollutants.NO2, aqi: no2_aqi }
        }
      };
      
      allStationData.push(enrichedData);
    }
    
    console.log(`📊 Fetched air quality for ${allStationData.length} stations`);
    
    // Save to Firestore
    const result = await saveAirQualityData(allStationData);
    
    if (result.success) {
      fetchCount++;
      lastFetchTime = new Date().toISOString();
      lastFetchStatus = `Success: ${allStationData.length} stations`;
      
      console.log(`✅ Air quality data saved (Fetch #${fetchCount})`);
      
      return {
        success: true,
        stationsCount: allStationData.length,
        fetchCount: fetchCount
      };
    } else {
      lastFetchStatus = `Error: ${result.error}`;
      return result;
    }
    
  } catch (error) {
    console.error('❌ Error fetching air quality:', error.message);
    lastFetchStatus = `Error: ${error.message}`;
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Save air quality data to Firestore
 */
async function saveAirQualityData(stationsData) {
  try {
    const db = admin.firestore();
    const batch = db.batch();
    
    const timestamp = new Date();
    
    stationsData.forEach(station => {
      const docRef = db.collection('air_quality').doc();
      batch.set(docRef, {
        ...station,
        fetched_at: admin.firestore.Timestamp.fromDate(timestamp),
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
    
    console.log(`✅ Saved ${stationsData.length} air quality readings to Firestore`);
    
    return {
      success: true,
      stationsAdded: stationsData.length,
      timestamp: timestamp.toISOString()
    };
    
  } catch (error) {
    console.error('Error saving air quality data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get current air quality for a location (nearest station)
 */
async function getAirQualityForLocation(lat, lng) {
  try {
    const db = admin.firestore();
    
    // Get most recent readings from all stations
    const snapshot = await db.collection('air_quality')
      .orderBy('created_at', 'desc')
      .limit(10)
      .get();
    
    if (snapshot.empty) {
      return { success: false, error: 'No air quality data available' };
    }
    
    // Find nearest station using Haversine formula
    let nearestStation = null;
    let minDistance = Infinity;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const distance = calculateDistance(
        lat, lng,
        data.position.lat, data.position.lng
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestStation = { id: doc.id, ...data, distance };
      }
    });
    
    return {
      success: true,
      station: nearestStation,
      distance: minDistance
    };
    
  } catch (error) {
    console.error('Error getting air quality:', error);
    return { success: false, error: error.message };
  }
}

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

/**
 * Start air quality fetcher with cron schedule
 */
function startAirQualityFetcher() {
  console.log('🕐 Starting Air Quality fetcher...');
  console.log('📅 Schedule: Every 15 minutes');
  
  // Fetch immediately on start
  fetchAirQualityData()
    .then(result => {
      if (result.success) {
        console.log('✅ Initial air quality fetch completed');
      } else {
        console.log('⚠️ Initial fetch failed:', result.error);
      }
    });
  
  // Schedule to run every 15 minutes
  const task = cron.schedule('*/15 * * * *', async () => {
    console.log('\n⏰ Scheduled air quality fetch at', new Date().toISOString());
    await fetchAirQualityData();
  });
  
  console.log('✅ Air Quality fetcher started');
  return task;
}

/**
 * Get fetcher statistics
 */
function getAirQualityStats() {
  return {
    fetchCount,
    lastFetchTime,
    lastFetchStatus,
    isRunning: true,
    schedule: 'Every 15 minutes',
    stations: DUBLIN_STATIONS.length
  };
}

module.exports = {
  startAirQualityFetcher,
  fetchAirQualityData,
  getAirQualityForLocation,
  getAirQualityStats,
  calculateAQI,
  DUBLIN_STATIONS
};
