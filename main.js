import axios from 'axios';
import { Wallet as EthersWallet } from 'ethers';
import { HttpsProxyAgent } from 'https-proxy-agent';  // Actual proxy agent
import winston from 'winston';  // Real logging library
import axiosRetry from 'axios-retry';  // Retry logic for axios
import fs from 'fs';  // To read the wallets.json file

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

    // Other methods like submitProof, claimProofSubmissionPoints, etc. will remain unchanged...
}

// Function to read wallet private keys and addresses from wallets.json
function loadWallets() {
    try {
        const data = fs.readFileSync('wallets.json', 'utf8');
        const parsedData = JSON.parse(data);
        return parsedData || [];
    } catch (error) {
        logger.error('Error reading wallets.json file', error);
        return [];
    }
}

// Run the bot for each wallet
async function runBotForEachWallet(wallets) {
    for (let wallet of wallets) {
        try {
            // Create a LayerEdgeConnection with the current wallet's private key
            const bot = new LayerEdgeConnection(null, wallet.privateKey);  // Pass null for proxy here
            
            // Log the start of bot execution for each address
            logger.info(`Starting bot execution for wallet: ${wallet.address}`);
            
            // Perform actions for the current wallet
            await bot.dailyCheckIn();
            await bot.submitProof();
            await bot.claimProofSubmissionPoints();
            await bot.checkNodeStatus();
            await bot.stopNode();
            await bot.connectNode();
            await bot.claimLightNodePoints();
            await bot.checkNodePoints();
            
            // Log the successful execution of actions
            logger.info(`Bot execution completed for wallet: ${wallet.address}`);
        } catch (err) {
            logger.error(`Bot execution failed for wallet: ${wallet.address}`, err);
        }
    }
}

// Load the wallets from wallets.json
const wallets = loadWallets();

// Start the bot for all wallets from wallets.json
if (wallets.length > 0) {
    runBotForEachWallet(wallets);
} else {
    logger.error('No wallets found in wallets.json');
}
