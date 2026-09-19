/**
 * Outbound calls — dual region
 * - USA: Twilio (+1 number)
 * - India: Exotel click-to-call (when API works)
 * Voice: Sarvam Hindi (natural) → Twilio <Play>, else Google Say fallback
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const sarvam = require('./sarvam');

const SCRIPTS = {
  gd_rekha: {
    id: 'gd_rekha',
    label: 'GD Digital Indore — Rekha (soft offer)',
    text:
      'Hello, GD Digital Indore se Rekha bol rahi hoon. Abhi ek mahina free social media handling ka offer chal raha hai — kya chhoti si baat ho sakti hai?',
  },
  lashkari_priya: {
    id: 'lashkari_priya',
    label: 'Lashkari — Priya test',
    text:
      'नमस्ते, मैं प्रिया, लश्करी प्रॉपर्टीज़ से बोल रही हूँ। क्या आपसे एक मिनट बात हो सकती है?',
  },
};

function normalizePhone(raw, region = 'IN') {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = `+${d.slice(2)}`;
  if (region === 'US' || region === 'USA') {
    if (d.startsWith('+')) return d;
    const digits = d.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return d.startsWith('+') ? d : `+${digits}`;
  }
  // India
  if (d.startsWith('+')) return d;
  if (d.startsWith('0') && d.length === 11) return `+91${d.slice(1)}`;
  if (d.length === 10) return `+91${d}`;
  if (d.startsWith('91') && d.length === 12) return `+${d}`;
  return d.startsWith('+') ? d : `+${d}`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveScript(message, scriptId) {
  if (message && String(message).trim()) return String(message).trim();
  const id = scriptId || config.outboundDefaultScript || 'gd_rekha';
  return (SCRIPTS[id] && SCRIPTS[id].text) || SCRIPTS.gd_rekha.text;
}

/** Build public Play URL via Sarvam natural Hindi TTS */
async function buildSarvamPlayUrl(text) {
  const key = config.sarvamApiKey;
  if (!key) return null;
  const publicBase = (config.publicBaseUrl || '').replace(/\/$/, '');
  if (!publicBase || publicBase.includes('localhost')) {
    // still write file; Play may fail without public URL
  }
  try {
    const pcm = await sarvam.ttsHindi(text, { speaker: config.sarvamSpeaker || 'anushka' });
    const wav = sarvam.pcmToWav(pcm, 8000);
    const dir = path.join(__dirname, '..', 'public', 'tts');
    fs.mkdirSync(dir, { recursive: true });
    const name = `out-${Date.now()}.wav`;
    fs.writeFileSync(path.join(dir, name), wav);
    if (!publicBase || publicBase.includes('localhost')) return null;
    return `${publicBase}/tts/${name}`;
  } catch (e) {
    console.error('Sarvam TTS for outbound failed:', e.message);
    return null;
  }
}

async function twilioOutbound({ to, message, scriptId, region }) {
  const { accountSid, authToken, phoneNumber } = config.twilio;
  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error('Twilio SID / Auth Token / Phone number missing in .env');
  }
  const reg = (region || 'US').toUpperCase();
  const toNum = normalizePhone(to, reg === 'IN' || reg === 'INDIA' ? 'IN' : 'US');
  const fromNum = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  const say = resolveScript(message, scriptId);

  let twiml;
  const playUrl = await buildSarvamPlayUrl(say);
  if (playUrl) {
    // Natural Hindi (Sarvam) — less "robot"
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(playUrl)}</Play>
  <Pause length="1"/>
</Response>`;
  } else {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="Google.hi-IN-Wavenet-A">${escapeXml(say)}</Say>
  <Pause length="1"/>
</Response>`;
  }

  const body = new URLSearchParams({
    To: toNum,
    From: fromNum,
    Twiml: twiml,
  });

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error_message || `Twilio error ${res.status}`);
  }
  return {
    provider: 'twilio',
    region: reg,
    script: say,
    voice: playUrl ? 'sarvam-anushka' : 'google-wavenet',
    playUrl: playUrl || null,
    sid: data.sid,
    status: data.status,
    to: data.to,
    from: data.from,
    raw: data,
  };
}

/**
 * Exotel auth:
 *   Basic username = API Key
 *   Basic password = API Token
 *   URL path      = Account SID  (often different from API Key!)
 */
function exotelAuthParts() {
  const accountSid = config.exotel.accountSid || config.exotel.apiKey;
  const apiKey = config.exotel.apiKey || config.exotel.accountSid;
  const token = config.exotel.apiToken;
  const subdomain = (config.exotel.subdomain || 'api.exotel.com').replace(/^https?:\/\//, '');
  if (!accountSid || !apiKey || !token) {
    throw new Error(
      'Exotel incomplete. Need Account SID + API Key + API Token from https://my.exotel.com/apisettings/site#api-credentials',
    );
  }
  return { accountSid, apiKey, token, subdomain };
}

/** Test credentials — returns account info or throws */
async function exotelTestAuth() {
  const { accountSid, apiKey, token, subdomain } = exotelAuthParts();
  const hosts = [subdomain, 'api.exotel.com', 'api.in.exotel.com'].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  const auth = Buffer.from(`${apiKey}:${token}`).toString('base64');
  let lastErr = '';
  for (const host of hosts) {
    const url = `https://${host}/v1/Accounts/${accountSid}.json`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
      if (res.ok) {
        return { ok: true, host, accountSid, data };
      }
      lastErr = `${host} HTTP ${res.status}: ${data.RestException?.Message || text.slice(0, 200)}`;
    } catch (e) {
      lastErr = `${host}: ${e.message}`;
    }
  }
  throw new Error(lastErr || 'Exotel auth failed');
}

