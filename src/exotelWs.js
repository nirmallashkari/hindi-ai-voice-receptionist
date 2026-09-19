/**
 * Exotel Voicebot bidirectional WebSocket handler (India incoming)
 * Protocol: connected / start / media / stop  (PCM 16-bit LE 8kHz mono base64)
 */
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const flow = require('./callFlow');
const store = require('./leadStore');
const sarvam = require('./sarvam');

const CHUNK = 3200; // 200ms at 8kHz 16-bit mono (multiple of 320)

function attachExotelWs(server) {
  const wss = new WebSocketServer({ server, path: '/exotel/ws' });

  wss.on('connection', (ws, req) => {
    const id = uuidv4().slice(0, 8);
    console.log(`[exotel ${id}] connected from ${req.socket.remoteAddress}`);

    let streamSid = '';
    let callSid = '';
    let from = '';
    let leadId = null;
    let state = flow.startSessionState('');
    let step = flow.STEPS.ASK_INTENT;
    let seq = 1;
    let mediaBuf = [];
    let mediaBytes = 0;
    let busy = false;
    let closed = false;

    const sendJson = (obj) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(obj));
    };

    const sendPcm = async (pcm) => {
      if (!pcm || !pcm.length || closed) return;
      // pad to multiple of 320
      let buf = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
      const rem = buf.length % 320;
      if (rem) buf = Buffer.concat([buf, Buffer.alloc(320 - rem)]);

      for (let i = 0; i < buf.length; i += CHUNK) {
        if (closed) break;
        const slice = buf.subarray(i, Math.min(i + CHUNK, buf.length));
        sendJson({
          event: 'media',
          sequence_number: String(seq++),
          stream_sid: streamSid,
          media: {
            chunk: String(Math.floor(i / CHUNK) + 1),
            timestamp: String(Date.now()),
            payload: slice.toString('base64'),
          },
        });
        await sleep(80);
      }
      sendJson({
        event: 'mark',
        sequence_number: String(seq++),
        stream_sid: streamSid,
        mark: { name: `mark-${Date.now()}` },
      });
    };

    const speak = async (text) => {
      console.log(`[exotel ${id}] BOT: ${text}`);
      try {
        const pcm = await sarvam.ttsHindi(text, { speaker: 'anushka' });
        await sendPcm(pcm);
      } catch (e) {
        console.error(`[exotel ${id}] TTS fail`, e.message);
      }
    };

    const ensureLead = () => {
      if (leadId) return;
      const lead = store.createLead({
        caller_phone: from || '',
        call_sid: callSid || id,
        source: 'exotel-india',
        status: 'in_progress',
      });
      leadId = lead.id;
    };

    const handleUserText = async (text) => {
      if (!text || busy) return;
      busy = true;
      try {
        ensureLead();
        console.log(`[exotel ${id}] USER: ${text}`);
        store.logEvent({
          leadId,
          callSid,
          step,
          userSaid: text,
        });
        const result = flow.applyAnswer(step, text, state);
        const bot = result.reprompt
          ? result.repromptText || flow.promptForStep(result.nextStep, result.state)
          : (result.botPrefix || '') + flow.promptForStep(result.nextStep, result.state);
        state = result.state;
        step = result.nextStep;
        store.saveSession(callSid || id, { leadId, step, state });
        store.updateLead(leadId, {
          ...flow.toLeadFields(state),
          status: step === flow.STEPS.DONE ? 'new' : 'in_progress',
        });
        store.logEvent({ leadId, callSid, step, botSaid: bot });
        await speak(bot);
        if (step === flow.STEPS.DONE) {
          setTimeout(() => {
            try {
              ws.close();
            } catch {
              /* */
            }
          }, 1500);
        }
      } finally {
        busy = false;
        mediaBuf = [];
        mediaBytes = 0;
      }
    };

    // After greeting, listen windows
    let listenTimer = null;
    const scheduleListenFlush = () => {
      if (listenTimer) clearTimeout(listenTimer);
      listenTimer = setTimeout(async () => {
        if (busy || mediaBytes < 8000) return; // ~0.5s min
        const pcm = Buffer.concat(mediaBuf);
        mediaBuf = [];
        mediaBytes = 0;
        try {
          const text = await sarvam.sttHindi(pcm);
          if (text && text.trim()) await handleUserText(text.trim());
        } catch (e) {
          console.error(`[exotel ${id}] STT fail`, e.message);
        }
      }, 2200);
    };

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const ev = msg.event;

      if (ev === 'connected') {
        console.log(`[exotel ${id}] event=connected`);
        return;
      }

      if (ev === 'start') {
        streamSid = msg.stream_sid || msg.start?.stream_sid || '';
        callSid = msg.start?.call_sid || streamSid || id;
        from = msg.start?.from || msg.start?.custom_parameters?.from || '';
        state = flow.startSessionState(from);
        step = flow.STEPS.ASK_INTENT;
        ensureLead();
        store.saveSession(callSid, { leadId, step, state });
        console.log(`[exotel ${id}] start call=${callSid} from=${from}`);
        const greet = flow.greetingText();
        store.logEvent({ leadId, callSid, step: flow.STEPS.GREETING, botSaid: greet });
        await speak(greet);
        return;
      }

      if (ev === 'media' && msg.media?.payload) {
        if (busy) return;
        const chunk = Buffer.from(msg.media.payload, 'base64');
        mediaBuf.push(chunk);
        mediaBytes += chunk.length;
        // ~3 sec audio buffer then flush
        if (mediaBytes >= 8000 * 2 * 3) {
          scheduleListenFlush();
        } else {
          scheduleListenFlush();
        }
        return;
      }

      if (ev === 'dtmf' && msg.dtmf?.digit) {
        await handleUserText(String(msg.dtmf.digit));
        return;
      }

      if (ev === 'stop') {
        console.log(`[exotel ${id}] stop`);
        if (leadId) {
          store.updateLead(leadId, {
            ...flow.toLeadFields(state),
            status: step === flow.STEPS.DONE ? 'new' : 'incomplete',
          });
        }
        closed = true;
        return;
      }
    });

    ws.on('close', () => {
      closed = true;
      console.log(`[exotel ${id}] closed`);
    });

    ws.on('error', (e) => console.error(`[exotel ${id}] error`, e.message));
  });

  console.log('Exotel Voicebot WS: /exotel/ws');
  return wss;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { attachExotelWs };
