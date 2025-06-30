const admin = require('firebase-admin');
const serviceAccount = require('../services/majiquick-firebase-adminsdk-fbsvc-6152f54818.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

module.exports = db;
