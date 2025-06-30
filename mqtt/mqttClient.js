const mqtt = require('mqtt');
const db = require('../services/firebaseAdmin');
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
      console.log(data);
      if (data.code) {
        const snapshot = await db.collection('purchases')
          .where('code', '==', data.code)
          .where('status', '==', 'unused')
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const purchase = doc.data();

          // Mark code as used
          await doc.ref.update({ status: 'used' });

          // Send back response
          const responsePayload = {
            access: 'granted',
            jerrycans: purchase.jerrycans
          };
          sendToHardware(responsePayload);
        } else {
          sendToHardware({ access: 'denied', reason: 'Invalid or used code' });
        }
      }
    } catch (err) {
      console.error('MQTT message error:', err);
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
