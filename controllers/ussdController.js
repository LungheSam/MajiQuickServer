const { sendSMS } = require('../services/africasTalking');
const { db } = require('../services/firebaseAdmin');

// Validate and format phone number
function validateAndFormatPhone(phone) {
  // Remove any whitespace
  phone = phone.trim();
  
  // Check if it starts with 07
  if (!phone.startsWith('07')) {
    return { valid: false, error: 'Phone number must start with 07' };
  }
  
  // Check if it's exactly 10 digits
  if (phone.length !== 10 || !/^\d+$/.test(phone)) {
    return { valid: false, error: 'Phone number must be 10 digits' };
  }
  
  // Format: +256 + number without leading 0
  const formattedPhone = '+256' + phone.substring(1);
  return { valid: true, phone: formattedPhone };
}

// Check if user exists in Firestore by phone number
async function getUserByPhone(phone) {
  try {
    const snapshot = await db.collection('users')
      .where('phone', '==', phone)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data();
  } catch (err) {
    console.error('❌ Error checking user:', err);
    return null;
  }
}

function handleUSSD(req, res) {
  const { text } = req.body;
  const input = text.split('*');
  const level = input.length;

  let response = '';

  // Step 1: Initial Menu
  if (text === '') {
    response = `CON Welcome to MajiQuick
1. Buy Water
2. Check Balance
3. Register Account`;
  }

  // ===== BUY WATER FLOW =====
  // Step 2: Buy Water Flow - Enter Phone Number
  else if (text === '1') {
    response = 'CON Enter your phone number:';
  }

  // Step 3: Verify user exists - if yes, ask for jerrycans
  else if (level === 2 && input[0] === '1') {
    const userPhoneInput = input[1];
    
    // Validate and format phone number
    const phoneValidation = validateAndFormatPhone(userPhoneInput);
    
    if (!phoneValidation.valid) {
      response = `END Error: ${phoneValidation.error}`;
      res.set('Content-Type', 'text/plain');
      res.send(response);
      return;
    }
    
    const userPhone = phoneValidation.phone;
    
    // Check if user exists
    getUserByPhone(userPhone).then(user => {
      if (!user) {
        response = `END Phone number not registered.
Register first via option 3.`;
        res.set('Content-Type', 'text/plain');
        res.send(response);
        return;
      }
      
      response = 'CON How many jerrycans?';
      res.set('Content-Type', 'text/plain');
      res.send(response);
    }).catch(err => {
      console.error('Error checking user:', err);
      res.send('END System error. Try again.');
    });
    return;
  }

  // Step 4: Process Purchase
  else if (level === 3 && input[0] === '1') {
    const userPhoneInput = input[1];
    const jerrycans = parseInt(input[2], 10);
    
    // Validate phone
    const phoneValidation = validateAndFormatPhone(userPhoneInput);
    
    if (!phoneValidation.valid) {
      response = `END Error: ${phoneValidation.error}`;
      res.set('Content-Type', 'text/plain');
      res.send(response);
      return;
    }
    
    const userPhone = phoneValidation.phone;
    
    getUserByPhone(userPhone).then(user => {
      if (!user) {
        response = 'END Phone number not registered.';
        res.set('Content-Type', 'text/plain');
        res.send(response);
        return;
      }

      if (!Number.isInteger(jerrycans) || jerrycans < 1) {
        response = 'END Enter a valid number of jerrycans.';
        res.set('Content-Type', 'text/plain');
        res.send(response);
        return;
      }
      
      const cost = jerrycans * 100;
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      const purchase = {
        phone: userPhone,
        jerrycans,
        remaining: jerrycans,
        cost,
        code,
        status: 'active',
        fetchHistory: [],
        timestamp: new Date()
      };

      db.collection('purchases').add(purchase)
        .then(() => {
          const msg = `MajiQuick:\nYou bought ${jerrycans} jerrycans.\nCode: ${code}`;
          sendSMS(userPhone, msg);
          response = `END You bought ${jerrycans} jerrycans.
Code: ${code}
Cost: ${cost} UGX
Thank you!`;
          res.set('Content-Type', 'text/plain');
          res.send(response);
        })
        .catch(err => {
          console.error('❌ Firestore Error (Buy):', err);
          res.send('END System error. Try again.');
        });
    }).catch(err => {
      console.error('Purchase error:', err);
      res.send('END System error. Try again.');
    });
    return;
  }

  // ===== CHECK BALANCE FLOW =====
  // Step 5: Check Balance - Enter Code
  else if (text === '2') {
    response = 'CON Enter your 6-digit code:';
  }

  // Step 6: Check Balance - Enter Phone Number
  else if (level === 2 && input[0] === '2') {
    response = 'CON Enter your phone number:';
    res.set('Content-Type', 'text/plain');
    res.send(response);
    return;
  }

  // Step 7: Show Balance
  else if (level === 3 && input[0] === '2') {
    const userCode = input[1];
    const userPhoneInput = input[2];
    
    // Validate phone
    const phoneValidation = validateAndFormatPhone(userPhoneInput);
    
    if (!phoneValidation.valid) {
      response = `END Error: ${phoneValidation.error}`;
      res.set('Content-Type', 'text/plain');
      res.send(response);
      return;
    }
    
    const userPhone = phoneValidation.phone;
    
    getUserByPhone(userPhone).then(user => {
      if (!user) {
        response = 'END Phone number not registered.';
        res.set('Content-Type', 'text/plain');
        res.send(response);
        return;
      }

      db.collection('purchases')
        .where('code', '==', userCode)
        .where('phone', '==', userPhone)
        .limit(1)
        .get()
        .then(snapshot => {
          if (snapshot.empty) {
            response = 'END Invalid or expired code.';
            res.set('Content-Type', 'text/plain');
            res.send(response);
            return;
          }
          
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

          res.set('Content-Type', 'text/plain');
          res.send(response);
          
          // Send SMS with balance info
          const smsMessage = `MajiQuick Balance\nCode: ${doc.code}\nRemaining: ${doc.remaining}/${doc.jerrycans}\nCost: ${doc.cost} UGX\nStatus: ${statusText}`;
          sendSMS(userPhone, smsMessage);
        })
        .catch(err => {
          console.error('❌ Firestore Error (Check):', err);
          res.send('END System error. Try again.');
        });
    }).catch(err => {
      console.error('Balance check error:', err);
      res.send('END System error. Try again.');
    });
    return;
  }

  // ===== REGISTER ACCOUNT FLOW =====
  else if (text === '3') {
    response = 'END Register using the MajiQuick app or website, then come back here to buy water or check balance.';
  }

  // Invalid Input Fallback
  else {
    response = 'END Invalid input';
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
}

module.exports = handleUSSD;
