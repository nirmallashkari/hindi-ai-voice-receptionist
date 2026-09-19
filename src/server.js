const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const store = require('./leadStore');
const flow = require('./callFlow');
const twilioHandler = require('./voice/twilioHandler');
const outbound = require('./outbound');
const { attachExotelWs } = require('./exotelWs');

const app = express();
const server = http.createServer(app);
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function authDashboard(req, res, next) {
  const pass = req.headers['x-dashboard-password'] || req.query.password || '';
  if (pass && pass === config.dashboardPassword) return next();
  // Allow read of health without auth
  return res.status(401).json({ error: 'Unauthorized. Send x-dashboard-password header.' });
}

// Health
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    business: config.businessName,
    agent: config.agentName,
    phone: config.businessPhone,
    publicBaseUrl: config.publicBaseUrl,
    indiaExotelWs: `${config.publicBaseUrl.replace(/^http/, 'ws')}/exotel/ws`,
    indiaDial: '9513886363',
  });
});

// Exotel dynamic Voicebot: paste THIS https URL in Voicebot applet (optional method)
// Returns { "url": "wss://..." }
app.get('/exotel/voicebot-url', (_req, res) => {
  const base = config.publicBaseUrl.replace(/\/$/, '');
  const wss = base.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:') + '/exotel/ws';
  res.json({ url: wss });
});

// Twilio voice webhooks
app.post('/voice/incoming', (req, res) => {
  try {
    const twiml = twilioHandler.handleIncoming(req);
    res.type('text/xml').send(twiml);
  } catch (err) {
    console.error('incoming error', err);
    res.status(500).type('text/xml').send('<Response><Say language="hi-IN">सिस्टम त्रुटि।</Say></Response>');
  }
});

app.post('/voice/gather', (req, res) => {
  try {
    const twiml = twilioHandler.handleGather(req);
    res.type('text/xml').send(twiml);
  } catch (err) {
    console.error('gather error', err);
    res.status(500).type('text/xml').send('<Response><Say language="hi-IN">सिस्टम त्रुटि।</Say></Response>');
  }
});

// Local browser / demo chat API (same flow, no Twilio)
app.post('/api/demo/start', (req, res) => {
  const phone = req.body.phone || config.businessPhone;
  const callSid = `demo-${Date.now()}`;
  const lead = store.createLead({
    caller_phone: phone,
    call_sid: callSid,
    source: 'demo',
    status: 'in_progress',
  });
  const state = flow.startSessionState(phone);
  store.saveSession(callSid, { leadId: lead.id, step: flow.STEPS.ASK_INTENT, state });
  const bot = flow.greetingText();
  store.logEvent({ leadId: lead.id, callSid, step: flow.STEPS.GREETING, botSaid: bot });
  res.json({
    callSid,
    leadId: lead.id,
    step: flow.STEPS.ASK_INTENT,
    bot,
  });
});

app.post('/api/demo/message', (req, res) => {
  const { callSid, text } = req.body || {};
  if (!callSid) return res.status(400).json({ error: 'callSid required' });
  let session = store.getSession(callSid);
  if (!session) return res.status(404).json({ error: 'session not found' });

  const currentStep = session.step || flow.STEPS.ASK_INTENT;
  const userText = String(text || '').trim();
  if (!userText) {
    return res.json({
      callSid,
      step: currentStep,
      bot: flow.promptForStep(currentStep, session.state),
      done: false,
    });
  }

  const result = flow.applyAnswer(currentStep, userText, session.state || {});
  const bot = result.reprompt
    ? result.repromptText || flow.promptForStep(result.nextStep, result.state)
    : (result.botPrefix || '') + flow.promptForStep(result.nextStep, result.state);

  store.logEvent({
    leadId: session.leadId,
    callSid,
    step: currentStep,
    userSaid: userText,
    botSaid: bot,
  });
  store.saveSession(callSid, {
    leadId: session.leadId,
    step: result.nextStep,
    state: result.state,
  });

  const status = result.nextStep === flow.STEPS.DONE ? 'new' : 'in_progress';
  const lead = store.updateLead(session.leadId, { ...flow.toLeadFields(result.state), status });

  res.json({
    callSid,
    leadId: session.leadId,
    step: result.nextStep,
    bot,
    done: result.nextStep === flow.STEPS.DONE,
    lead,
    summary: flow.buildSummary(result.state),
  });
});

// Leads API
app.get('/api/leads', authDashboard, (req, res) => {
  const leads = store.listLeads({
    status: req.query.status,
    intent: req.query.intent,
    q: req.query.q,
    limit: req.query.limit,
  });
  res.json({ leads });
});

app.get('/api/leads/:id', authDashboard, (req, res) => {
  const lead = store.getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'not found' });
  const events = store.getEvents(lead.id);
  res.json({ lead, events });
});

