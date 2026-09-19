"""
Lashkari Properties — Hindi AI phone agent (Exotel + Sarvam via Pipecat)
Call India number → Priya answers → lead details collect → optional save to dashboard API
"""
import json
import os
import re
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from loguru import logger

from pipecat.frames.frames import LLMRunFrame, TranscriptionFrame, TextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.sarvam.stt import SarvamSTTService
from pipecat.services.sarvam.tts import SarvamTTSService
from pipecat.services.sarvam.llm import SarvamLLMService
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams

load_dotenv(override=True)

BUSINESS = os.getenv("BUSINESS_NAME", "Lashkari Properties")
AGENT = os.getenv("AGENT_NAME", "Priya")
LEAD_API = (os.getenv("LEAD_API_URL") or "http://127.0.0.1:5050").rstrip("/")
LEAD_PASS = os.getenv("LEAD_API_PASSWORD", "lashkari123")

SYSTEM_PROMPT = f"""आप {AGENT} हैं, {BUSINESS} की हिंदी AI receptionist।
आप फोन पर बात कर रही हैं। जवाब छोटे, साफ़ और विनम्र रखें (1-3 वाक्य)।

शुरुआत में नमस्ते कहें:
"नमस्ते, मैं {AGENT}, {BUSINESS} से बोल रही हूँ। आपकी कैसे सहायता कर सकती हूँ?"

क्रम से जानकारी लें (एक बार में एक-दो सवाल):
1) पूरा नाम
2) जरूरत: खरीदना / किराया / बेचना
3) अगर खरीदना या किराया:
   - शहर/एरिया (location)
   - बजट
   - साइज़ (1/2/3 BHK)
   - प्रॉपर्टी टाइप (फ्लैट/प्लॉट/दुकान/हाउस)
4) अगर बेचना:
   - प्रॉपर्टी कहाँ है (पता/एरिया)
   - कितना बना है (area)
   - कितने साल पुरानी
   - दिशा/facing
   - सेल प्राइस
   - अगर किराए पर दें तो expected rent
5) कोई और नोट

जब ज़रूरी डिटेल मिल जाएँ तो सारांश दोहराएँ और कन्फर्म करें।
आखिर में कहें टीम जल्द संपर्क करेगी, धन्यवाद नमस्ते।

Hinglish भी समझें। अस्पष्ट हो तो दोबारा पूछें।
संवेदनशील OTP/पासवर्ड न माँगें।
"""


class LeadCaptureProcessor(FrameProcessor):
    """Collects transcript; on call end posts lead to local dashboard API."""

    def __init__(self):
        super().__init__()
        self.lines = []
        self.caller = ""
        self.call_sid = ""

    async def process_frame(self, frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and frame.text:
            self.lines.append({"role": "user", "text": frame.text})
        # assistant text frames vary by version; TextFrame often used
        if isinstance(frame, TextFrame) and getattr(frame, "text", None):
            # may include both; keep short assistant-ish lines
            t = frame.text.strip()
            if t and len(t) < 500:
                self.lines.append({"role": "bot", "text": t})

        await self.push_frame(frame, direction)

    async def flush_lead(self):
        if not self.lines:
            return
        transcript = "\n".join(f"{x['role']}: {x['text']}" for x in self.lines)
        # crude field hints from transcript
        blob = transcript.lower()
        intent = ""
        if any(k in blob for k in ["बेच", "bech", "sell"]):
            intent = "bechna"
        elif any(k in blob for k in ["किरा", "kiraya", "rent", "भाड़ा"]):
            intent = "kiraya"
        elif any(k in blob for k in ["खरीद", "kharid", "buy"]):
            intent = "kharidna"

        name = ""
        m = re.search(r"(?:naam|name|नाम)[^\n:]{0,10}[:\s]+([A-Za-z\u0900-\u097F ]{2,40})", transcript, re.I)
        if m:
            name = m.group(1).strip()

        payload = {
            "caller_phone": self.caller or "",
            "customer_name": name,
            "intent": intent,
            "requirement": intent,
            "extra_notes": transcript[:4000],
            "raw_transcript": transcript[:8000],
            "source": "exotel",
            "status": "new",
            "call_sid": self.call_sid or "",
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    f"{LEAD_API}/api/leads",
                    json=payload,
                    headers={"x-dashboard-password": LEAD_PASS},
                )
                logger.info(f"Lead save status={r.status_code} body={r.text[:200]}")
        except Exception as e:
            logger.warning(f"Lead save failed: {e}")
            # fallback local file
            path = os.path.join(os.path.dirname(__file__), "..", "data", "exotel_leads.jsonl")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "a", encoding="utf-8") as f:
                f.write(json.dumps({"ts": datetime.now(timezone.utc).isoformat(), **payload}, ensure_ascii=False) + "\n")


async def bot(runner_args: RunnerArguments):
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise RuntimeError("SARVAM_API_KEY missing in exotel-agent/.env")

    transport = await create_transport(
        runner_args,
        {
            "exotel": lambda: FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
            ),
        },
    )

    stt = SarvamSTTService(
        api_key=api_key,
        settings=SarvamSTTService.Settings(
            model="saaras:v3",
            language="hi-IN",
        ),
        mode="transcribe",
    )

    tts = SarvamTTSService(
        api_key=api_key,
        settings=SarvamTTSService.Settings(
            model="bulbul:v3",
            voice="priya",
            target_language_code="hi-IN",
            pace=1.0,
        ),
    )

    llm = SarvamLLMService(
        api_key=api_key,
        settings=SarvamLLMService.Settings(model="sarvam-m"),
    )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    context = LLMContext(messages)
    context_aggregator = LLMContextAggregatorPair(context)
    lead_cap = LeadCaptureProcessor()

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            lead_cap,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
        ),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Caller connected — starting Priya greeting")
        # try extract caller from client if available
        try:
            lead_cap.call_sid = str(getattr(client, "call_sid", "") or "")
            lead_cap.caller = str(getattr(client, "from_number", "") or getattr(client, "from", "") or "")
        except Exception:
            pass
        messages.append(
            {
                "role": "system",
                "content": "कॉल जुड़ गई है। अभी हिंदी में नमस्ते बोलकर सहायता पूछें।",
            }
        )
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Caller disconnected — saving lead")
        await lead_cap.flush_lead()
        await task.cancel()

    runner = PipelineRunner(handle_sigint=runner_args.handle_sigint)
    await runner.run(task)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
