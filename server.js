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

// Trading bot modes
const BOT_MODES = {
    DROPBOX: 'dropbox',
    HYBRID: 'hybrid',
    MANUAL: 'manual'
};

// Active strategies
const STRATEGIES = {
    MA_CROSSOVER: 'ma_crossover',
    RSI_BOUNCE: 'rsi_bounce',
    BOLLINGER: 'bollinger',
    MACD: 'macd'
};

// Global state
let botState = {
    active: false,
    mode: BOT_MODES.HYBRID,
    currentStrategy: STRATEGIES.MA_CROSSOVER,
    tradingPairs: ['BTCUSDT', 'ETHUSDT'],
    leverage: 10,
    riskPercent: 1,
    wsConnections: {}
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoints for bot control
app.post('/api/bot/start', async (req, res) => {
    try {
        const { mode, strategy, symbols, leverage, riskPercent } = req.body;
        
        // Validate input
        if (!mode || !strategy || !symbols || !leverage || !riskPercent) {
            return res.status(400).json({ success: false, message: 'Missing required parameters' });
        }
        
        // Set leverage for each symbol
        for (const symbol of symbols) {
            await setLeverage(symbol, leverage);
        }
        
        // Update bot state
        botState = {
            active: true,
            mode,
            currentStrategy: strategy,
            tradingPairs: symbols,
            leverage,
            riskPercent,
            wsConnections: {}
        };
        
        // Start WebSocket connections for price updates
        startPriceWebSockets(symbols);
        
        res.json({ 
            success: true, 
            message: 'Bot started successfully',
            botState
        });
    } catch (error) {
        console.error('Error starting bot:', error);
        res.status(500).json({ success: false, message: 'Error starting bot', error: error.message });
    }
});

app.post('/api/bot/stop', (req, res) => {
    stopPriceWebSockets();
    botState.active = false;
    res.json({ 
        success: true, 
        message: 'Bot stopped',
        botState
    });
});

app.post('/api/bot/mode', (req, res) => {
    const { mode } = req.body;
    if (Object.values(BOT_MODES).includes(mode)) {
        botState.mode = mode;
        res.json({ 
            success: true, 
            message: `Bot mode changed to ${mode}`,
            botState
        });
    } else {
        res.status(400).json({ success: false, message: 'Invalid mode' });
    }
});

app.post('/api/bot/strategy', (req, res) => {
    const { strategy } = req.body;
    if (Object.values(STRATEGIES).includes(strategy)) {
        botState.currentStrategy = strategy;
        res.json({ 
            success: true, 
            message: `Strategy changed to ${strategy}`,
            botState
        });
    } else {
        res.status(400).json({ success: false, message: 'Invalid strategy' });
    }
});

// Market data endpoints
app.get('/api/market/price/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const price = await getSymbolPrice(symbol);
        res.json({ success: true, symbol, price });
    } catch (error) {
        console.error('Error getting price:', error);
        res.status(500).json({ success: false, message: 'Error getting price', error: error.message });
    }
});

app.get('/api/market/24hr/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const stats = await get24hrStats(symbol);
        res.json({ success: true, symbol, stats });
    } catch (error) {
        console.error('Error getting 24hr stats:', error);
        res.status(500).json({ success: false, message: 'Error getting stats', error: error.message });
    }
});

// Portfolio endpoints
app.get('/api/portfolio/balance', async (req, res) => {
    try {
        const balance = await getFuturesAccountBalance();
        res.json({ success: true, balance });
    } catch (error) {
        console.error('Error getting balance:', error);
        res.status(500).json({ success: false, message: 'Error getting balance', error: error.message });
    }
});

app.get('/api/portfolio/positions', async (req, res) => {
    try {
        const positions = await getAccountPositions();
        res.json({ success: true, positions });
    } catch (error) {
        console.error('Error getting positions:', error);
        res.status(500).json({ success: false, message: 'Error getting positions', error: error.message });
    }
});

