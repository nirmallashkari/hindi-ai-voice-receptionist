/**
 * File-based lead + call store (no native modules)
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const storePath = path.join(dataDir, 'store.json');

function load() {
  if (!fs.existsSync(storePath)) {
    return { leads: [], call_events: [], call_sessions: {}, calls: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch {
    return { leads: [], call_events: [], call_sessions: {}, calls: [] };
  }
}

function save(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

function createLead(partial = {}) {
  const data = load();
  const id = uuidv4();
  const ts = nowIso();
  const row = {
    id,
    created_at: ts,
    updated_at: ts,
    local_date: todayIST(),
    caller_phone: partial.caller_phone || '',
    customer_name: partial.customer_name || '',
    intent: partial.intent || '',
    requirement: partial.requirement || '',
    location: partial.location || '',
    budget: partial.budget || '',
    size_bhk: partial.size_bhk || '',
    property_type: partial.property_type || '',
    property_address: partial.property_address || '',
    built_area: partial.built_area || '',
    age_years: partial.age_years || '',
    facing: partial.facing || '',
    expected_rent: partial.expected_rent || '',
    sale_price: partial.sale_price || '',
    extra_notes: partial.extra_notes || '',
    status: partial.status || 'new',
    call_sid: partial.call_sid || '',
    source: partial.source || 'voice',
    raw_transcript: partial.raw_transcript || '',
  };
  data.leads.unshift(row);

  // also track call row for daily management
  data.calls = data.calls || [];
  data.calls.unshift({
    id: uuidv4(),
    lead_id: id,
    call_sid: row.call_sid,
    caller_phone: row.caller_phone,
    started_at: ts,
    ended_at: '',
    local_date: row.local_date,
    status: row.status,
    intent: '',
    source: row.source,
  });

  save(data);
  return row;
}

function updateLead(id, fields) {
  const data = load();
  const idx = data.leads.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const allowed = [
    'customer_name', 'intent', 'requirement', 'location', 'budget', 'size_bhk',
    'property_type', 'property_address', 'built_area', 'age_years', 'facing',
    'expected_rent', 'sale_price', 'extra_notes', 'status', 'call_sid', 'raw_transcript',
    'caller_phone', 'source',
  ];
  for (const key of allowed) {
    if (fields[key] !== undefined) data.leads[idx][key] = fields[key];
  }
  data.leads[idx].updated_at = nowIso();

  // sync call row
  const call = (data.calls || []).find((c) => c.lead_id === id);
  if (call) {
    if (fields.status !== undefined) call.status = fields.status;
    if (fields.intent !== undefined) call.intent = fields.intent;
    if (fields.caller_phone !== undefined) call.caller_phone = fields.caller_phone;
    if (fields.status === 'new' || fields.status === 'closed' || fields.status === 'incomplete') {
      call.ended_at = nowIso();
    }
  }

  save(data);
  return data.leads[idx];
}

function getLead(id) {
  return load().leads.find((l) => l.id === id) || null;
}

function listLeads({ status, intent, q, date, limit = 100 } = {}) {
  let rows = load().leads.slice();
  if (status) rows = rows.filter((r) => r.status === status);
  if (intent) rows = rows.filter((r) => r.intent === intent);
  if (date) rows = rows.filter((r) => (r.local_date || r.created_at.slice(0, 10)) === date);
  if (q) {
    const like = q.toLowerCase();
    rows = rows.filter((r) =>
      [r.customer_name, r.caller_phone, r.location, r.requirement, r.property_address, r.extra_notes]
        .join(' ')
        .toLowerCase()
        .includes(like),
    );
  }
  return rows.slice(0, Number(limit) || 100);
}

function listCalls({ date, limit = 200 } = {}) {
  let rows = (load().calls || []).slice();
  if (date) rows = rows.filter((r) => r.local_date === date);
  return rows.slice(0, Number(limit) || 200);
}

function stats(date) {
  const data = load();
  const day = date || todayIST();
  const leads = data.leads;
  const todayLeads = leads.filter((l) => (l.local_date || l.created_at.slice(0, 10)) === day);
  const byIntent = {};
  const byStatus = {};
  for (const l of leads) {
    const i = l.intent || 'unknown';
    const s = l.status || 'new';
    byIntent[i] = (byIntent[i] || 0) + 1;
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  const todayByIntent = {};
  for (const l of todayLeads) {
    const i = l.intent || 'unknown';
    todayByIntent[i] = (todayByIntent[i] || 0) + 1;
  }
  return {
    total: leads.length,
    today: todayLeads.length,
    todayDate: day,
    todayByIntent: Object.entries(todayByIntent).map(([intent, c]) => ({ intent, c })),
    byIntent: Object.entries(byIntent).map(([intent, c]) => ({ intent, c })),
    byStatus: Object.entries(byStatus).map(([status, c]) => ({ status, c })),
    todayCalls: (data.calls || []).filter((c) => c.local_date === day).length,
  };
}

function dailyReport(date) {
  const day = date || todayIST();
  const leads = listLeads({ date: day, limit: 1000 });
  const calls = listCalls({ date: day, limit: 1000 });
  const s = stats(day);
  return { date: day, stats: s, leads, calls };
}

function exportCsv(date) {
  const leads = date ? listLeads({ date, limit: 5000 }) : listLeads({ limit: 5000 });
  const cols = [
    'id', 'local_date', 'created_at', 'customer_name', 'caller_phone', 'intent', 'requirement',
    'location', 'budget', 'size_bhk', 'property_type', 'property_address', 'built_area',
    'age_years', 'facing', 'expected_rent', 'sale_price', 'extra_notes', 'status', 'source',
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(',')];
  for (const row of leads) {
    lines.push(cols.map((c) => esc(row[c])).join(','));
  }
  return lines.join('\n');
}

function logEvent({ leadId, callSid, step, userSaid, botSaid, meta }) {
  const data = load();
  data.call_events.push({
    id: uuidv4(),
    lead_id: leadId || null,
    call_sid: callSid || null,
    created_at: nowIso(),
    step: step || '',
    user_said: userSaid || '',
    bot_said: botSaid || '',
    meta_json: meta ? JSON.stringify(meta) : null,
  });
  save(data);
}

function getSession(callSid) {
  const row = load().call_sessions[callSid];
  if (!row) return null;
  return {
    callSid: row.call_sid,
    leadId: row.lead_id,
    step: row.step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    state: row.state_json ? JSON.parse(row.state_json) : {},
  };
}

function saveSession(callSid, { leadId, step, state }) {
  const data = load();
  const ts = nowIso();
  const existing = data.call_sessions[callSid];
  if (!existing) {
    data.call_sessions[callSid] = {
      call_sid: callSid,
      lead_id: leadId || null,
      step: step || 'greeting',
      created_at: ts,
      updated_at: ts,
      state_json: JSON.stringify(state || {}),
    };
  } else {
    if (leadId !== undefined) existing.lead_id = leadId;
    if (step !== undefined) existing.step = step;
    if (state !== undefined) existing.state_json = JSON.stringify(state);
    existing.updated_at = ts;
  }
  save(data);
  return getSession(callSid);
}

function getEvents(leadId) {
  return load().call_events.filter((e) => e.lead_id === leadId).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}

module.exports = {
  createLead,
  updateLead,
  getLead,
  listLeads,
  listCalls,
  stats,
  dailyReport,
  exportCsv,
  logEvent,
  getSession,
  saveSession,
  getEvents,
  todayIST,
};
