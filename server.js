const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// In-memory storage for sensor data
let sensorData = [];
let sessionId = null;

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    message: 'Sensor Data Collection API',
    dataPoints: sensorData.length,
    sessionId: sessionId
  });
});

// Start new session
app.post('/api/session/start', (req, res) => {
  sessionId = Date.now().toString();
  sensorData = [];
  console.log('New session started:', sessionId);
  res.json({ 
    success: true, 
    sessionId: sessionId,
    message: 'Session started'
  });
});

// Receive sensor data
app.post('/api/data', (req, res) => {
  const { data } = req.body;
  
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid data format' 
    });
  }

  // Add data to storage
  sensorData.push(...data);
  
  console.log(`Received ${data.length} data points. Total: ${sensorData.length}`);
  
  res.json({ 
    success: true, 
    totalPoints: sensorData.length,
    message: `Received ${data.length} points`
  });
});

// Get current data count
app.get('/api/data/count', (req, res) => {
  res.json({ 
    count: sensorData.length,
    sessionId: sessionId
  });
});

// Download CSV
app.get('/api/data/download', (req, res) => {
  if (sensorData.length === 0) {
    return res.status(404).json({ 
      success: false, 
      error: 'No data available' 
    });
  }

  // Sort by timestamp
  const sortedData = [...sensorData].sort((a, b) => a.timestamp - b.timestamp);

  // Create CSV content
  const headers = [
    'timestamp',
    'datetime',
    'seconds_elapsed',
    'latitude',
    'longitude',
    'altitude',
    'speed',
    'accuracy',
    'heading',
    'accel_x',
    'accel_y',
    'accel_z',
    'accel_magnitude'
  ];

  let csv = headers.join(',') + '\n';

  const startTime = sortedData[0].timestamp;

  sortedData.forEach(point => {
    const row = [
      point.timestamp,
      new Date(point.timestamp).toISOString(),
      ((point.timestamp - startTime) / 1000).toFixed(3),
      point.latitude || '',
      point.longitude || '',
      point.altitude || '',
      point.speed || '',
      point.accuracy || '',
      point.heading || '',
      point.accel_x || '',
      point.accel_y || '',
      point.accel_z || '',
      point.accel_magnitude || ''
    ];
    csv += row.join(',') + '\n';
  });

  // Set headers for download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=sensor_data_${sessionId}.csv`);
  res.send(csv);

  console.log('CSV downloaded:', sensorData.length, 'points');
});

// Stop session and clear data
app.post('/api/session/stop', (req, res) => {
  const dataCount = sensorData.length;
  console.log('Session stopped:', sessionId, 'Points:', dataCount);
  
  res.json({ 
    success: true,
    message: 'Session stopped',
    dataPoints: dataCount,
    sessionId: sessionId
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Sensor API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
});