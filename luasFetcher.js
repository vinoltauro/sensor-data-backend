/**
 * Dublin Luas (Tram) Data Fetcher
 * 
 * Integrates with TFI (Transport for Ireland) Real-Time API
 * Fetches Luas Red and Green line real-time arrival information
 */

const cron = require('node-cron');
const { admin } = require('./firebaseConfig');

// Luas stations with coordinates
// Red Line: The Point → Saggart/Tallaght
// Green Line: Broombridge → Bride's Glen
const LUAS_STATIONS = [
  // Green Line (Central Dublin section)
  { code: 'STS', name: "St. Stephen's Green", line: 'green', lat: 53.3389, lng: -6.2611 },
  { code: 'HAR', name: 'Harcourt', line: 'green', lat: 53.3330, lng: -6.2625 },
  { code: 'CHA', name: 'Charlemont', line: 'green', lat: 53.3302, lng: -6.2588 },
  { code: 'RAN', name: 'Ranelagh', line: 'green', lat: 53.3267, lng: -6.2556 },
  { code: 'BEE', name: 'Beechwood', line: 'green', lat: 53.3191, lng: -6.2542 },
  { code: 'COW', name: 'Cowper', line: 'green', lat: 53.3161, lng: -6.2528 },
  { code: 'MIL', name: 'Milltown', line: 'green', lat: 53.3097, lng: -6.2514 },
  { code: 'WIN', name: 'Windy Arbour', line: 'green', lat: 53.3028, lng: -6.2572 },
  { code: 'DUN', name: 'Dundrum', line: 'green', lat: 53.2919, lng: -6.2450 },
  
  // Red Line (Central Dublin section)
  { code: 'TPT', name: 'The Point', line: 'red', lat: 53.3484, lng: -6.2297 },
  { code: 'SPE', name: 'Spencer Dock', line: 'red', lat: 53.3489, lng: -6.2486 },
  { code: 'GDK', name: 'George\'s Dock', line: 'red', lat: 53.3478, lng: -6.2542 },
  { code: 'CON', name: 'Connolly', line: 'red', lat: 53.3508, lng: -6.2508 },
  { code: 'BUS', name: 'Busáras', line: 'red', lat: 53.3486, lng: -6.2561 },
  { code: 'ABB', name: 'Abbey Street', line: 'red', lat: 53.3478, lng: -6.2594 },
  { code: 'JER', name: 'Jervis', line: 'red', lat: 53.3469, lng: -6.2644 },
  { code: 'FOU', name: 'Four Courts', line: 'red', lat: 53.3467, lng: -6.2753 },
  { code: 'SMI', name: 'Smithfield', line: 'red', lat: 53.3478, lng: -6.2789 },
  { code: 'MUS', name: 'Museum', line: 'red', lat: 53.3472, lng: -6.2864 },
  { code: 'HEU', name: 'Heuston', line: 'red', lat: 53.3467, lng: -6.2919 },
  { code: 'JAM', name: 'James\'s', line: 'red', lat: 53.3414, lng: -6.2931 },
  { code: 'FAT', name: 'Fatima', line: 'red', lat: 53.3378, lng: -6.2939 },
  { code: 'RIA', name: 'Rialto', line: 'red', lat: 53.3386, lng: -6.2975 },
  { code: 'SUI', name: 'Suir Road', line: 'red', lat: 53.3369, lng: -6.3142 }
];

let fetchCount = 0;
let lastFetchTime = null;
let lastFetchStatus = 'Not started';

/**
 * Fetch Luas real-time data
 * Using TFI GTFS Real-Time API (if available) or mock data
 */
