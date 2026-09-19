/**
 * Hindi AI receptionist flow for Lashkari Properties
 * Agent: Priya
 */

const config = require('./config');

const INTENTS = {
  BUY: 'kharidna',
  RENT: 'kiraya',
  SELL: 'bechna',
  OTHER: 'anya',
};

const STEPS = {
  GREETING: 'greeting',
  ASK_NAME: 'ask_name',
  ASK_INTENT: 'ask_intent',
  // buy / rent
  ASK_LOCATION: 'ask_location',
  ASK_BUDGET: 'ask_budget',
  ASK_SIZE: 'ask_size',
  ASK_PROPERTY_TYPE: 'ask_property_type',
  // sell
  ASK_SELL_ADDRESS: 'ask_sell_address',
  ASK_BUILT_AREA: 'ask_built_area',
  ASK_AGE: 'ask_age',
  ASK_FACING: 'ask_facing',
  ASK_SALE_PRICE: 'ask_sale_price',
  ASK_EXPECTED_RENT: 'ask_expected_rent',
  // common
  ASK_NOTES: 'ask_notes',
  CONFIRM: 'confirm',
  DONE: 'done',
};

function greetingText() {
  return `नमस्ते, मैं ${config.agentName}, ${config.businessName} से बोल रही हूँ। आपकी कैसे सहायता कर सकती हूँ?`;
}

