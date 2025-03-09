import axios from 'axios';
import { Wallet as EthersWallet } from 'ethers';
import { HttpsProxyAgent } from 'https-proxy-agent';  // Actual proxy agent
import winston from 'winston';  // Real logging library
import axiosRetry from 'axios-retry';  // Retry logic for axios

// Configure the logger using winston
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Set up axios retry functionality
axiosRetry(axios, {
    retries: 3,  // Number of retry attempts
    retryDelay: axiosRetry.exponentialDelay,  // Exponential delay between retries
    shouldRetry: (error) => {
        // Only retry for specific error types (e.g., network-related)
        return error.response?.status === 500 || error.code === 'ECONNABORTED';
    }
});

// Custom request handler to perform HTTP requests with retries
async function makeRequest(config, retryCount = 3) {
    let attempt = 0;
    while (attempt < retryCount) {
        try {
            const response = await axios(config);
            return response;  // Return the response if the request is successful
        } catch (error) {
            attempt++;
            if (attempt >= retryCount) {
                throw error;  // Throw error after the maximum retry attempts
            }
            logger.warn(`Retrying request... Attempt ${attempt}`);
        }
    }
}

class LayerEdgeConnection {
    constructor(proxy = null, privateKey = null, refCode = "knYyWnsE") {
        this.refCode = refCode;
        this.proxy = proxy;
        this.retryCount = 30;

        this.headers = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://layeredge.io',
            'Referer': 'https://layeredge.io/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        };

        this.axiosConfig = {
            // No proxy configuration if this.proxy is null
            ...(this.proxy && { httpsAgent: new HttpsProxyAgent(this.proxy) }),  
            timeout: 60000,
            headers: this.headers,
            validateStatus: (status) => status < 500
        };

        this.wallet = privateKey
            ? new EthersWallet(privateKey)
            : EthersWallet.createRandom();
            
        logger.info(`Initialized LayerEdgeConnection`, 
            `Wallet: ${this.wallet.address}\nProxy: ${this.proxy || 'None'}`);
    }

    // Wrapper for making requests using the custom request handler
    async makeRequest(method, url, config = {}) {
        const finalConfig = {
            method,
            url,
            ...this.axiosConfig,
            ...config,
            headers: {
                ...this.headers,
                ...(config.headers || {})
            }
        };

        return await makeRequest(finalConfig, this.retryCount);
    }

    // Example Method: Daily Check-In
    async dailyCheckIn() {
        try {
            logger.verbose(`Performing daily check-in for wallet: ${this.wallet.address}`);
            const response = await this.makeRequest('GET', 'https://layeredge.io/dailyCheckIn');
            logger.info('Daily Check-In completed');
            return response.data;
        } catch (error) {
            logger.error('Error during daily check-in', error);
            throw error;
        }
    }

    // Example Method: Submit Proof
    async submitProof() {
        try {
            logger.verbose(`Submitting proof for wallet: ${this.wallet.address}`);
            const response = await this.makeRequest('POST', 'https://layeredge.io/submitProof', {
                data: {
                    wallet: this.wallet.address,
                    proof: 'some-proof-data',
                }
            });
            logger.info('Proof submission completed');
            return response.data;
        } catch (error) {
            logger.error('Error submitting proof', error);
            throw error;
        }
    }

    // Example Method: Claim Proof Submission Points
    async claimProofSubmissionPoints() {
        try {
            logger.verbose(`Claiming proof submission points for wallet: ${this.wallet.address}`);
            const response = await this.makeRequest('POST', 'https://layeredge.io/claimProofPoints');
            logger.info('Claimed proof submission points');
            return response.data;
        } catch (error) {
            logger.error('Error claiming proof points', error);
            throw error;
        }
    }

    // Example Method: Check Node Status
    async checkNodeStatus() {
        try {
            logger.verbose(`Checking node status for wallet: ${this.wallet.address}`);
            const response = await this.makeRequest('GET', 'https://layeredge.io/checkNodeStatus');
            logger.info('Node status check completed');
            return response.data;
        } catch (error) {
            logger.error('Error checking node status', error);
            throw error;
        }
    }

    // Example Method: Stop Node
    async stopNode() {
        try {
            logger.verbose(`Stopping node for wallet: ${this.wallet.address}`);
            const response = await this.makeRequest('POST', 'https://layeredge.io/stopNode');
            logger.info('Node stopped');
            return response.data;
        } catch (error) {
            logger.error('Error stopping node', error);
            throw error;
        }
    }

    // Example Method: Connect Node
    async connectNode() {
        try {
            logger.verbose(`Connecting node for wallet: ${this.wallet.address}`);
            const response = await this.makeRequest('POST', 'https://layeredge.io/connectNode');
            logger.info('Node connected');
            return response.data;
        } catch (error) {
            logger.error('Error connecting node', error);
            throw error;
        }
    }

    // Example Method: Claim Light Node Points
    async claimLightNodePoints() {
        try {
            logger.verbose(`Claiming light node points for wallet: ${this.wallet.address}`);
            const response = await this.makeRequest('POST', 'https://layeredge.io/claimLightNodePoints');
            logger.info('Light node points claimed');
            return response.data;
        } catch (error) {
            logger.error('Error claiming light node points', error);
            throw error;
        }
    }

    // Example Method: Check Node Points
    async checkNodePoints() {
        try {
            logger.verbose(`Checking node points for wallet: ${this.wallet.address}`);
            const response = await this.makeRequest('GET', 'https://layeredge.io/checkNodePoints');
            logger.info('Node points check completed');
            return response.data;
        } catch (error) {
            logger.error('Error checking node points', error);
            throw error;
        }
    }
}

// Start of Bot Execution
const bot = new LayerEdgeConnection(null);  // Pass null here to disable proxy

async function runBot() {
    try {
        await bot.dailyCheckIn();
        await bot.submitProof();
        await bot.claimProofSubmissionPoints();
        await bot.checkNodeStatus();
        await bot.stopNode();
        await bot.connectNode();
        await bot.claimLightNodePoints();
        await bot.checkNodePoints();
    } catch (err) {
        logger.error('Bot execution failed', err);
    }
}

// Run the bot
runBot();
