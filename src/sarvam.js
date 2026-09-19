const fs = require('fs');
const path = require('path');
const config = require('./config');

const SARVAM_TTS = 'https://api.sarvam.ai/text-to-speech';
const SARVAM_STT = 'https://api.sarvam.ai/speech-to-text';

function apiKey() {
  return config.sarvamApiKey || process.env.SARVAM_API_KEY || '';
}

/**
 * Hindi TTS → raw PCM 16-bit LE mono 8kHz Buffer
 * Sarvam returns base64 WAV in audios[]
 */
async function ttsHindi(text, { speaker = 'anushka' } = {}) {
  const key = apiKey();
  if (!key) throw new Error('SARVAM_API_KEY missing');

  const res = await fetch(SARVAM_TTS, {
    method: 'POST',
    headers: {
      'api-subscription-key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: [String(text).slice(0, 500)],
      target_language_code: 'hi-IN',
      speaker,
      pitch: 0,
      pace: 0.95,
      loudness: 1.1,
      speech_sample_rate: 8000,
      enable_preprocessing: true,
      model: 'bulbul:v2',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Sarvam TTS ${res.status}`);
  }
  const b64 = data.audios && data.audios[0];
  if (!b64) throw new Error('Sarvam TTS empty audio');
  const wav = Buffer.from(b64, 'base64');
  return wavToPcm16(wav);
}

/** Strip WAV header if present → PCM */
function wavToPcm16(buf) {
  if (buf.length > 44 && buf.toString('ascii', 0, 4) === 'RIFF') {
    // find 'data' chunk
    let i = 12;
    while (i < buf.length - 8) {
      const id = buf.toString('ascii', i, i + 4);
      const size = buf.readUInt32LE(i + 4);
      if (id === 'data') return buf.subarray(i + 8, i + 8 + size);
      i += 8 + size;
    }
    return buf.subarray(44);
  }
  return buf;
}

/**
 * STT Hindi from raw PCM 8kHz or wav buffer
 */
async function sttHindi(pcmOrWavBuffer) {
  const key = apiKey();
  if (!key) throw new Error('SARVAM_API_KEY missing');

  // wrap PCM as minimal WAV for upload
  const wav = pcmToWav(pcmOrWavBuffer, 8000);
  const tmp = path.join(__dirname, '..', 'data', `stt-${Date.now()}.wav`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, wav);

  try {
    const form = new FormData();
    const blob = new Blob([wav], { type: 'audio/wav' });
    form.append('file', blob, 'audio.wav');
    form.append('language_code', 'hi-IN');
    form.append('model', 'saarika:v2');

    const res = await fetch(SARVAM_STT, {
      method: 'POST',
      headers: { 'api-subscription-key': key },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `Sarvam STT ${res.status}`);
    }
    return data.transcript || data.text || '';
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function pcmToWav(pcm, sampleRate = 8000) {
  // if already wav
  if (pcm.length > 12 && pcm.toString('ascii', 0, 4) === 'RIFF') return pcm;
  const dataSize = pcm.length;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  pcm.copy(buf, 44);
  return buf;
}

module.exports = { ttsHindi, sttHindi, wavToPcm16, pcmToWav };