// Trading endpoints
app.post('/api/trade/place', async (req, res) => {
    try {
        const { symbol, side, quantity, price, stopPrice } = req.body;
        const order = await placeOrder(symbol, side, quantity, price, stopPrice);
        res.json({ success: true, order });
    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({ success: false, message: 'Error placing order', error: error.message });
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

async function getSymbolPrice(symbol) {
    try {
        const response = await axios.get(`${BINANCE_API_URL}/api/v3/ticker/price?symbol=${symbol}`);
        return parseFloat(response.data.price);
    } catch (error) {
        console.error('Error getting symbol price:', error);
        throw error;
    }
}

async function get24hrStats(symbol) {
    try {
        const response = await axios.get(`${BINANCE_API_URL}/api/v3/ticker/24hr?symbol=${symbol}`);
        return {
            priceChange: response.data.priceChange,
            priceChangePercent: response.data.priceChangePercent,
            highPrice: response.data.highPrice,
            lowPrice: response.data.lowPrice,
            volume: response.data.volume
        };
    } catch (error) {
        console.error('Error getting 24hr stats:', error);
        throw error;
    }
}

async function getFuturesAccountBalance() {
    try {
        const accountInfo = await binanceRequest('GET', '/fapi/v2/account');
        return accountInfo.assets.filter(asset => parseFloat(asset.walletBalance) > 0);
    } catch (error) {
        console.error('Error getting account balance:', error);
        throw error;
    }
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
function startPriceWebSockets(symbols) {
    stopPriceWebSockets();
    
    symbols.forEach(symbol => {
        const ws = new WebSocket(`${BINANCE_WS_URL}/${symbol.toLowerCase()}@kline_1m`);
        
        ws.on('open', () => {
            console.log(`WebSocket connected for ${symbol}`);
            botState.wsConnections[symbol] = ws;
        });
        
        ws.on('message', (data) => {
            const message = JSON.parse(data);
            const candle = message.k;
            
            // Implement trading strategy based on the current mode and strategy
            executeTradingStrategy(symbol, candle);
        });
        
        ws.on('close', () => {
            console.log(`WebSocket closed for ${symbol}`);
            delete botState.wsConnections[symbol];
        });
        
        ws.on('error', (error) => {
            console.error(`WebSocket error for ${symbol}:`, error);
            delete botState.wsConnections[symbol];
        });
    });
}

function stopPriceWebSockets() {
    Object.values(botState.wsConnections).forEach(ws => ws.close());
    botState.wsConnections = {};
}

function executeTradingStrategy(symbol, candle) {
    if (!botState.active) return;
    
    // Implement different strategies based on bot mode and selected strategy
    switch (botState.currentStrategy) {
        case STRATEGIES.MA_CROSSOVER:
            executeMACrossover(symbol, candle);
            break;
        case STRATEGIES.RSI_BOUNCE:
            executeRSIBounce(symbol, candle);
            break;
        case STRATEGIES.BOLLINGER:
            executeBollingerStrategy(symbol, candle);
            break;
        case STRATEGIES.MACD:
            executeMACDStrategy(symbol, candle);
            break;
        default:
            console.log(`No strategy implemented for ${botState.currentStrategy}`);
    }
}

// Example strategy implementations
function executeMACrossover(symbol, candle) {
    // Implement moving average crossover strategy
    // This is a simplified example - you would need to maintain state
    // for previous candles and indicators
    
    if (candle.x) { // If candle is closed
        console.log(`Executing MA Crossover strategy for ${symbol} at ${candle.c}`);
        // Your strategy logic here
    }
}

function executeRSIBounce(symbol, candle) {
    // Implement RSI bounce strategy
    if (candle.x) {
        console.log(`Executing RSI Bounce strategy for ${symbol} at ${candle.c}`);
        // Your strategy logic here
    }
}

// ... other strategy implementations ...

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Dashboard available at http://localhost:${PORT}`);
});
