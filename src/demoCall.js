/**
 * Terminal demo of Hindi call flow (no phone needed)
 * Usage: npm run demo
 */
const readline = require('readline');
const flow = require('./callFlow');
const store = require('./leadStore');
const config = require('./config');

async function main() {
  console.log(`\n=== ${config.businessName} | Demo Call (${config.agentName}) ===\n`);
  const callSid = `cli-${Date.now()}`;
  const lead = store.createLead({
    caller_phone: config.businessPhone,
    call_sid: callSid,
    source: 'cli-demo',
    status: 'in_progress',
  });
  let state = flow.startSessionState(config.businessPhone);
  let step = flow.STEPS.ASK_INTENT;

  const bot0 = flow.greetingText();
  console.log(`Priya: ${bot0}\n`);
  store.logEvent({ leadId: lead.id, callSid, step: flow.STEPS.GREETING, botSaid: bot0 });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  while (step !== flow.STEPS.DONE) {
    const user = await ask('Customer: ');
    if (!user.trim()) continue;
    if (['exit', 'quit', 'band'].includes(user.trim().toLowerCase())) break;

    const result = flow.applyAnswer(step, user, state);
    const bot = result.reprompt
      ? result.repromptText || flow.promptForStep(result.nextStep, result.state)
      : (result.botPrefix || '') + flow.promptForStep(result.nextStep, result.state);

    store.logEvent({
      leadId: lead.id,
      callSid,
      step,
      userSaid: user,
      botSaid: bot,
    });
    state = result.state;
    step = result.nextStep;
    store.updateLead(lead.id, {
      ...flow.toLeadFields(state),
      status: step === flow.STEPS.DONE ? 'new' : 'in_progress',
    });
    console.log(`\nPriya: ${bot}\n`);
  }

  const final = store.getLead(lead.id);
  console.log('--- Lead saved ---');
  console.log(JSON.stringify(final, null, 2));
  console.log(`\nDashboard: http://localhost:${config.port}`);
  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
