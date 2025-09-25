// Simple startup verification for cloud deployment
const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID'];

console.log('🔍 Checking environment variables...');

const missing = requiredEnvVars.filter(varName => !process.env[varName]);

if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('Please set these variables in your Render dashboard or .env file');
    process.exit(1);
}

console.log('✅ All required environment variables found');
console.log('🚀 Starting Discord Sticker Bot...');

// Start the main bot
require('./index.js');