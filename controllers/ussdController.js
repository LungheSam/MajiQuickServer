
const { sendSMS } = require('../services/africasTalking');
const { db, admin, auth } = require('../services/firebaseAdmin');

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

// Dummy MOSIP/NIN verification - returns user data if NIN matches
async function verifyNINAndGetUser(nin) {
  try {
    // In a real system, this would call MOSIP API
    // For now, we have a dummy database of NIN -> user data
    const snapshot = await db.collection('nin_verification')
      .where('nin', '==', nin)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return { verified: false, error: 'NIN not found' };
    }
    
    return { verified: true, userData: snapshot.docs[0].data() };
  } catch (err) {
    console.error('❌ Error verifying NIN:', err);
    return { verified: false, error: 'Verification error' };
  }
}

// Generate random password
function generatePassword() {
  const length = 12;
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

function handleUSSD(req, res) {
  const { sessionId, phoneNumber, text } = req.body;
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
      
      // User exists, ask for jerrycans
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
    const jerrycans = parseInt(input[2]);
    
    // Validate phone
    const phoneValidation = validateAndFormatPhone(userPhoneInput);
    
    if (!phoneValidation.valid) {
      response = `END Error: ${phoneValidation.error}`;
      res.set('Content-Type', 'text/plain');
      res.send(response);
      return;
    }
    
    const userPhone = phoneValidation.phone;
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
    return;
  }

  // ===== CHECK BALANCE FLOW (WITH AUTHENTICATION) =====
  // Step 5: Check Balance - Enter Phone Number
  else if (text === '2') {
    response = 'CON Enter your phone number:';
  }

  // Step 6: Check Balance - Enter NIN
  else if (level === 2 && input[0] === '2') {
    const userPhoneInput = input[1];
    
    // Validate phone
    const phoneValidation = validateAndFormatPhone(userPhoneInput);
    
    if (!phoneValidation.valid) {
      response = `END Error: ${phoneValidation.error}`;
      res.set('Content-Type', 'text/plain');
      res.send(response);
      return;
    }
    
    response = 'CON Enter your NIN:';
    res.set('Content-Type', 'text/plain');
    res.send(response);
    return;
  }

  // Step 7: Check Balance - Enter Code (after auth)
  else if (level === 3 && input[0] === '2') {
    const userPhoneInput = input[1];
    const userNIN = input[2];
    
    // Validate phone
    const phoneValidation = validateAndFormatPhone(userPhoneInput);
    
    if (!phoneValidation.valid) {
      response = `END Error: ${phoneValidation.error}`;
      res.set('Content-Type', 'text/plain');
      res.send(response);
      return;
    }
    
    const userPhone = phoneValidation.phone;
    
    // Verify user exists and NIN matches
    Promise.all([
      getUserByPhone(userPhone),
      verifyNINAndGetUser(userNIN)
    ]).then(([user, ninVerification]) => {
      if (!user || !ninVerification.verified) {
        response = 'END Authentication failed. Invalid phone or NIN.';
        res.set('Content-Type', 'text/plain');
        res.send(response);
        return;
      }
      
      // Auth successful, ask for code
      response = 'CON Enter your 6-digit code:';
      res.set('Content-Type', 'text/plain');
      res.send(response);
    }).catch(err => {
      console.error('Auth error:', err);
      res.send('END System error. Try again.');
    });
    return;
  }

  // Step 8: Show Balance
  else if (level === 4 && input[0] === '2') {
    const userPhoneInput = input[1];
    const userNIN = input[2];
    const userCode = input[3];
    
    // Validate phone
    const phoneValidation = validateAndFormatPhone(userPhoneInput);
    
    if (!phoneValidation.valid) {
      response = `END Error: ${phoneValidation.error}`;
      res.set('Content-Type', 'text/plain');
      res.send(response);
      return;
    }
    
    const userPhone = phoneValidation.phone;
    
    // Verify auth
    Promise.all([
      getUserByPhone(userPhone),
      verifyNINAndGetUser(userNIN)
    ]).then(([user, ninVerification]) => {
      if (!user || !ninVerification.verified) {
        response = 'END Authentication failed.';
        res.set('Content-Type', 'text/plain');
        res.send(response);
        return;
      }
      
      // Auth successful, check code
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
      console.error('Auth error:', err);
      res.send('END System error. Try again.');
    });
    return;
  }

  // ===== REGISTER ACCOUNT FLOW =====
  // Step 9: Register - Enter Phone
  else if (text === '3') {
    response = 'CON Enter your phone number:';
  }

  // Step 10: Register - Enter NIN
  else if (level === 2 && input[0] === '3') {
    const userPhoneInput = input[1];
    
    // Validate phone
    const phoneValidation = validateAndFormatPhone(userPhoneInput);
    
    if (!phoneValidation.valid) {
      response = `END Error: ${phoneValidation.error}`;
      res.set('Content-Type', 'text/plain');
      res.send(response);
      return;
    }
    
    response = 'CON Enter your NIN:';
    res.set('Content-Type', 'text/plain');
    res.send(response);
    return;
  }

  // Step 11: Register - Verify NIN and Create User
  else if (level === 3 && input[0] === '3') {
    const userPhoneInput = input[1];
    const userNIN = input[2];
    
    // Validate phone
    const phoneValidation = validateAndFormatPhone(userPhoneInput);
    
    if (!phoneValidation.valid) {
      response = `END Error: ${phoneValidation.error}`;
      res.set('Content-Type', 'text/plain');
      res.send(response);
      return;
    }
    
    const userPhone = phoneValidation.phone;
    
    // Verify NIN
    verifyNINAndGetUser(userNIN).then(ninVerification => {
      if (!ninVerification.verified) {
        response = `END NIN not found: ${ninVerification.error}`;
        res.set('Content-Type', 'text/plain');
        res.send(response);
        return;
      }
      
      const userData = ninVerification.userData;
      const email = userData.email;
      const fullName = userData.fullName || userData.name;
      const generatedPassword = generatePassword();
      
      // Create Firebase Auth user
      auth.createUser({
        email: email,
        password: generatedPassword,
        displayName: fullName
      }).then(userRecord => {
        // Create new user in Firestore
        const newUser = {
          uid: userRecord.uid,
          phone: userPhone,
          nin: userNIN,
          name: fullName,
          email: email,
          createdAt: admin.firestore.Timestamp.now()
        };
        
        return db.collection('users').doc(userRecord.uid).set(newUser)
          .then(() => {
            // Send SMS with account details
            const smsMessage = `MajiQuick Account Created!
Name: ${fullName}
Phone: ${userPhone}

USSD: Dial *384*22887# to buy water

WEB DASHBOARD:
Email: ${email}
Password: ${generatedPassword}
Link: http://maji-quick-web-app.vercel.app/login`;
            
            sendSMS(userPhone, smsMessage);
            
            response = `END Account created!
Name: ${fullName}
Phone: ${userPhone}
Check SMS for login details.`;
            res.set('Content-Type', 'text/plain');
            res.send(response);
          });
      }).catch(err => {
        console.error('❌ Error creating Firebase Auth user:', err);
        res.send('END Error creating account. Try again.');
      });
    }).catch(err => {
      console.error('NIN verification error:', err);
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
