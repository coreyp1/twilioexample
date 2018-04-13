const sqlite = require('sqlite-async');
const http = require('http');
const Router = require('koa-better-router');
const Body = require('koa-body')
const path = require('path');
const url = require('url');
const twilio = require('twilio');

const port = 8887;

let Koa = require('koa');
let app = new Koa();
let router = Router().loadMethods();

/**
 * Body Parser
 */
app.use(Body());
app.use(router.middleware());

let db;



app.use(async function pageNotFound(ctx) {
  if (ctx.body)
    return;

  // we need to explicitly set 404 here
  // so that koa doesn't assign 200 on body=
  ctx.status = 404;

  switch (ctx.accepts('html', 'json')) {
    case 'html':
      ctx.type = 'html';
      ctx.body = '<p>Page Not Found</p>';
      break;
    case 'json':
      ctx.body = {
        message: 'Page Not Found'
      };
      break;
    default:
      ctx.type = 'text';
      ctx.body = 'Page Not Found';
  }
});

router.post('/call/incoming', async function(ctx, next) {
  console.log(`Call from: ${ctx.request.body.From}`);
  //console.log(ctx.request.body);

  // Ignore anonymous calls
  if (!ctx.request.body.From) {
    let resp = new twilio.twiml.VoiceResponse();
    resp.say({voice:'man', language:'en-gb'}, `My mommy told me not to talk to strangers!`);
    ctx.body = resp.toString();
    return;
  }

  // Load the data.
  let data = await getStats(ctx.request.body.From);

  // Increment the counter
  ++data.calls;

  // Insert/Update the data.
  await !data.number
    ? insertStats(ctx.request.body.From, data.calls, data.texts)
    : updateStats(ctx.request.body.From, data.calls, data.texts);

  // Create the response.
  let calltimes = (data.calls == 1) ? `1 time` : `${data.calls} times`;
  let texttimes = (data.texts == 1) ? `1 time` : `${data.texts} times`;
  const resp = new twilio.twiml.VoiceResponse();

  resp.say({voice:'man', language:'en-gb'}, `You have called this number ${calltimes}, and you have texted this number ${texttimes}.`);
  ctx.body = resp.toString();
});

router.post('/sms/incoming', async function(ctx, next) {
  console.log(`Text from: ${ctx.request.body.From}`);
  //console.log(ctx.request.body);

  // Ignore anonymous or unexpected texts
  if (!ctx.request.body.From/* || ctx.request.body.Body != '?'*/) {
    return;
  }

  // Load the data.
  let data = await getStats(ctx.request.body.From);

  // Increment the counter
  ++data.texts;

  // Insert/Update the data.
  await !data.number
    ? insertStats(ctx.request.body.From, data.calls, data.texts)
    : updateStats(ctx.request.body.From, data.calls, data.texts);

  // Create the response.
  let calltimes = (data.calls == 1) ? `1 time` : `${data.calls} times`;
  let texttimes = (data.texts == 1) ? `1 time` : `${data.texts} times`;
  const resp = new twilio.twiml.MessagingResponse();
  resp.message(`You have called this number ${calltimes}, and you have texted this number ${texttimes}.`);
  ctx.body = resp.toString();
});

async function initdb() {
  try {
    db = await sqlite.open(path.resolve(__dirname, '../phone.db'));
    await db.run(`CREATE TABLE IF NOT EXISTS interactions (
      number VARCHAR(12),
      calls INTEGER,
      texts INTEGER
    )`);
    await db.run(`CREATE INDEX IF NOT EXISTS number ON interactions(number)`);
  }
  catch (err) {
    return false;
  }
  return true;
}

async function getStats(number) {
  try {
    return await db.get(`SELECT number, calls, texts
      FROM interactions
      WHERE number = ?
      LIMIT 1`, number) || {calls: 0, texts: 0};
  }
  catch(err) {
    return {};
  }
}

async function insertStats(number, calls, texts) {
  try {
    return await db.run(`INSERT
      INTO interactions (number, calls, texts)
      VALUES (?, ?, ?)`, number, calls, texts);
  }
  catch(err) {
    return err;
  }
}

async function updateStats(number, calls, texts) {
  try {
    return await db.run(`UPDATE interactions
      SET calls = ?, texts = ?
      WHERE number = ?`, calls, texts, number);
  }
  catch(err) {
    return err;
  }
}

async function start() {
  if (!await initdb()) {
    console.error('Error initializing database.');
    console.error('Program exiting');
    return;
  }
  await app.listen(port);
  console.log(`Server listening on port ${port}`);
}
start();
