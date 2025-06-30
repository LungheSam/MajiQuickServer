const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const ussdRoutes = require('./routes/ussdRoutes');
const mqttClient = require('./mqtt/mqttClient');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use('/ussd', ussdRoutes);

// Start MQTT
mqttClient.connectMQTT();

app.listen(port, () => {
  console.log(`🚀 MajiQuick Backend running at http://localhost:${port}`);
});
