
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const ussdRoutes = require('./routes/ussdRoutes');
const mqttClient = require('./mqtt/mqttClient');
const authRoutes = require('./routes/authRoutes'); // ← This is your new email/SMS verify flow
const purchaseRoutes = require('./routes/purchase');
dotenv.config();

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Routes
app.use('/ussd', ussdRoutes);
app.use('/auth', authRoutes); // ← New auth endpoints
app.use('/api/purchase', purchaseRoutes);

// Start MQTT connection
mqttClient.connectMQTT();

app.listen(port, () => {
  console.log(`🚀 MajiQuick Backend running at http://localhost:${port}`);
});

