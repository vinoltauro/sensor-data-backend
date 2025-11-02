/**
 * Dublin Bikes Data Fetcher
 * 
 * Fetches real-time bike availability data from JCDecaux API
 * Runs every 5 minutes and stores data to Firebase Firestore
 * 
 * API: https://developer.jcdecaux.com/
 */

const cron = require('node-cron');
const { addDublinBikesData } = require('./firebaseConfig');

// JCDecaux API configuration
const JCDECAUX_API_KEY = process.env.JCDECAUX_API_KEY;
const JCDECAUX_API_URL = 'https://api.jcdecaux.com/vls/v1/stations';
const CONTRACT_NAME = 'dublin'; // Dublin Bikes contract name

// Statistics
let fetchCount = 0;
let lastFetchTime = null;
let lastFetchStatus = 'Not started';

/**
 * Fetch Dublin Bikes data from JCDecaux API
 */
async function fetchDublinBikes() {
  if (!JCDECAUX_API_KEY) {
    console.error('❌ JCDECAUX_API_KEY not found in environment variables');
    lastFetchStatus = 'Error: Missing API key';
    return { success: false, error: 'Missing API key' };
  }

  try {
    console.log('🚴 Fetching Dublin Bikes data...');
    
    const url = `${JCDECAUX_API_URL}?contract=${CONTRACT_NAME}&apiKey=${JCDECAUX_API_KEY}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}: ${response.statusText}`);
    }
    
    const stations = await response.json();
    
    console.log(`📊 Received ${stations.length} Dublin Bikes stations`);
    
    // Transform data for our needs
    const transformedStations = stations.map(station => ({
      station_number: station.number,
      station_name: station.name,
      address: station.address,
      position: {
        lat: station.position.lat,
        lng: station.position.lng
      },
      banking: station.banking || false,
      bonus: station.bonus || false,
      bike_stands: station.bike_stands || 0,
      available_bike_stands: station.available_bike_stands || 0,
      available_bikes: station.available_bikes || 0,
      status: station.status || 'UNKNOWN',
      last_update: station.last_update ? new Date(station.last_update) : null
    }));
    
    // Save to Firestore
    const result = await addDublinBikesData(transformedStations);
    
    if (result.success) {
      fetchCount++;
      lastFetchTime = new Date().toISOString();
      lastFetchStatus = `Success: ${transformedStations.length} stations`;
      
      console.log(`✅ Successfully stored Dublin Bikes data (Fetch #${fetchCount})`);
      
      return {
        success: true,
        stationsCount: transformedStations.length,
        fetchCount: fetchCount
      };
    } else {
      lastFetchStatus = `Error: ${result.error}`;
      return result;
    }
    
  } catch (error) {
    console.error('❌ Error fetching Dublin Bikes data:', error.message);
    lastFetchStatus = `Error: ${error.message}`;
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Initialize Dublin Bikes fetcher with cron schedule
 * Runs every 5 minutes
 */
function startDublinBikesFetcher() {
  console.log('🕐 Starting Dublin Bikes fetcher...');
  console.log('📅 Schedule: Every 5 minutes');
  
  // Fetch immediately on start
  fetchDublinBikes()
    .then(result => {
      if (result.success) {
        console.log('✅ Initial fetch completed successfully');
      } else {
        console.log('⚠️ Initial fetch failed:', result.error);
      }
    });
  
  // Schedule to run every 5 minutes
  // Cron format: '*/5 * * * *' means "every 5 minutes"
  const task = cron.schedule('*/5 * * * *', async () => {
    console.log('\n⏰ Scheduled fetch triggered at', new Date().toISOString());
    await fetchDublinBikes();
  });
  
  console.log('✅ Dublin Bikes fetcher started successfully');
  
  return task;
}

/**
 * Get fetcher statistics
 */
function getFetcherStats() {
  return {
    fetchCount,
    lastFetchTime,
    lastFetchStatus,
    isRunning: true,
    schedule: 'Every 5 minutes',
    apiEndpoint: JCDECAUX_API_URL,
    contractName: CONTRACT_NAME
  };
}

/**
 * Manual fetch trigger (for testing)
 */
async function triggerManualFetch() {
  console.log('🔧 Manual fetch triggered');
  return await fetchDublinBikes();
}

// Export functions
module.exports = {
  startDublinBikesFetcher,
  fetchDublinBikes,
  getFetcherStats,
  triggerManualFetch
};