const twilio = require('twilio');
const config = require('../config');
const flow = require('../callFlow');
const store = require('../leadStore');

const VoiceResponse = twilio.twiml.VoiceResponse;

function gatherSpeech(vr, actionPath, prompt, { hints } = {}) {
  const gather = vr.gather({
    input: 'speech',
    language: 'hi-IN',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    enhanced: true,
    action: `${config.publicBaseUrl}${actionPath}`,
    method: 'POST',
    timeout: 6,
    hints: hints || 'खरीदना, किराया, बेचना, हाँ, नहीं, बजट, लोकेशन',
  });
  gather.say({ language: 'hi-IN', voice: 'Google.hi-IN-Wavenet-A' }, prompt);
  // if no input
  vr.say(
    { language: 'hi-IN', voice: 'Google.hi-IN-Wavenet-A' },
    'माफ़ कीजिए, आवाज़ नहीं सुनाई दी।',
  );
  vr.redirect({ method: 'POST' }, `${config.publicBaseUrl}${actionPath}?retry=1`);
}

function sayAndHangup(vr, text) {
  vr.say({ language: 'hi-IN', voice: 'Google.hi-IN-Wavenet-A' }, text);
  vr.hangup();
}

function ensureSession(callSid, from) {
  let session = store.getSession(callSid);
  if (session) return session;

  const lead = store.createLead({
    caller_phone: from || '',
    call_sid: callSid,
    source: 'voice',
    status: 'in_progress',
  });
  const state = flow.startSessionState(from || '');
  store.saveSession(callSid, {
    leadId: lead.id,
    step: flow.STEPS.GREETING,
    state,
  });
  return store.getSession(callSid);
}

function persistLeadFromState(leadId, state, status) {
  const fields = flow.toLeadFields(state);
  if (status) fields.status = status;
  return store.updateLead(leadId, fields);
}

function handleIncoming(req) {
  const callSid = req.body.CallSid || `local-${Date.now()}`;
  const from = req.body.From || '';
  const session = ensureSession(callSid, from);
  const vr = new VoiceResponse();

  const prompt = flow.promptForStep(flow.STEPS.GREETING, session.state);
  store.logEvent({
    leadId: session.leadId,
    callSid,
    step: flow.STEPS.GREETING,
    botSaid: prompt,
  });
  // After greeting, collect free speech (intent often in first reply)
  store.saveSession(callSid, { step: flow.STEPS.ASK_INTENT, state: session.state });
  gatherSpeech(vr, '/voice/gather', prompt);
  return vr.toString();
}

function handleGather(req) {
  const callSid = req.body.CallSid || req.query.callSid || `local-${Date.now()}`;
  const speech =
    req.body.SpeechResult ||
    req.body.UnstableSpeechResult ||
    req.body.speech ||
    '';
  const digits = req.body.Digits || '';
  const userText = (speech || digits || '').trim();
  const retry = req.query.retry === '1';

  let session = store.getSession(callSid);
  if (!session) {
    session = ensureSession(callSid, req.body.From || '');
  }

  const vr = new VoiceResponse();
  const currentStep = session.step || flow.STEPS.ASK_INTENT;

  if (!userText) {
    const again = flow.promptForStep(currentStep, session.state);
    store.logEvent({
      leadId: session.leadId,
      callSid,
      step: currentStep,
      userSaid: '',
      botSaid: again,
      meta: { retry: true },
    });
    if (retry) {
      // second miss -> ask to call again later
      sayAndHangup(
        vr,
        'क्षमा कीजिए, कनेक्शन में समस्या लग रही है। कृपया थोड़ी देर बाद दोबारा कॉल करें। धन्यवाद।',
      );
      persistLeadFromState(session.leadId, session.state, 'incomplete');
      return vr.toString();
    }
    gatherSpeech(vr, '/voice/gather', again);
    return vr.toString();
  }

  const result = flow.applyAnswer(currentStep, userText, session.state || {});
  let botText = result.reprompt
    ? result.repromptText || flow.promptForStep(result.nextStep, result.state)
    : (result.botPrefix || '') + flow.promptForStep(result.nextStep, result.state);

  store.logEvent({
    leadId: session.leadId,
    callSid,
    step: currentStep,
    userSaid: userText,
    botSaid: botText,
  });

  store.saveSession(callSid, {
    leadId: session.leadId,
    step: result.nextStep,
    state: result.state,
  });

  if (result.nextStep === flow.STEPS.DONE) {
    persistLeadFromState(session.leadId, result.state, 'new');
    store.logEvent({
      leadId: session.leadId,
      callSid,
      step: flow.STEPS.DONE,
      botSaid: botText,
    });
    sayAndHangup(vr, botText);
    return vr.toString();
  }

  // keep lead updated live
  persistLeadFromState(session.leadId, result.state, 'in_progress');
  gatherSpeech(vr, '/voice/gather', botText);
  return vr.toString();
}

module.exports = {
  handleIncoming,
  handleGather,
};
