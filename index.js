require('dotenv').config();
const express = require('express');
const fetch   = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function sendSMS(from, to, message) {
  const res = await fetch(
    `https://api.bird.com/workspaces/${process.env.BIRD_WORKSPACE_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `AccessKey ${process.env.BIRD_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receiver: { contacts: [{ identifierValue: to }] },
        body: { type: 'sms', sms: { text: message } },
        sender: { identifierValue: from }
      })
    }
  );
  return res.json();
}

app.post('/missed-call', async (req, res) => {
  const caller = req.body.from || req.body.From;
  const ourNum = req.body.to   || req.body.To;

  const { data: biz } = await db
    .from('businesses')
    .select('*')
    .eq('bird_number', ourNum)
    .eq('active', true)
    .single();

  if (biz) {
    const msg = biz.sms_template
      .replace('{name}', biz.name)
      .replace('{url}',  biz.booking_url);

    await sendSMS(ourNum, caller, msg);

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