function normalize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[।.?!,\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectIntent(text) {
  const t = normalize(text);

  const sellKeys = [
    'bech', 'bechna', 'sell', 'selling', 'बिक', 'बेच', 'बेचना', 'बेचनी', 'बेचने',
    'property bech', 'ghar bech', 'makaan bech', 'फ्लैट बेच', 'घर बेच',
  ];
  const buyKeys = [
    'kharid', 'kharidna', 'buy', 'buying', 'purchase', 'खरीद', 'खरीदना', 'लेना चाह',
    'makaan chahiye', 'ghar chahiye', 'flat chahiye', 'घर चाहिए', 'मकान चाहिए', 'फ्लैट चाहिए',
  ];
  const rentKeys = [
    'kiraya', 'bhada', 'rent', 'rental', 'tenant', 'किराया', 'भाड़ा', 'किराये', 'किराए',
    'on rent', 'rent pe', 'किराए पर', 'किराये पर',
  ];

  if (sellKeys.some((k) => t.includes(k))) return INTENTS.SELL;
  if (rentKeys.some((k) => t.includes(k))) return INTENTS.RENT;
  if (buyKeys.some((k) => t.includes(k))) return INTENTS.BUY;

  // Hindi phonetic latin mixes
  if (/\b(rent|kiraye|kiraya|bhada)\b/.test(t)) return INTENTS.RENT;
  if (/\b(sell|bech)\b/.test(t)) return INTENTS.SELL;
  if (/\b(buy|kharid)\b/.test(t)) return INTENTS.BUY;

  return null;
}

function isSkip(text) {
  const t = normalize(text);
  return ['nahi', 'na', 'no', 'skip', 'next', 'pata nahi', 'maloom nahi', 'नहीं', 'नही', 'स्किप', 'पता नहीं'].some(
    (k) => t === k || t.includes(k),
  );
}

function isYes(text) {
  const t = normalize(text);
  return ['haan', 'han', 'ha', 'yes', 'sahi', 'theek', 'ok', 'okay', 'bilkul', 'हाँ', 'हां', 'सही', 'ठीक'].some(
    (k) => t === k || t.startsWith(k + ' ') || t === k,
  );
}

function isNo(text) {
  const t = normalize(text);
  return ['nahi', 'na', 'no', 'galat', 'नहीं', 'नही', 'गलत'].some((k) => t === k || t.startsWith(k));
}

function extractName(text) {
  let t = String(text || '').trim();
  t = t
    .replace(/^(mera naam|main|mai|my name is|naam hai|मैं|मेरा नाम|नाम है)\s+/i, '')
    .replace(/[।.]+$/g, '')
    .trim();
  if (t.length < 2) return '';
  // Keep first 4 words max as name
  return t.split(/\s+/).slice(0, 4).join(' ');
}

function intentLabel(intent) {
  switch (intent) {
    case INTENTS.BUY:
      return 'मकान / प्रॉपर्टी खरीदना';
    case INTENTS.RENT:
      return 'किराए पर प्रॉपर्टी';
    case INTENTS.SELL:
      return 'प्रॉपर्टी बेचना';
    default:
      return 'अन्य जानकारी';
  }
}

function nextStepsForIntent(intent) {
  if (intent === INTENTS.SELL) {
    return [
      STEPS.ASK_SELL_ADDRESS,
      STEPS.ASK_BUILT_AREA,
      STEPS.ASK_AGE,
      STEPS.ASK_FACING,
      STEPS.ASK_SALE_PRICE,
      STEPS.ASK_EXPECTED_RENT,
      STEPS.ASK_PROPERTY_TYPE,
      STEPS.ASK_NOTES,
      STEPS.CONFIRM,
      STEPS.DONE,
    ];
  }
  // buy or rent or other treated as demand-side
  return [
    STEPS.ASK_LOCATION,
    STEPS.ASK_BUDGET,
    STEPS.ASK_SIZE,
    STEPS.ASK_PROPERTY_TYPE,
    STEPS.ASK_NOTES,
    STEPS.CONFIRM,
    STEPS.DONE,
  ];
}

function promptForStep(step, state = {}) {
  const name = state.customer_name ? `${state.customer_name} जी, ` : '';
  switch (step) {
    case STEPS.GREETING:
      return greetingText();
    case STEPS.ASK_NAME:
      return 'कृपया अपना पूरा नाम बताइए।';
    case STEPS.ASK_INTENT:
      return `${name}आप मकान खरीदना चाहते हैं, किराए पर लेना चाहते हैं, या अपनी प्रॉपर्टी बेचना चाहते हैं?`;
    case STEPS.ASK_LOCATION:
      return `${name}आप किस शहर या एरिया में प्रॉपर्टी देखना चाहते हैं?`;
    case STEPS.ASK_BUDGET:
      return state.intent === INTENTS.RENT
        ? `${name}आपका किराया बजट लगभग कितना है?`
        : `${name}आपका बजट लगभग कितना है?`;
    case STEPS.ASK_SIZE:
      return `${name}आपको कितने बी एच के का मकान चाहिए? जैसे 1 BHK, 2 BHK, 3 BHK।`;
    case STEPS.ASK_PROPERTY_TYPE:
      return `${name}प्रॉपर्टी किस प्रकार की है या चाहिए? फ्लैट, प्लॉट, दुकाान, या इंडिपेंडेंट हाउस?`;
    case STEPS.ASK_SELL_ADDRESS:
      return `${name}कृपया बताइए आपकी प्रॉपर्टी कहाँ स्थित है — शहर, एरिया और अगर पता हो तो पूरा एड्रेस।`;
    case STEPS.ASK_BUILT_AREA:
      return `${name}मकान या फ्लैट कितना बना हुआ है? जैसे कितने स्क्वेयर फीट या कितने बीघा।`;
    case STEPS.ASK_AGE:
      return `${name}प्रॉपर्टी कितने साल पुरानी है?`;
    case STEPS.ASK_FACING:
      return `${name}मकान की दिशा क्या है? जैसे पूर्व, पश्चिम, उत्तर, दक्षिण फेसिंग।`;
    case STEPS.ASK_SALE_PRICE:
      return `${name}आप किस कीमत पर बेचना चाहते हैं?`;
    case STEPS.ASK_EXPECTED_RENT:
      return `${name}अगर किराए पर दें तो लगभग कितना किराया आ सकता है? अगर पता नहीं तो कह दीजिए पता नहीं।`;
    case STEPS.ASK_NOTES:
      return `${name}कोई और खास जरूरत या डिटेल बताना चाहेंगे? नहीं तो बोलिए नहीं।`;
    case STEPS.CONFIRM:
      return buildSummary(state) + ' क्या यह जानकारी सही है? हाँ या नहीं में बताइए।';
    case STEPS.DONE:
      return `धन्यवाद ${state.customer_name || 'जी'}। ${config.businessName} की टीम जल्द आपसे संपर्क करेगी। नमस्ते।`;
    default:
      return 'कृपया दोबारा बताइए।';
  }
}

function buildSummary(state) {
  const parts = [];
  if (state.customer_name) parts.push(`नाम ${state.customer_name}`);
  if (state.intent) parts.push(`जरूरत ${intentLabel(state.intent)}`);
  if (state.location) parts.push(`लोकेशन ${state.location}`);
  if (state.budget) parts.push(`बजट ${state.budget}`);
  if (state.size_bhk) parts.push(`साइज़ ${state.size_bhk}`);
  if (state.property_type) parts.push(`टाइप ${state.property_type}`);
  if (state.property_address) parts.push(`पता ${state.property_address}`);
  if (state.built_area) parts.push(`बना हुआ ${state.built_area}`);
  if (state.age_years) parts.push(`उम्र ${state.age_years}`);
  if (state.facing) parts.push(`दिशा ${state.facing}`);
  if (state.sale_price) parts.push(`सेल प्राइस ${state.sale_price}`);
  if (state.expected_rent) parts.push(`अपेक्षित किराया ${state.expected_rent}`);
  if (state.extra_notes) parts.push(`नोट ${state.extra_notes}`);
  if (!parts.length) return 'मैंने आपकी जानकारी नोट कर ली है।';
  return `मैंने नोट किया: ${parts.join(', ')}।`;
}

function applyAnswer(step, speech, state) {
  const text = String(speech || '').trim();
  const next = { ...state, last_user: text };
  const transcript = [...(state.transcript || [])];
  if (text) transcript.push({ role: 'user', step, text });
  next.transcript = transcript;

  switch (step) {
    case STEPS.GREETING:
    case STEPS.ASK_INTENT: {
      const intent = detectIntent(text);
      if (intent) {
        next.intent = intent;
        next.requirement = intentLabel(intent);
        next.queue = nextStepsForIntent(intent);
        // name first if missing
        if (!next.customer_name) {
          return { state: next, nextStep: STEPS.ASK_NAME, reprompt: false };
        }
        return { state: next, nextStep: next.queue.shift(), reprompt: false };
      }
      // If greeting and unclear, ask intent
      return {
        state: next,
        nextStep: STEPS.ASK_INTENT,
        reprompt: step === STEPS.ASK_INTENT,
        repromptText:
          'समझ नहीं पाया। कृपया साफ बताइए — खरीदना, किराया, या बेचना?',
      };
    }
    case STEPS.ASK_NAME: {
      const name = extractName(text);
      if (!name) {
        return {
          state: next,
          nextStep: STEPS.ASK_NAME,
          reprompt: true,
          repromptText: 'नाम साफ नहीं सुनाई दिया। कृपया अपना नाम दोबारा बोलिए।',
        };
      }
      next.customer_name = name;
      if (!next.intent) {
        return { state: next, nextStep: STEPS.ASK_INTENT, reprompt: false };
      }
      if (!next.queue || !next.queue.length) {
        next.queue = nextStepsForIntent(next.intent);
      }
      return { state: next, nextStep: next.queue.shift(), reprompt: false };
    }
    case STEPS.ASK_LOCATION:
      next.location = text;
      break;
    case STEPS.ASK_BUDGET:
      next.budget = text;
      break;
    case STEPS.ASK_SIZE:
      next.size_bhk = text;
      break;
    case STEPS.ASK_PROPERTY_TYPE:
      next.property_type = text;
      break;
    case STEPS.ASK_SELL_ADDRESS:
      next.property_address = text;
      if (!next.location) next.location = text;
      break;
    case STEPS.ASK_BUILT_AREA:
      next.built_area = isSkip(text) ? 'पता नहीं' : text;
      break;
    case STEPS.ASK_AGE:
      next.age_years = isSkip(text) ? 'पता नहीं' : text;
      break;
    case STEPS.ASK_FACING:
      next.facing = isSkip(text) ? 'पता नहीं' : text;
      break;
    case STEPS.ASK_SALE_PRICE:
      next.sale_price = text;
      break;
    case STEPS.ASK_EXPECTED_RENT:
      next.expected_rent = isSkip(text) ? 'पता नहीं' : text;
      break;
    case STEPS.ASK_NOTES:
      next.extra_notes = isSkip(text) || isNo(text) ? '' : text;
      break;
    case STEPS.CONFIRM:
      if (isYes(text)) {
        return { state: next, nextStep: STEPS.DONE, reprompt: false };
      }
      if (isNo(text)) {
        // restart details based on intent
        next.queue = nextStepsForIntent(next.intent || INTENTS.OTHER);
        return {
          state: next,
          nextStep: next.queue.shift(),
          reprompt: false,
          botPrefix: 'कोई बात नहीं, दोबारा लेते हैं। ',
        };
      }
      return {
        state: next,
        nextStep: STEPS.CONFIRM,
        reprompt: true,
        repromptText: 'कृपया हाँ या नहीं में बताइए।',
      };
    case STEPS.DONE:
      return { state: next, nextStep: STEPS.DONE, reprompt: false };
    default:
      break;
  }

  if (!next.queue) next.queue = nextStepsForIntent(next.intent || INTENTS.OTHER);
  // remove current step if still in queue head somehow
  next.queue = (next.queue || []).filter((s) => s !== step);
  const nextStep = next.queue.length ? next.queue.shift() : STEPS.CONFIRM;
  return { state: next, nextStep, reprompt: false };
}

function startSessionState(callerPhone = '') {
  return {
    caller_phone: callerPhone,
    customer_name: '',
    intent: '',
    requirement: '',
    location: '',
    budget: '',
    size_bhk: '',
    property_type: '',
    property_address: '',
    built_area: '',
    age_years: '',
    facing: '',
    expected_rent: '',
    sale_price: '',
    extra_notes: '',
    queue: [],
    transcript: [],
  };
}

function toLeadFields(state) {
  return {
    caller_phone: state.caller_phone || '',
    customer_name: state.customer_name || '',
    intent: state.intent || '',
    requirement: state.requirement || intentLabel(state.intent),
    location: state.location || '',
    budget: state.budget || '',
    size_bhk: state.size_bhk || '',
    property_type: state.property_type || '',
    property_address: state.property_address || '',
    built_area: state.built_area || '',
    age_years: state.age_years || '',
    facing: state.facing || '',
    expected_rent: state.expected_rent || '',
    sale_price: state.sale_price || '',
    extra_notes: state.extra_notes || '',
    raw_transcript: (state.transcript || [])
      .map((t) => `${t.role}/${t.step}: ${t.text}`)
      .join('\n'),
  };
}

module.exports = {
  INTENTS,
  STEPS,
  greetingText,
  detectIntent,
  promptForStep,
  applyAnswer,
  startSessionState,
  toLeadFields,
  buildSummary,
  intentLabel,
};
