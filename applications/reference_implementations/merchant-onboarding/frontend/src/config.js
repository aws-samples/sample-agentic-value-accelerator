// API Configuration - Always load from public/config.json
let API_CONFIG = null;

// Synchronously load configuration from public/config.json
const loadConfigSync = () => {
  try {
    // Use synchronous XMLHttpRequest to load config immediately
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/config.json', false); // Synchronous
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    xhr.setRequestHeader('Pragma', 'no-cache');
    xhr.send();
    
    if (xhr.status === 200) {
      API_CONFIG = JSON.parse(xhr.responseText);
    } else {
      throw new Error(`Failed to load config.json: ${xhr.status}`);
    }
  } catch (error) {
    console.error('Failed to load config.json:', error);
    // Exit if config cannot be loaded
    throw new Error('Application cannot start without config.json');
  }
};

// Load config immediately
loadConfigSync();

// Export functions for dynamic config access
export const getConfig = () => API_CONFIG;
export const reloadConfig = () => {
  loadConfigSync();
  return API_CONFIG;
};

export default API_CONFIG; 