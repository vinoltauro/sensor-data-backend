/**
 * Air Quality Data Fetcher
 * * Fetches real-time air quality data for Dublin from WAQI (World Air Quality Index)
 * Runs every 15 minutes and stores to Firebase Firestore
 * * API: https://aqicn.org/api/
 */

const cron = require('node-cron');
const axios = require('axios');
const { admin } = require('./firebaseConfig');

// WAQI API Configuration
const WAQI_TOKEN = '06b6b999608005535d5fad4dcc111b697ebc9c0e'; // User provided token
const WAQI_API_BASE = 'https://api.waqi.info/feed';

// Dublin monitoring stations with coordinates
const DUBLIN_STATIONS = [
  { id: 'D08001', name: 'Rathmines', lat: 53.3214, lng: -6.2658 },
  { id: 'D08002', name: 'Ballyfermot', lat: 53.3392, lng: -6.3589 },
  { id: 'D08003', name: 'Phoenix Park', lat: 53.3607, lng: -6.3289 },
  { id: 'D08004', name: 'Dun Laoghaire', lat: 53.2943, lng: -6.1389 },
  { id: 'D08005', name: 'Blanchardstown', lat: 53.3892, lng: -6.3764 }
];

// Air Quality Index thresholds (Standard US EPA)
const AQI_THRESHOLDS = {
  good: 50,
  moderate: 100,
  unhealthySensitive: 150,
  unhealthy: 200,
  veryUnhealthy: 300,
  hazardous: 500
};

let fetchCount = 0;
let lastFetchTime = null;
let lastFetchStatus = 'Not started';

/**
 * Helper: Get AQI Category and Color based on value
 */
function getAQIDetails(value) {
  if (value === null || value === undefined) {
    return { category: 'unknown', color: '#999999', message: 'Data unavailable' };
  }
  
  if (value <= AQI_THRESHOLDS.good) {
    return { 
      category: 'good', 
      color: '#00E400', 
      message: 'Air quality is satisfactory' 
    };
  } else if (value <= AQI_THRESHOLDS.moderate) {
    return { 
      category: 'moderate', 
      color: '#FFFF00', 
      message: 'Acceptable for most people' 
    };
  } else if (value <= AQI_THRESHOLDS.unhealthySensitive) {
    return { 
      category: 'unhealthy_sensitive', 
      color: '#FF7E00', 
      message: 'Sensitive groups should reduce outdoor activity' 
    };
  } else if (value <= AQI_THRESHOLDS.unhealthy) {
    return { 
      category: 'unhealthy', 
      color: '#FF0000', 
      message: 'Everyone should reduce outdoor activity' 
    };
  } else if (value <= AQI_THRESHOLDS.veryUnhealthy) {
    return { 
      category: 'very_unhealthy', 
      color: '#8F3F97', 
      message: 'Health alert - avoid outdoor activity' 
    };
  } else {
    return { 
      category: 'hazardous', 
      color: '#7E0023', 
      message: 'Health warning - stay indoors' 
    };
  }
}

/**
 * Fetch air quality data from WAQI API
 */
async function fetchAirQualityData() {
  try {
    console.log('🌫️ Fetching REAL air quality data from WAQI...');
    
    const allStationData = [];
    
    for (const station of DUBLIN_STATIONS) {
      try {
        // Fetch by geo-location
        const url = `${WAQI_API_BASE}/geo:${station.lat};${station.lng}/?token=${WAQI_TOKEN}`;
        const response = await axios.get(url);
        
        if (response.data.status === 'ok') {
          const data = response.data.data;
          const iaqi = data.iaqi || {};

          // Extract individual pollutants if available
          const pm25 = iaqi.pm25 ? iaqi.pm25.v : null;
          const pm10 = iaqi.pm10 ? iaqi.pm10.v : null;
          const no2 = iaqi.no2 ? iaqi.no2.v : null;
          
          // Get main AQI details
          const aqiDetails = getAQIDetails(data.aqi);

          const stationData = {
            station_id: station.id,
            station_name: station.name,
            api_station_name: data.city.name, // Name returned by API
            position: {
              lat: station.lat,
              lng: station.lng
            },
            timestamp: new Date(),
            last_update: data.time.s, // Time from the station
            
            // Main AQI Score
            aqi: {
              overall: data.aqi,
              category: aqiDetails.category,
              color: aqiDetails.color,
              healthMessage: aqiDetails.message,
              primaryPollutant: data.dominentpol
            },
            
            // Detailed pollutants
            pollutants: {
              PM2_5: { value: pm25, unit: 'μg/m³' },
              PM10: { value: pm10, unit: 'μg/m³' },
              NO2: { value: no2, unit: 'μg/m³' }
            }
          };
          
          allStationData.push(stationData);
          console.log(`   ✅ Fetched ${station.name}: AQI ${data.aqi}`);
        } else {
          console.warn(`   ⚠️ WAQI error for ${station.name}:`, response.data.data);
        }
      } catch (err) {
        console.error(`   ❌ Failed to fetch ${station.name}:`, err.message);
      }
    }
    
    console.log(`📊 Processed ${allStationData.length}/${DUBLIN_STATIONS.length} stations`);
    
    if (allStationData.length > 0) {
      // Save to Firestore
      const result = await saveAirQualityData(allStationData);
      
      fetchCount++;
      lastFetchTime = new Date().toISOString();
      lastFetchStatus = `Success: ${allStationData.length} stations`;
      
      return {
        success: true,
        stationsCount: allStationData.length,
        fetchCount: fetchCount
      };
    } else {
      return { success: false, error: 'No data fetched' };
    }
    
  } catch (error) {
    console.error('❌ Global fetch error:', error.message);
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
      // 1. Add to history collection (for graphing later)
      const historyRef = db.collection('air_quality_history').doc();
      batch.set(historyRef, {
        ...station,
        fetched_at: admin.firestore.Timestamp.fromDate(timestamp)
      });

      // 2. Update 'current' collection (for quick lookup)
      // Using station ID as doc ID ensures we don't duplicate current readings
      const currentRef = db.collection('air_quality').doc(station.station_id);
      batch.set(currentRef, {
        ...station,
        fetched_at: admin.firestore.Timestamp.fromDate(timestamp),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
    console.log(`✅ Updated Firestore: ${stationsData.length} records`);
    
    return { success: true };
    
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
    
    // Fetch all current readings
    const snapshot = await db.collection('air_quality').get();
    
    if (snapshot.empty) {
      // Fallback to fetch if database is empty
      console.log('⚠️ No data in DB, triggering fresh fetch...');
      await fetchAirQualityData();
      return getAirQualityForLocation(lat, lng); // Retry once
    }
    
    // Find nearest station using Haversine formula
    let nearestStation = null;
    let minDistance = Infinity;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      // Ensure data has position
      if (data.position) {
        const distance = calculateDistance(
          lat, lng,
          data.position.lat, data.position.lng
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestStation = { ...data, distance };
        }
      }
    });
    
    if (!nearestStation) {
      return { success: false, error: 'No stations found' };
    }

    return {
      success: true,
      data: nearestStation // Keeping structure compatible with frontend
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
  
  // Fetch immediately on start
  fetchAirQualityData();
  
  // Schedule to run every 15 minutes
  const task = cron.schedule('*/15 * * * *', async () => {
    console.log('\n⏰ Scheduled air quality fetch...');
    await fetchAirQualityData();
  });
  
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

// Export the wrapper function for the frontend/server
module.exports = {
  startAirQualityFetcher,
  fetchAirQualityData,
  getAirQualityForLocation,
  getAirQualityStats
};