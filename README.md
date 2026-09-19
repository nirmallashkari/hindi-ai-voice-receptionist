# 📞 Hindi AI Voice Receptionist & Inbound Lead CRM
> **An open-source, full-duplex AI voice assistant and receptionist with native Hindi & English conversational support. Features dual telephony integration for Exotel (India) and Twilio (Global), WebSockets audio streaming, and an automated lead CRM dashboard.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.21+-lightgrey.svg?logo=express&logoColor=white)](https://expressjs.com)
[![Telephony: Twilio](https://img.shields.io/badge/Telephony-Twilio-red.svg?logo=twilio&logoColor=white)](https://twilio.com)
[![Telephony: Exotel](https://img.shields.io/badge/Telephony-Exotel%20(India)-blue.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

---

## 🎯 The Problem
Small businesses, real estate consultants, clinics, and service providers miss **over 40% of inbound customer calls** after business hours or during peak times. Commercial voice AI services charge upwards of **$500–$2,000/month**.

**Hindi AI Voice Receptionist** provides a complete, self-hostable solution that answers phone calls 24/7 in natural Hindi and English, answers customer questions, qualifies leads, and logs contact details directly into a local CRM dashboard!

---

## ✨ Features

- 🇮🇳 **Bilingual Conversational AI:** Native Hindi (`hi-IN`) and English voice synthesis and speech-to-text recognition.
- 📱 **Dual Telephony Architecture:**
  - **Exotel:** Plug-and-play WebSocket streaming for low-latency Indian telephony (`/exotel/ws`).
  - **Twilio:** Standard TwiML webhook flow (`/voice/incoming`, `/voice/gather`).
- 👥 **Built-in Lead Capture CRM:** Automatically captures caller phone number, customer name, budget/inquiry details, and call recordings.
- 🖥️ **Live Web Dashboard:** Password-protected dashboard (`/`) to review inbound leads and playback call histories.
- ⚡ **Self-Hostable Anywhere:** Deploy to Render, Railway, Fly.io, AWS, or run locally using ngrok.

---

## 🏗️ Architecture

```text
Inbound Phone Call (User)
         │
         ▼
[ Exotel / Twilio Telephony ]
         │ (WebSockets / TwiML)
         ▼
[ Express Server (src/server.js) ]
  ├── callFlow.js       <-- Conversational state machine
  ├── exotelWs.js       <-- Real-time audio streaming
  ├── twilioHandler.js  <-- TwiML voice responses
  └── leadStore.js      <-- Lead database & persistence
         │
         ▼
[ Local Web Dashboard & CRM (public/index.html) ]
```

---

## 🚀 Quickstart

### 1. Clone the repository:
```bash
git clone https://github.com/nirmallashkari/hindi-ai-voice-receptionist.git
cd hindi-ai-voice-receptionist
```

### 2. Install dependencies:
```bash
npm install
```

### 3. Configure environment:
```bash
cp .env.example .env
```
Open `.env` and configure your credentials:
```env
PORT=3000
DASHBOARD_PASSWORD=your_secure_password
PUBLIC_BASE_URL=https://your-ngrok-or-domain.com

# Choose your provider (Twilio or Exotel)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
```

### 4. Start the server:
```bash
npm run dev
```

For local testing with public webhooks:
```bash
# In another terminal:
ngrok http 3000
```
Point your Twilio or Exotel webhook URL to `https://<your-ngrok-subdomain>.ngrok-free.app/voice/incoming` (or `/exotel/ws`).

---

## 📊 Web Dashboard

Open `http://localhost:3000` in your browser. Enter your `DASHBOARD_PASSWORD` to view real-time call logs, inquiry summaries, and customer contact information.

---

## 🤝 Contributing

Contributions to improve conversational flows, add more Indian regional languages (Tamil, Telugu, Bengali), or integrate with external CRMs (HubSpot, Zoho) are warmly welcomed!

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.

---

**Developed with ❤️ by [Nirmal Lashkari](https://github.com/nirmallashkari)**
