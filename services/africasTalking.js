const africastalking = require('africastalking');
require('dotenv').config();

const at = africastalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME
});

async function sendSMS(phoneNumber, message) {
  try {
    const response = await at.SMS.send({
      to: [phoneNumber],
      message: message
    });
    console.log('✅ SMS Sent:', response);
  } catch (err) {
    console.error('❌ SMS Error:', err);
  }
}

module.exports = {
  sendSMS
};
