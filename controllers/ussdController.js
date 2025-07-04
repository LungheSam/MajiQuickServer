// const { sendSMS } = require('../services/africasTalking');
// const db = require('../services/firebaseAdmin');

// const sessions = {};

// function handleUSSD(req, res) {
//   const { sessionId, phoneNumber, text } = req.body;
//   const input = text.split('*');
//   const level = input.length;

//   let response = '';

//   if (text === '') {
//     response = `CON Welcome to MajiQuick
// 1. Buy Water
// 2. Check Balance`;
//   } else if (text === '1') {
//     response = 'CON Enter number of jerrycans:';
//   } else if (level === 2 && input[0] === '1') {
//     const jerrycans = parseInt(input[1]);
//     const cost = jerrycans * 100;
//     const code = Math.floor(100000 + Math.random() * 900000);

//     // Save to Firestore
//     const purchase = {
//       phone: phoneNumber,
//       jerrycans,
//       cost,
//       code: code.toString(),
//       status: 'unused',
//       timestamp: new Date()
//     };

//     db.collection('purchases').add(purchase)
//       .then(() => {
//         const msg = `MajiQuick:\nYou bought ${jerrycans} jerrycans.\nCode: ${code}`;
//         sendSMS(phoneNumber, msg);
//         response = `END You bought ${jerrycans} jerrycans.
// Code: ${code}
// Cost: ${cost} UGX
// Thank you for using MajiQuick.`;
//         res.set('Content-Type', 'text/plain');
//         res.send(response);
//       })
//       .catch(err => {
//         console.error('❌ Firestore Error:', err);
//         res.send('END System error. Try again.');
//       });
//     return;
//   } else {
//     response = 'END Invalid input';
//   }

//   res.set('Content-Type', 'text/plain');
//   res.send(response);
// }

// // ✅ This is the missing part
// module.exports = handleUSSD;


const { sendSMS } = require('../services/africasTalking');
const db = require('../services/firebaseAdmin');

function handleUSSD(req, res) {
  const { sessionId, phoneNumber, text } = req.body;
  const input = text.split('*');
  const level = input.length;

  let response = '';

  if (text === '') {
    response = `CON Welcome to MajiQuick
1. Buy Water
2. Check Balance`;
  } else if (text === '1') {
    response = 'CON Enter number of jerrycans:';
  } else if (level === 2 && input[0] === '1') {
    const jerrycans = parseInt(input[1]);
    const cost = jerrycans * 100;
    const code = Math.floor(100000 + Math.random() * 900000);

    const purchase = {
      phone: phoneNumber,
      jerrycans,
      cost,
      code: code.toString(),
      status: 'unused',
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
        console.error('❌ Firestore Error:', err);
        res.send('END System error. Try again.');
      });
    return;

  } else if (text === '2') {
    // Prompt for code
    response = 'CON Enter your 6-digit code:';

  } else if (level === 2 && input[0] === '2') {
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
          response = `END Code: ${doc.code}
🪣 Jerrycans: ${doc.jerrycans}
💰 Cost: ${doc.cost} UGX
📌 Status: ${doc.status}`;
        }
        res.set('Content-Type', 'text/plain');
        res.send(response);
      })
      .catch(err => {
        console.error('❌ Firestore Error (Check Code):', err);
        res.send('END System error. Try again.');
      });
    return;
  } else {
    response = 'END Invalid input';
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
}

module.exports = handleUSSD;

