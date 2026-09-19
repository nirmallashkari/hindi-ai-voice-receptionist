const state = {
  password: localStorage.getItem('lp_dash_pass') || '',
  demoCallSid: null,
};

const $ = (id) => document.getElementById(id);

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-dashboard-password': state.password || '',
  };
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('hi-IN', { timeZone: 'Asia/Kolkata' });
  } catch {
    return iso;
  }
}

function intentBadge(intent) {
  const i = intent || 'anya';
  return `<span class="badge ${i}">${i || '—'}</span>`;
}

async function loadStats() {
  try {
    const s = await api('/api/stats');
    $('statTotal').textContent = s.total;
    $('statToday').textContent = s.today;
    const map = Object.fromEntries((s.byIntent || []).map((x) => [x.intent, x.c]));
    $('statBuy').textContent = map.kharidna || 0;
    $('statRent').textContent = map.kiraya || 0;
    $('statSell').textContent = map.bechna || 0;
  } catch (e) {
    console.warn(e.message);
  }
}

async function loadLeads() {
  const q = $('search').value.trim();
  const intent = $('filterIntent').value;
  const status = $('filterStatus').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (intent) params.set('intent', intent);
  if (status) params.set('status', status);
  try {
    const data = await api('/api/leads?' + params.toString());
    const body = $('leadsBody');
    body.innerHTML = '';
    for (const lead of data.leads) {
      const tr = document.createElement('tr');
      const money = lead.sale_price || lead.budget || lead.expected_rent || '—';
      tr.innerHTML = `
        <td>${fmtTime(lead.created_at)}</td>
        <td>${escapeHtml(lead.customer_name || '—')}</td>
        <td>${escapeHtml(lead.caller_phone || '—')}</td>
        <td>${intentBadge(lead.intent)}</td>
        <td>${escapeHtml(lead.location || lead.property_address || '—')}</td>
        <td>${escapeHtml(money)}</td>
        <td>${escapeHtml(lead.status || 'new')}</td>
        <td><button class="linkish" data-id="${lead.id}">Detail</button></td>
      `;
      body.appendChild(tr);
    }
    body.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => showLead(btn.dataset.id));
    });
  } catch (e) {
    alert('Login / password check karein: ' + e.message);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function showLead(id) {
  const data = await api('/api/leads/' + id);
  const l = data.lead;
  const box = $('leadDetail');
  box.classList.remove('hidden');
  box.innerHTML = `
    <h3>${escapeHtml(l.customer_name || 'Lead')} · ${intentBadge(l.intent)}</h3>
    <div class="grid2">
      <div class="kv">Phone<b>${escapeHtml(l.caller_phone || '—')}</b></div>
      <div class="kv">Status
        <b>
          <select id="statusSelect">
            ${['new','in_progress','contacted','closed','incomplete'].map((s) =>
              `<option value="${s}" ${l.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
          <button class="btn" id="btnSaveStatus">Save</button>
        </b>
      </div>
      <div class="kv">Location<b>${escapeHtml(l.location || '—')}</b></div>
      <div class="kv">Budget<b>${escapeHtml(l.budget || '—')}</b></div>
      <div class="kv">Size / BHK<b>${escapeHtml(l.size_bhk || '—')}</b></div>
      <div class="kv">Property type<b>${escapeHtml(l.property_type || '—')}</b></div>
      <div class="kv">Address (sell)<b>${escapeHtml(l.property_address || '—')}</b></div>
      <div class="kv">Built area<b>${escapeHtml(l.built_area || '—')}</b></div>
      <div class="kv">Age<b>${escapeHtml(l.age_years || '—')}</b></div>
      <div class="kv">Facing / Disha<b>${escapeHtml(l.facing || '—')}</b></div>
      <div class="kv">Sale price<b>${escapeHtml(l.sale_price || '—')}</b></div>
      <div class="kv">Expected rent<b>${escapeHtml(l.expected_rent || '—')}</b></div>
      <div class="kv">Notes<b>${escapeHtml(l.extra_notes || '—')}</b></div>
      <div class="kv">Source<b>${escapeHtml(l.source || '—')}</b></div>
    </div>
    <h4>Call transcript</h4>
    <div class="events">
      ${(data.events || []).map((e) => `
        <div>
          <strong>${escapeHtml(e.step || '')}</strong>
          ${e.user_said ? `<div>👤 ${escapeHtml(e.user_said)}</div>` : ''}
          ${e.bot_said ? `<div>🤖 ${escapeHtml(e.bot_said)}</div>` : ''}
        </div>
      `).join('') || '<div>No events</div>'}
    </div>
  `;
  $('btnSaveStatus').onclick = async () => {
    await api('/api/leads/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ status: $('statusSelect').value }),
    });
    await loadLeads();
    await showLead(id);
  };
}

function addChat(role, text) {
  const chat = $('chat');
  const div = document.createElement('div');
  div.className = 'bubble ' + role;
  div.textContent = (role === 'bot' ? 'Priya: ' : 'Customer: ') + text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

async function startDemo() {
  $('chat').innerHTML = '';
  const data = await fetch('/api/demo/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+919993320540' }),
  }).then((r) => r.json());
  state.demoCallSid = data.callSid;
  addChat('bot', data.bot);
}

async function sendDemo() {
  const text = $('demoText').value.trim();
  if (!text) return;
  if (!state.demoCallSid) await startDemo();
  addChat('user', text);
  $('demoText').value = '';
  const data = await fetch('/api/demo/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callSid: state.demoCallSid, text }),
  }).then((r) => r.json());
  addChat('bot', data.bot);
  if (data.done) {
    state.demoCallSid = null;
    if (state.password) {
      loadStats();
      loadLeads();
    }
  }
}

// Tabs
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

$('btnLogin').onclick = async () => {
  state.password = $('password').value.trim();
  localStorage.setItem('lp_dash_pass', state.password);
  try {
    await loadStats();
    await loadLeads();
    alert('Login OK');
  } catch (e) {
    alert('Password galat: ' + e.message);
  }
};

$('btnRefresh').onclick = () => {
  loadStats();
  loadLeads();
};
$('search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadLeads();
});
$('filterIntent').onchange = loadLeads;
$('filterStatus').onchange = loadLeads;
$('btnStartDemo').onclick = startDemo;
$('btnSendDemo').onclick = sendDemo;
$('demoText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendDemo();
});

async function loadOutboundStatus() {
  try {
    const s = await api('/api/outbound/status');
    $('outStatusHint').textContent =
      `Twilio ready: ${s.twilio.ready} (from ${s.twilio.from || '—'}) · ` +
      `Exotel ready: ${s.exotel.ready} · Default test: ${s.defaultTestTo}`;
    if (!$('outTo').value) $('outTo').value = s.defaultTestTo || '';
  } catch (e) {
    $('outStatusHint').textContent = e.message;
  }
}

$('btnOutbound').onclick = async () => {
  const to = $('outTo').value.trim();
  const region = $('outRegion').value;
  const scriptId = $('outScript').value;
  const message = $('outMsg').value.trim();
  $('outResult').textContent = 'Calling...';
  try {
    if (!state.password) {
      state.password = $('password').value.trim() || localStorage.getItem('lp_dash_pass') || '';
    }
    const data = await api('/api/outbound/call', {
      method: 'POST',
      body: JSON.stringify({
        to,
        region,
        scriptId,
        provider: 'auto',
        message: message || undefined,
      }),
    });
    $('outResult').textContent = JSON.stringify(data, null, 2);
    alert('Call request bhej diya! Phone check karo.');
    loadLeads();
  } catch (e) {
    $('outResult').textContent = 'ERROR: ' + e.message;
    alert('Call fail: ' + e.message);
  }
};

// load outbound status when tab opened
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'outbound' && state.password) loadOutboundStatus();
  });
});

if (state.password) {
  $('password').value = state.password;
  loadStats().then(loadLeads).catch(() => {});
}

// deep link #demo / #outbound
if (location.hash === '#demo') {
  document.querySelector('.tab[data-tab="demo"]').click();
}
if (location.hash === '#outbound') {
  document.querySelector('.tab[data-tab="outbound"]').click();
  if (state.password) loadOutboundStatus();
}
