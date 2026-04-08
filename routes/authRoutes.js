const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {db, admin, auth} = require('../services/firebaseAdmin'); 
const { sendSMS } = require('../services/africasTalking');
const { sendVerificationEmail } = require('../services/emailService');
const eSignetService = require('../services/eSignetService');

const { Timestamp } = require('firebase-admin/firestore');

router.post('/send-code', async (req, res) => {
  const { name, email, phone, password, confirmPassword } = req.body;

  if (!name || !email || !phone || !password || !confirmPassword) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  const message = `Your MajiQuick verification code is: ${code}`;

  try {
    // 🔐 Store verification in Firestore
    await db.collection('verifications').doc(email).set({
      name,
      email,
      phone,
      code,
      createdAt: Timestamp.now(),
    });

    // ✉️ Send email
    await sendVerificationEmail({
      to_name: name,
      to_email: email,
      code,
    });

    // 📱 Send SMS
    await sendSMS(phone, message);

    res.status(200).json({ success: true, message: 'Verification code sent to email and phone.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send verification code.' });
  }
});


// ========== 2. Verify Code and Register ==========
router.post('/verify-code', async (req, res) => {
  const { email, code } = req.body;

  try {
    const docRef = db.collection('verifications').doc(email);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(400).json({ error: 'No verification request found.' });
    }

    const data = doc.data();

    if (data.code !== code) {
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // Optional: Check for expiry
    const now = Date.now();
    const createdAt = data.createdAt.toDate().getTime();
    if (now - createdAt > 15 * 60 * 1000) {
      return res.status(400).json({ error: 'Verification code expired.' });
    }

    // ✅ Create user
    const userRecord = await admin.auth().createUser({
      email: data.email,
      password: data.password,
      displayName: data.name,
      phoneNumber: data.phone,
    });

    // ✅ Save profile
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      name: data.name,
      email: data.email,
      phone: data.phone,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ❌ Delete verification record
    await docRef.delete();

    res.status(200).json({ success: true, message: 'User verified and created.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'User creation failed.' });
  }
});



module.exports = router;

// ========== eSignet OAuth Routes ==========

/**
 * GET /auth/esignet-login
 * Redirects user to eSignet authorization endpoint
 */
router.get('/esignet-login', (req, res) => {
  try {
    const { url, state, nonce } = eSignetService.getAuthorizationUrl();
    
    // Store state and nonce in session for CSRF validation
    req.session = req.session || {};
    req.session.esignetState = state;
    req.session.esignetNonce = nonce;

    res.redirect(url);
  } catch (error) {
    console.error('❌ Error generating authorization URL:', error);
    res.status(500).json({ error: 'Failed to initiate eSignet login' });
  }
});

/**
 * GET /auth/esignet-callback
 * Handles callback from eSignet after user authentication
 * Exchanges authorization code for tokens and creates Firebase user
 */
router.get('/esignet-callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle authentication errors
    if (error) {
      console.error('❌ eSignet authentication error:', error_description);
      return res.redirect(`/login?error=${error}&message=${error_description}`);
    }

    // Validate state parameter (CSRF protection)
    if (state !== (req.session?.esignetState)) {
      console.error('❌ Invalid state parameter - possible CSRF attack');
      return res.redirect('/login?error=csrf_validation_failed');
    }

    if (!code) {
      return res.redirect('/login?error=no_authorization_code');
    }

    console.log('🔑 Authenticating user with eSignet...');
    const userInfo = await eSignetService.authenticateUser(code);

    // Check if user already exists in Firebase
    let firebaseUser = null;
    let isNewUser = false;

    try {
      firebaseUser = await auth.getUserByEmail(userInfo.email);
      console.log('👤 Existing user found:', userInfo.email);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        // Create new user
        const tempPassword = generatePassword();
        console.log('👤 Creating new Firebase user...');
        
        firebaseUser = await auth.createUser({
          email: userInfo.email,
          password: tempPassword,
          displayName: userInfo.name,
          phoneNumber: userInfo.phone
        });

        isNewUser = true;

        // Send credentials via SMS if new user
        const smsMessage = `MajiQuick Account Created!
Name: ${userInfo.name}
Email: ${userInfo.email}
Temp Password: ${tempPassword}

Login: https://maji-quick-web-app.vercel.app/login

USSD: Dial *384*22887# to buy water`;

        sendSMS(userInfo.phone, smsMessage).catch(err => 
          console.error('⚠️ SMS notification failed:', err)
        );
      } else {
        throw err;
      }
    }

    // Store/Update user in Firestore
    const firestoreUser = {
      uid: firebaseUser.uid,
      email: userInfo.email,
      name: userInfo.name,
      phone: userInfo.phone,
      address: userInfo.address || {},
      individualId: userInfo.individualId || null, // National ID from eSignet
      esignetSub: userInfo.sub, // eSignet unique identifier
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      authMethod: 'esignet'
    };

    if (isNewUser) {
      firestoreUser.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }

    await db.collection('users').doc(firebaseUser.uid).set(firestoreUser, { merge: true });

    console.log('✅ User authenticated and stored successfully');

    // Create a custom token for frontend auth (optional)
    const customToken = await auth.createCustomToken(firebaseUser.uid);

    // Redirect to dashboard or login page with success
    // In a real app, you'd pass a secure token or use HTTP-only cookies
    res.redirect(`/dashboard?uid=${firebaseUser.uid}&isNew=${isNewUser}`);

  } catch (error) {
    console.error('❌ eSignet callback error:', error);
    res.redirect(`/login?error=authentication_failed&details=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /auth/authorize-url
 * Returns the eSignet authorization URL for frontend
 */
router.get('/authorize-url', (req, res) => {
  try {
    const { url } = eSignetService.getAuthorizationUrl();
    res.json({ authorizationUrl: url });
  } catch (error) {
    console.error('❌ Error generating authorization URL:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

/**
 * Helper function to generate random password
 */
function generatePassword() {
  const length = 12;
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}
