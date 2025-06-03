const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const marketController = require('../controllers/marketController');

// Bot routes
router.post('/bot/start', botController.startBot);
router.post('/bot/stop', botController.stopBot);

// Market data routes
router.get('/market/prices', marketController.getPrices);

module.exports = router;