module.exports = {
  futures: {
    baseUrl: 'https://fapi.binance.com',
    wsUrl: 'wss://fstream.binance.com/ws'
  },
  spot: {
    baseUrl: 'https://api.binance.com',
    wsUrl: 'wss://stream.binance.com:9443/ws'
  },
  endpoints: {
    account: '/fapi/v2/account',
    leverage: '/fapi/v1/leverage',
    order: '/fapi/v1/order',
    price: '/api/v3/ticker/price',
    klines: '/api/v3/klines'
  }
};