const mqtt = require('mqtt');
const admin = require('firebase-admin'); // ✅ Required to use admin.firestore()
const {db} = require('../services/firebaseAdmin');
const { sendSMS } = require('../services/africasTalking');

const topicFromHardware = 'majiquick/fromHardware';
const topicToHardware = 'majiquick/toHardware';

let client;

function normalizePhoneNumber(phone) {
  if (!phone) return null;

  const value = String(phone).trim();
  if (!value) return null;

  if (value.startsWith('+')) return value;
  if (value.startsWith('0')) return `+256${value.substring(1)}`;
  if (value.startsWith('256')) return `+${value}`;

  return value;
}

async function getTapOwnerPhoneByDeviceId(deviceId) {
  if (!deviceId) return null;

  const normalizedDeviceId = String(deviceId).trim();
  if (!normalizedDeviceId) return null;

  const collectionNames = ['tapowners', 'tapOwners', 'tapowner'];

  for (const collectionName of collectionNames) {
    try {
      const snapshot = await db.collection(collectionName)
        .where('deviceID', '==', normalizedDeviceId)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const ownerDoc = snapshot.docs[0].data();
        const ownerPhone = ownerDoc.phone || ownerDoc.phoneNumber;

        if (ownerPhone) {
          return normalizePhoneNumber(ownerPhone);
        }
      }
    } catch (err) {
      console.error(`❌ Error looking up tap owner in ${collectionName}:`, err);
    }
  }

  return null;
}

function connectMQTT() {
  client = mqtt.connect('mqtt://broker.hivemq.com');

  client.on('connect', () => {
    console.log('🔌 Connected to MQTT Broker');
    client.subscribe(topicFromHardware, () => {
      console.log(`📥 Subscribed to: ${topicFromHardware}`);
    });
  });
  
  client.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log('📩 Received from Hardware:', data);

    const { code, action, deviceID, deviceId } = data;

    if (!code) return;

    const snapshot = await db.collection('purchases')
      .where('code', '==', code)
      .limit(1)
      .get();

    if (snapshot.empty) {
      sendToHardware({ access: 'denied', reason: 'Code not found' });
      return;
    }

    const doc = snapshot.docs[0];
    const purchase = doc.data();

    // Part 1: When user taps A (Validate Code)
    if (action === 'validate') {
      if (purchase.remaining > 0) {
        sendToHardware({ access: 'granted', remaining: purchase.remaining });
      } else {
        sendToHardware({ access: 'denied', reason: 'Fully used' });
      }
    }

    // Part 2: When user taps B (Fetch one jerrycan)
    else if (action === 'fetch') {
      if (purchase.remaining > 0) {
        const newRemaining = purchase.remaining - 1;

        const newStatus = newRemaining === 0 ? 'fully used' : 'partially used';

        await doc.ref.update({
          remaining: newRemaining,
          status: newStatus,
          fetchHistory: admin.firestore.FieldValue.arrayUnion({
            time: new Date(),
            count: 1
          })
        });

        const hardwareDeviceId = deviceID || deviceId;
        const tapOwnerPhoneNumber = await getTapOwnerPhoneByDeviceId(hardwareDeviceId);

        if (tapOwnerPhoneNumber) {
          const ownerMessage = 'MajiQuick: Someone fetched water from your tap. You earned 100 UGX.';
          await sendSMS(tapOwnerPhoneNumber, ownerMessage);
        } else {
          console.log(`⚠️ No tap owner found for device ID ${hardwareDeviceId} for fetch notification`);
        }

        sendToHardware({ fetched: 1, remaining: newRemaining });
      } else {
        sendToHardware({ access: 'denied', reason: 'No jerrycans left' });
      }
    }

    // Part 3: When user taps C (End session)
    else if (action === 'end') {
      sendToHardware({ status: 'session ended' });
      console.log(`👋 User ended session for code ${code}`);
    }

    else {
      sendToHardware({ error: 'Unknown action' });
    }

  } catch (err) {
    console.error('❌ MQTT error:', err);
    sendToHardware({ error: 'Processing failed' });
  }
});

}

function sendToHardware(payload) {
  if (client && client.connected) {
    client.publish(topicToHardware, JSON.stringify(payload));
    console.log(`📤 Sent to Hardware: ${JSON.stringify(payload)}`);
  }
}

module.exports = {
  connectMQTT,
  sendToHardware
};
