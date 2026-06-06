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