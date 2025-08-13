const mqtt = require('mqtt');
const admin = require('firebase-admin'); // ✅ Required to use admin.firestore()
const {db} = require('../services/firebaseAdmin');

const topicFromHardware = 'majiquick/fromHardware';
const topicToHardware = 'majiquick/toHardware';

let client;

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

    const { code, action } = data;

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
