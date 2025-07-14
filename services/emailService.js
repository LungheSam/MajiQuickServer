const emailjs = require('@emailjs/nodejs');
require('dotenv').config();

// Initialize EmailJS
emailjs.init({
  publicKey: process.env.EMAILJS_PUBLIC_KEY, // Use descriptive env var
  privateKey: process.env.EMAILJS_PRIVATE_KEY, // Optional but recommended
});

/**
 * Sends a verification email using EmailJS template
 * 
 * @param {Object} params
 * @param {string} params.to_name - Recipient's name
 * @param {string} params.to_email - Recipient's email address
 * @param {string} params.passcode - OTP or verification code
 * @param {string} params.expiry_time - When the OTP expires
 * @param {string} [params.message_intro] - Custom intro message
 * @param {string} [params.company_name] - Your company or app name
 * @param {string} [params.extra_note] - Optional extra info
 */
async function sendVerificationEmail({
  to_name,
  to_email,
  code,

}) {
 console.log(to_email);
  const templateParams = {
  email:to_email,
  company_name: "MajiQuick",
  message_intro: `Hi ${to_name}, here's your verification code.`,
  message_body: `Your OTP is ${code}.`,
};


  try {
    const response = await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      templateParams
    );

    console.log('✅ Email sent:', response.status, response.text);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw new Error('Email sending failed');
  }
}
async function sendEmail(to_email,message_intro,message) {
 console.log(to_email);
  const templateParams = {
  email:to_email,
  company_name: "MajiQuick",
  message_intro: message_intro,
  message_body: message,
};


  try {
    const response = await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      templateParams
    );

    console.log('✅ Email sent:', response.status, response.text);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw new Error('Email sending failed');
  }
}

module.exports = { sendVerificationEmail,sendEmail };
