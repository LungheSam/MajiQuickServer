const express = require('express');
const router = express.Router();
const { db } = require('../services/firebaseAdmin');
const { Timestamp } = require('firebase-admin/firestore');
const { sendSMS } = require('../services/africasTalking');
const { sendEmail } = require('../services/emailService');
router.post('/', async (req, res) => {
  const { uid, name, phone, email, jerrycans, cost, code } = req.body;

  if (!uid || !jerrycans || !cost || !code) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  try {
    // 1. Create Purchase Document
    await db.collection('purchases').add({
      uid,
      phone,
      jerrycans,
      cost,
      code,
      remaining: 0,
      status: 'unused',
      timestamp: Timestamp.now(),
    });

    const message = `You purchased ${jerrycans} jerrycans. Code: ${code}, Cost: ${cost} UGX`;

    // 2. Save notification
    await db.collection('notifications').add({
      uid,
      phone,
      message,
      timestamp: Timestamp.now(),
      read: false,
      type: 'purchase',
    });

    // 3. Notify user
    await sendSMS(phone, message);
    await sendEmail(email,'MajiQuick Purchase Confirmation', message);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Purchase error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
