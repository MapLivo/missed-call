require('dotenv').config();
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const recentCalls = new Map();

async function sendSMS(from, to, message) {
  const res = await fetch(
    `https://api.bird.com/workspaces/${process.env.BIRD_WORKSPACE_ID}/channels/${process.env.BIRD_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `AccessKey ${process.env.BIRD_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receiver: {
          contacts: [{ identifierValue: to }]
        },
        body: {
          type: 'text',
          text: { text: message }
        },
        sender: {
          connector: {
            identifierValue: from
          }
        }
      })
    }
  );
  const data = await res.json();
  console.log('SMS response status:', res.status, JSON.stringify(data));
  return data;
}

app.post('/missed-call', async (req, res) => {
  const payload = req.body.payload || req.body;
  const caller  = payload.from;
  const ourNum  = payload.to;
  const status  = payload.status;

  console.log('caller:', caller, 'ourNum:', ourNum, 'status:', status);

  if (!caller || !ourNum || status !== 'no-answer') {
    res.sendStatus(200);
    return;
  }

  const key = `${caller}-${ourNum}`;
  const lastTime = recentCalls.get(key);
  const now = Date.now();

  if (lastTime && now - lastTime < 60000) {
    console.log('duplicate within 60s, skipping');
    res.sendStatus(200);
    return;
  }
  recentCalls.set(key, now);

  const { data: biz } = await db
    .from('businesses')
    .select('*')
    .eq('bird_number', ourNum)
    .eq('active', true)
    .single();

  console.log('biz found:', !!biz);

  if (biz) {
    const msg = biz.sms_template
      .replace('{name}', biz.name)
      .replace('{url}',  biz.booking_url);
    const smsResult = await sendSMS(ourNum, caller, msg);
    console.log('smsResult:', JSON.stringify(smsResult));
    await db.from('message_logs').insert({
      business_id: biz.id,
      caller_number: caller,
      type: 'missed_call'
    });
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT, () =>
  console.log('Running on port', process.env.PORT)
);