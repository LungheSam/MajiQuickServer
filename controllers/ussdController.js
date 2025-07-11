
const { sendSMS } = require('../services/africasTalking');
const db = require('../services/firebaseAdmin');

function handleUSSD(req, res) {
  const { sessionId, phoneNumber, text } = req.body;
  const input = text.split('*');
  const level = input.length;

  let response = '';

  // Step 1: Initial Menu
  if (text === '') {
    response = `CON Welcome to MajiQuick
1. Buy Water
2. Check Balance`;
  }

  // Step 2: Buy Water Flow
  else if (text === '1') {
    response = 'CON Enter number of jerrycans:';
  }

  // Step 3: Process Purchase
  else if (level === 2 && input[0] === '1') {
    const jerrycans = parseInt(input[1]);
    const cost = jerrycans * 100;
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const purchase = {
      phone: phoneNumber,
      jerrycans,
      remaining: jerrycans,
      cost,
      code,
      status: 'active', // can be active, partially used, fully used
      fetchHistory: [],
      timestamp: new Date()
    };

    db.collection('purchases').add(purchase)
      .then(() => {
        const msg = `MajiQuick:\nYou bought ${jerrycans} jerrycans.\nCode: ${code}`;
        sendSMS(phoneNumber, msg);
        response = `END You bought ${jerrycans} jerrycans.
Code: ${code}
Cost: ${cost} UGX
Thank you for using MajiQuick.`;
        res.set('Content-Type', 'text/plain');
        res.send(response);
      })
      .catch(err => {
        console.error('❌ Firestore Error (Buy):', err);
        res.send('END System error. Try again.');
      });
    return;
  }

  // Step 4: Check Balance Flow
  else if (text === '2') {
    response = 'CON Enter your 6-digit code:';
  }

  // Step 5: Handle Code Lookup for Balance
  else if (level === 2 && input[0] === '2') {
    const userCode = input[1];

    db.collection('purchases')
      .where('code', '==', userCode)
      .where('phone', '==', phoneNumber)
      .limit(1)
      .get()
      .then(snapshot => {
        if (snapshot.empty) {
          response = 'END Invalid or expired code.';
        } else {
          const doc = snapshot.docs[0].data();
          const statusText = doc.remaining === 0
            ? 'fully used'
            : doc.remaining < doc.jerrycans
              ? 'partially used'
              : 'unused';

          response = `END Code: ${doc.code}
🪣 Remaining: ${doc.remaining}/${doc.jerrycans}
💰 Cost: ${doc.cost} UGX
📌 Status: ${statusText}`;
        }

        sendSMS(phoneNumber, response); // optional
        res.set('Content-Type', 'text/plain');
        res.send(response);
      })
      .catch(err => {
        console.error('❌ Firestore Error (Check):', err);
        res.send('END System error. Try again.');
      });
    return;
  }

  // Invalid Input Fallback
  else {
    response = 'END Invalid input';
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
}

module.exports = handleUSSD;
