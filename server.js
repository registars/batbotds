const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Binance API configuration
const BINANCE_API_URL = 'https://api.binance.com';
const BINANCE_FUTURES_API_URL = 'https://fapi.binance.com';
const BINANCE_WS_URL = 'wss://fstream.binance.com/ws';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoints for bot trading
app.post('/api/bot/start', async (req, res) => {
    try {
        // Start the trading bot
        const { strategy, symbols, leverage, riskPercent } = req.body;
        
        // Validate input
        if (!strategy || !symbols || !leverage || !riskPercent) {
            return res.status(400).json({ success: false, message: 'Missing required parameters' });
        }
        
        // Set leverage for each symbol
        for (const symbol of symbols) {
            await setLeverage(symbol, leverage);
        }
        
        // Start WebSocket connections for price updates
        startPriceWebSockets(symbols);
        
        res.json({ success: true, message: 'Bot started successfully' });
    } catch (error) {
        console.error('Error starting bot:', error);
        res.status(500).json({ success: false, message: 'Error starting bot', error: error.message });
    }
});

app.post('/api/bot/stop', (req, res) => {
    // Logic to stop bot
    stopPriceWebSockets();
    res.json({ success: true, message: 'Bot stopped' });
});

app.get('/api/positions', async (req, res) => {
    try {
        const positions = await getAccountPositions();
        res.json({ success: true, positions });
    } catch (error) {
        console.error('Error getting positions:', error);
        res.status(500).json({ success: false, message: 'Error getting positions', error: error.message });
    }
});

// Binance API helper functions
async function binanceRequest(method, endpoint, params = {}, isFutures = true) {
    const apiKey = process.env.BINANCE_API_KEY;
    const secretKey = process.env.BINANCE_SECRET_KEY;
    
    if (!apiKey || !secretKey) {
        throw new Error('Binance API credentials not configured');
    }
    
    const baseUrl = isFutures ? BINANCE_FUTURES_API_URL : BINANCE_API_URL;
    const timestamp = Date.now();
    
    // Add timestamp to params
    const queryParams = new URLSearchParams({
        ...params,
        timestamp
    });
    
    // Create signature
    const signature = crypto
        .createHmac('sha256', secretKey)
        .update(queryParams.toString())
        .digest('hex');
    
    queryParams.append('signature', signature);
    
    const url = `${baseUrl}${endpoint}?${queryParams.toString()}`;
    
    const response = await axios({
        method,
        url,
        headers: {
            'X-MBX-APIKEY': apiKey
        }
    });
    
    return response.data;
}

async function setLeverage(symbol, leverage) {
    try {
        const response = await binanceRequest('POST', '/fapi/v1/leverage', {
            symbol,
            leverage
        });
        return response;
    } catch (error) {
        console.error(`Error setting leverage for ${symbol}:`, error);
        throw error;
    }
}

async function getAccountPositions() {
    try {
        const accountInfo = await binanceRequest('GET', '/fapi/v2/account');
        return accountInfo.positions.filter(p => parseFloat(p.positionAmt) !== 0);
    } catch (error) {
        console.error('Error getting account positions:', error);
        throw error;
    }
}

async function placeOrder(symbol, side, quantity, price = null, stopPrice = null) {
    try {
        const params = {
            symbol,
            side,
            type: price ? 'LIMIT' : 'MARKET',
            quantity
        };
        
        if (price) {
            params.price = price;
            params.timeInForce = 'GTC';
        }
        
        if (stopPrice) {
            params.stopPrice = stopPrice;
            params.type = 'STOP_MARKET';
        }
        
        const response = await binanceRequest('POST', '/fapi/v1/order', params);
        return response;
    } catch (error) {
        console.error('Error placing order:', error);
        throw error;
    }
}

// WebSocket connections for price updates
const wsConnections = {};

function startPriceWebSockets(symbols) {
    stopPriceWebSockets();
    
    symbols.forEach(symbol => {
        const ws = new WebSocket(`${BINANCE_WS_URL}/${symbol.toLowerCase()}@kline_1m`);
        
        ws.on('open', () => {
            console.log(`WebSocket connected for ${symbol}`);
            wsConnections[symbol] = ws;
        });
        
        ws.on('message', (data) => {
            const message = JSON.parse(data);
            const candle = message.k;
            
            // Here you would implement your trading strategy logic
            // based on the price updates
            console.log(`${symbol} Price Update:`, {
                open: candle.o,
                high: candle.h,
                low: candle.l,
                close: candle.c,
                volume: candle.v,
                isClosed: candle.x
            });
            
            // Example: Simple moving average crossover strategy
            // You would implement your actual strategy here
        });
        
        ws.on('close', () => {
            console.log(`WebSocket closed for ${symbol}`);
            delete wsConnections[symbol];
        });
        
        ws.on('error', (error) => {
            console.error(`WebSocket error for ${symbol}:`, error);
            delete wsConnections[symbol];
        });
    });
}

function stopPriceWebSockets() {
    Object.values(wsConnections).forEach(ws => ws.close());
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
