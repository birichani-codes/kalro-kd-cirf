const axios = require('axios');

async function triggerProcessing() {
  try {
    const response = await axios.post('http://localhost:3001/api/log-collection/process');
    console.log('Processing response:', response.data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

triggerProcessing();