/**
 * India outbound to CUSTOMER (not same-number busy bug):
 * Call customer (From=customer), show ExoPhone as CLI, connect to App flow when they answer.
 * App URL from env or default Exotel start_voice app on this account.
 */
async function exotelCallCustomer({ to, agentFrom }) {
  const { accountSid, apiKey, token, subdomain } = exotelAuthParts();
  const callerId = config.exotel.exophone || config.exotel.trialNumber;
  if (!callerId) throw new Error('Exotel exophone missing');

  const customer = toExotelFormat(to);
  const caller = toExotelFormat(callerId);
  const agent = toExotelFormat(agentFrom || config.businessPhone);

  // Prefer connect-customer-to-flow (single leg → no busy on self-test)
  const appUrl =
    process.env.EXOTEL_APP_URL ||
    `http://my.exotel.com/${accountSid}/exoml/start_voice/1294025`;

  const hosts = [subdomain, 'api.exotel.com', 'api.in.exotel.com'].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  const auth = Buffer.from(`${apiKey}:${token}`).toString('base64');

  // Mode A: customer → flow (best for outbound offer / IVR)
  const formFlow = new URLSearchParams({
    From: customer,
    CallerId: caller,
    Url: appUrl,
    CallType: 'trans',
  });

  let lastErr = '';
  for (const host of hosts) {
    const url = `https://${host}/v1/Accounts/${accountSid}/Calls/connect.json`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formFlow.toString(),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
      if (res.ok) {
        return {
          provider: 'exotel',
          region: 'IN',
          mode: 'customer-to-flow',
          status: data.Call?.Status || 'queued',
          to: customer,
          from: customer,
          callerId: caller,
          appUrl,
          host,
          raw: data,
        };
      }
      lastErr = data.RestException?.Message || data.message || text || `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e.message;
    }
  }

  // Mode B fallback: agent phone first, then customer (must be DIFFERENT numbers)
  if (agent === customer) {
    throw new Error(
      `Exotel busy risk: agent and customer same (${customer}). Flow call failed: ${lastErr}`,
    );
  }
  const formTwo = new URLSearchParams({
    From: agent,
    To: customer,
    CallerId: caller,
    CallType: 'trans',
  });
  for (const host of hosts) {
    const url = `https://${host}/v1/Accounts/${accountSid}/Calls/connect.json`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formTwo.toString(),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
      if (res.ok) {
        return {
          provider: 'exotel',
          region: 'IN',
          mode: 'agent-then-customer',
          status: data.Call?.Status || 'queued',
          to: customer,
          from: agent,
          callerId: caller,
          host,
          raw: data,
        };
      }
      lastErr = data.RestException?.Message || data.message || text || `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e.message;
    }
  }
  throw new Error(`Exotel failed: ${lastErr}`);
}

/** @deprecated use exotelCallCustomer */
async function exotelClickToCall({ from, to }) {
  return exotelCallCustomer({ to, agentFrom: from });
}

function toExotelFormat(raw) {
  const e164 = normalizePhone(raw, 'IN');
  if (e164.startsWith('+91') && e164.length === 13) return `0${e164.slice(3)}`;
  if (e164.startsWith('+')) return e164.slice(1);
  return e164;
}

/**
 * region: 'IN' | 'US'
 * provider: auto | twilio | exotel
 * scriptId: gd_rekha | lashkari_priya
 */
async function placeOutbound({ provider, to, from, message, mode, region, scriptId }) {
  const reg = (region || (provider === 'exotel' ? 'IN' : 'US')).toUpperCase();
  let p = (provider || 'auto').toLowerCase();
  if (p === 'auto') {
    p = reg === 'IN' || reg === 'INDIA' ? 'exotel' : 'twilio';
  }
  if (p === 'exotel' || reg === 'IN' || reg === 'INDIA') {
    try {
      return await exotelCallCustomer({
        to,
        agentFrom: from || config.businessPhone,
      });
    } catch (e) {
      // Twilio trial only allows verified numbers — do not hide Exotel error for India
      const msg = e.message || String(e);
      throw new Error(
        `${msg} | Tip: Exotel trial me number whitelist karo (Dashboard → Call Settings → Whitelist Numbers) then retry.`,
      );
    }
  }
  return twilioOutbound({ to, message, scriptId, region: reg === 'IN' ? 'IN' : 'US' });
}

module.exports = {
  SCRIPTS,
  normalizePhone,
  normalizeInPhone: (r) => normalizePhone(r, 'IN'),
  twilioOutbound,
  exotelClickToCall,
  exotelCallCustomer,
  exotelTestAuth,
  placeOutbound,
  resolveScript,
};