app.patch('/api/leads/:id', authDashboard, (req, res) => {
  const lead = store.getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'not found' });
  const updated = store.updateLead(req.params.id, req.body || {});
  res.json({ lead: updated });
});

app.get('/api/stats', authDashboard, (req, res) => {
  res.json(store.stats(req.query.date));
});

// Daily call / lead management
app.get('/api/daily', authDashboard, (req, res) => {
  const date = req.query.date || store.todayIST();
  res.json(store.dailyReport(date));
});

app.get('/api/daily/export.csv', authDashboard, (req, res) => {
  const date = req.query.date || '';
  const csv = store.exportCsv(date || undefined);
  const name = date ? `leads-${date}.csv` : `leads-all.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send('\uFEFF' + csv); // Excel-friendly BOM
});

// Manual lead entry
app.post('/api/leads', authDashboard, (req, res) => {
  const lead = store.createLead({ ...(req.body || {}), source: req.body?.source || 'manual' });
  res.status(201).json({ lead });
});

// Outbound call (test + production)
// body: { to, provider?, region?: 'IN'|'US', scriptId?: 'gd_rekha', message?, from? }
app.post('/api/outbound/call', authDashboard, async (req, res) => {
  try {
    const { to, provider, message, from, region, scriptId } = req.body || {};
    if (!to) return res.status(400).json({ error: 'to (phone number) required' });
    const result = await outbound.placeOutbound({
      provider: provider || 'auto',
      to,
      from,
      message,
      region: region || 'US',
      scriptId: scriptId || 'gd_rekha',
    });
    store.createLead({
      caller_phone: outbound.normalizePhone(to, region === 'IN' ? 'IN' : 'US'),
      customer_name: 'Outbound',
      intent: 'outbound',
      requirement: result.script || 'outbound_call',
      extra_notes: `provider=${result.provider} region=${result.region || region} voice=${result.voice || ''} sid=${result.sid || ''}`,
      source: 'outbound',
      status: 'contacted',
      call_sid: result.sid || '',
    });
    res.json({ ok: true, result });
  } catch (err) {
    console.error('outbound error', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/api/outbound/status', authDashboard, (_req, res) => {
  res.json({
    scripts: outbound.SCRIPTS,
    defaultScript: config.outboundDefaultScript,
    defaultScriptText: outbound.resolveScript(null, config.outboundDefaultScript),
    twilio: {
      ready: !!(config.twilio.accountSid && config.twilio.authToken && config.twilio.phoneNumber),
      from: config.twilio.phoneNumber || null,
      region: 'US (+ India verified numbers on trial)',
      note: 'USA outbound + natural Hindi via Sarvam when public URL available.',
    },
    exotel: {
      hasAccountSid: !!config.exotel.accountSid,
      hasApiKey: !!config.exotel.apiKey,
      hasToken: !!config.exotel.apiToken,
      ready: !!(config.exotel.apiToken && config.exotel.apiKey && (config.exotel.accountSid || config.exotel.apiKey)),
      exophone: config.exotel.exophone,
      trial: config.exotel.trialNumber,
      region: 'IN',
      note: 'Need Account SID + API Key + API Token from Exotel API Settings. See EXOTEL_API_FIX.txt',
      fixGuide: 'D:\\\\SOFTWARE\\\\Lashkari Properties - VOICE\\\\EXOTEL_API_FIX.txt',
    },
    defaultTestTo: config.businessPhone,
  });
});

// Test Exotel credentials without placing a call
app.get('/api/exotel/test', authDashboard, async (_req, res) => {
  try {
    const result = await outbound.exotelTestAuth();
    res.json({ ok: true, message: 'Exotel API OK — India number se call possible', result });
  } catch (err) {
    res.status(400).json({
      ok: false,
      error: err.message,
      help: 'Open https://my.exotel.com/apisettings/site#api-credentials — copy Account SID, API Key, API Token into .env / exotel.txt',
    });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

attachExotelWs(server);

server.listen(config.port, () => {
  console.log('');
  console.log('========================================');
  console.log(` ${config.businessName} | AI Voice (Hindi)`);
  console.log('========================================');
  console.log(` Agent     : ${config.agentName}`);
  console.log(` Phone     : ${config.businessPhone}`);
  console.log(` Dashboard : http://localhost:${config.port}`);
  console.log(` Demo chat : http://localhost:${config.port}/#demo`);
  console.log(` Health    : http://localhost:${config.port}/api/health`);
  console.log(` INDIA WS  : /exotel/ws  (Exotel Voicebot)`);
  console.log(` INDIA dyn : /exotel/voicebot-url`);
  console.log(` Twilio IN : ${config.publicBaseUrl}/voice/incoming`);
  console.log('========================================');
  console.log('');
});