async function fetchLuasData() {
  try {
    console.log('🚊 Fetching Luas real-time data...');
    
    const allStationData = [];
    
    // MOCK DATA for now - replace with actual API when you have access
    // TFI API: https://developer.nationaltransport.ie/
    
    for (const station of LUAS_STATIONS) {
      // Mock real-time data
      const mockData = {
        station_code: station.code,
        station_name: station.name,
        line: station.line,
        position: {
          lat: station.lat,
          lng: station.lng
        },
        timestamp: new Date(),
        inbound: {
          destination: station.line === 'green' ? "St. Stephen's Green" : "The Point",
          minutes: [
            Math.floor(Math.random() * 5) + 1,  // 1-5 min
            Math.floor(Math.random() * 8) + 6   // 6-13 min
          ],
          message: 'On time'
        },
        outbound: {
          destination: station.line === 'green' ? "Bride's Glen" : "Saggart",
          minutes: [
            Math.floor(Math.random() * 5) + 2,  // 2-6 min
            Math.floor(Math.random() * 8) + 7   // 7-14 min
          ],
          message: 'On time'
        },
        status: 'operational'
      };
      
      /* ACTUAL API CALL TEMPLATE (when you have TFI API access):
      try {
        const response = await fetch(
          `https://api.nationaltransport.ie/gtfsr/v2/Vehicles?format=json`,
          {
            headers: {
              'x-api-key': process.env.TFI_API_KEY
            }
          }
        );
        const data = await response.json();
        // Process real-time data for this station
      } catch (error) {
        console.error(`Error fetching station ${station.code}:`, error);
      }
      */
      
      allStationData.push(mockData);
    }
    
    console.log(`📊 Fetched Luas data for ${allStationData.length} stations`);
    
    // Save to Firestore
    const result = await saveLuasData(allStationData);
    
    if (result.success) {
      fetchCount++;
      lastFetchTime = new Date().toISOString();
      lastFetchStatus = `Success: ${allStationData.length} stations`;
      
      console.log(`✅ Luas data saved (Fetch #${fetchCount})`);
      
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
    console.error('❌ Error fetching Luas data:', error.message);
    lastFetchStatus = `Error: ${error.message}`;
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Save Luas data to Firestore
 */
async function saveLuasData(stationsData) {
  try {
    const db = admin.firestore();
    const batch = db.batch();
    
    const timestamp = new Date();
    
    stationsData.forEach(station => {
      const docRef = db.collection('luas_realtime').doc();
      batch.set(docRef, {
        ...station,
        fetched_at: admin.firestore.Timestamp.fromDate(timestamp),
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
    
    console.log(`✅ Saved ${stationsData.length} Luas stations to Firestore`);
    
    return {
      success: true,
      stationsAdded: stationsData.length,
      timestamp: timestamp.toISOString()
    };
    
  } catch (error) {
    console.error('Error saving Luas data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get nearest Luas stations for a location
 */
async function getNearestLuasStations(lat, lng, limit = 3) {
  try {
    const db = admin.firestore();
    
    // Get most recent data
    const snapshot = await db.collection('luas_realtime')
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();
    
    if (snapshot.empty) {
      return { success: false, error: 'No Luas data available' };
    }
    
    // Calculate distances and find nearest
    const stations = [];
    const seenStations = new Set();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Avoid duplicates (keep most recent for each station)
      if (seenStations.has(data.station_code)) return;
      seenStations.add(data.station_code);
      
      const distance = calculateDistance(
        lat, lng,
        data.position.lat, data.position.lng
      );
      
      stations.push({
        ...data,
        distance: distance
      });
    });
    
    // Sort by distance and return top N
    stations.sort((a, b) => a.distance - b.distance);
    
    return {
      success: true,
      stations: stations.slice(0, limit)
    };
    
  } catch (error) {
    console.error('Error getting nearest Luas stations:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate distance between coordinates (Haversine)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
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
 * Start Luas fetcher
 */
function startLuasFetcher() {
  console.log('🕐 Starting Luas fetcher...');
  console.log('📅 Schedule: Every 2 minutes');
  
  // Fetch immediately
  fetchLuasData()
    .then(result => {
      if (result.success) {
        console.log('✅ Initial Luas fetch completed');
      } else {
        console.log('⚠️ Initial Luas fetch failed:', result.error);
      }
    });
  
  // Schedule every 2 minutes (same as Dublin Bikes)
  const task = cron.schedule('*/2 * * * *', async () => {
    console.log('\n⏰ Scheduled Luas fetch at', new Date().toISOString());
    await fetchLuasData();
  });
  
  console.log('✅ Luas fetcher started');
  return task;
}

/**
 * Get fetcher stats
 */
function getLuasStats() {
  return {
    fetchCount,
    lastFetchTime,
    lastFetchStatus,
    isRunning: true,
    schedule: 'Every 2 minutes',
    stations: LUAS_STATIONS.length
  };
}

module.exports = {
  startLuasFetcher,
  fetchLuasData,
  getNearestLuasStations,
  getLuasStats,
  LUAS_STATIONS
};