const admin = require('firebase-admin');

const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);

admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig)
});

const db = admin.firestore();
const auth = admin.auth();

module.exports = { db, admin, auth };

