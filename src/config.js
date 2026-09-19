require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 5050),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:5050').replace(/\/$/, ''),
  businessName: process.env.BUSINESS_NAME || 'Lashkari Properties',
  agentName: process.env.AGENT_NAME || 'Priya',
  businessPhone: process.env.BUSINESS_PHONE || '+919993320540',
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },
  exotel: {
    // Account SID = URL path  |  API Key = basic user  |  API Token = basic pass
    // SID often DIFFERENT from API Key — copy all 3 from Exotel API Settings
    accountSid: process.env.EXOTEL_ACCOUNT_SID || '',
    apiKey: process.env.EXOTEL_API_KEY || '',
    apiToken: process.env.EXOTEL_API_TOKEN || '',
    subdomain: process.env.EXOTEL_SUBDOMAIN || 'api.exotel.com',
    exophone: process.env.EXOTEL_EXOPHONE || '08047286999',
    trialNumber: process.env.EXOTEL_TRIAL_NUMBER || '09513886363',
  },
  llm: {
    baseUrl: (process.env.LLM_BASE_URL || '').replace(/\/$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'auto/coding:free',
  },
  dashboardPassword: process.env.DASHBOARD_PASSWORD || 'lashkari123',
  dbPath: process.env.DB_PATH || require('path').join(__dirname, '..', 'data', 'leads.db'),
  sarvamApiKey: process.env.SARVAM_API_KEY || '',
  sarvamSpeaker: process.env.SARVAM_SPEAKER || 'anushka',
  outboundDefaultScript: process.env.OUTBOUND_SCRIPT || 'gd_rekha',
};

module.exports = config;
