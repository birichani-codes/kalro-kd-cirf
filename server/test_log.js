const axios = require('axios');

async function testLogIngestion() {
  try {
    const response = await axios.post('http://localhost:3000/api/log-collection/api', {
      source: 'firewall',
      message: 'TCP connection from 192.168.1.100:12345 to 10.0.0.1:80',
      timestamp: '2024-01-15T10:30:00Z',
      severity: 'high'
    });
    console.log('Log ingestion response:', response.data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLogIngestion();