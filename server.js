const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoints untuk bot trading
app.post('/api/bot/start', (req, res) => {
    // Logic untuk start bot
    res.json({ success: true, message: 'Bot started' });
});

app.post('/api/bot/stop', (req, res) => {
    // Logic untuk stop bot
    res.json({ success: true, message: 'Bot stopped' });
});

app.get('/api/positions', (req, res) => {
    // Logic untuk get positions
    res.json({ positions: [] });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
