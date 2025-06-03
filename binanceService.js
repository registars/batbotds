const crypto = require('crypto');
const axios = require('axios');
const binanceConfig = require('../config/binance');

class BinanceService {
  constructor(apiKey, secretKey) {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
  }

  async makeRequest(method, endpoint, params = {}, isFutures = true) {
    const config = isFutures ? binanceConfig.futures : binanceConfig.spot;
    const timestamp = Date.now();
    
    const queryParams = new URLSearchParams({
      ...params,
      timestamp
    });
    
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(queryParams.toString())
      .digest('hex');
    
    queryParams.append('signature', signature);
    
    const url = `${config.baseUrl}${endpoint}?${queryParams.toString()}`;
    
    try {
      const response = await axios({
        method,
        url,
        headers: {
          'X-MBX-APIKEY': this.apiKey
        }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  handleError(error) {
    // Error handling logic
  }
}

module.exports = BinanceService;