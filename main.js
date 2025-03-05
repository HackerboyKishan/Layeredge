import fs from 'fs/promises';
import axios from "axios";
import chalk from "chalk";
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { Wallet } from "ethers";
import banner from './utils/banner.js';

const logger = {
    verbose: true,
    
    _formatTimestamp() {
        return chalk.gray(`[${new Date().toLocaleTimeString()}]`);
    },

    _getLevelStyle(level) {
        const styles = {
            info: chalk.blueBright.bold,
            warn: chalk.yellowBright.bold,
            error: chalk.redBright.bold,
            success: chalk.greenBright.bold,
            debug: chalk.magentaBright.bold,
            verbose: chalk.cyan.bold
        };
        return styles[level] || chalk.white;
    },

    _formatError(error) {
        if (!error) return '';
        
        let errorDetails = '';
        if (axios.isAxiosError(error)) {
            errorDetails = `
            Status: ${error.response?.status || 'N/A'}
            Status Text: ${error.response?.statusText || 'N/A'}
            URL: ${error.config?.url || 'N/A'}
            Method: ${error.config?.method?.toUpperCase() || 'N/A'}
            Response Data: ${JSON.stringify(error.response?.data || {}, null, 2)}
            Headers: ${JSON.stringify(error.config?.headers || {}, null, 2)}`;
        }
        return `${error.message}${errorDetails}`;
    },

    log(level, message, value = '', error = null) {
        const timestamp = this._formatTimestamp();
        const levelStyle = this._getLevelStyle(level);
        const levelTag = levelStyle(`[${level.toUpperCase()}]`);
        const header = chalk.cyan('◆ LayerEdge Auto Bot');

        let formattedMessage = `${header} ${timestamp} ${levelTag} ${message}`;
        
        if (value) {
            const formattedValue = typeof value === 'object' ? JSON.stringify(value) : value;
            const valueStyle = level === 'error' ? chalk.red : 
                             level === 'warn' ? chalk.yellow : 
                             chalk.green;
            formattedMessage += ` ${valueStyle(formattedValue)}`;
        }

        if (error && this.verbose) {
            formattedMessage += `\n${chalk.red(this._formatError(error))}`;
        }

        console.log(formattedMessage);
    },

    info: (message, value = '') => logger.log('info', message, value),
    warn: (message, value = '') => logger.log('warn', message, value),
    error: (message, value = '', error = null) => logger.log('error', message, value, error),
    success: (message, value = '') => logger.log('success', message, value),
    debug: (message, value = '') => logger.log('debug', message, value),
    verbose: (message, value = '') => logger.verbose && logger.log('verbose', message, value),

    progress(wallet, step, status) {
        const progressStyle = status === 'success' 
            ? chalk.green('✔') 
            : status === 'failed' 
            ? chalk.red('✘') 
            : chalk.yellow('➤');
        
        console.log(
            chalk.cyan('◆ LayerEdge Auto Bot'),
            chalk.gray(`[${new Date().toLocaleTimeString()}]`),
            chalk.blueBright(`[PROGRESS]`),
            `${progressStyle} ${wallet} - ${step}`
        );
    }
};

class RequestHandler {
    static async makeRequest(config, retries = 30, backoffMs = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                logger.verbose(`Attempting request (${i + 1}/${retries})`, `URL: ${config.url}`);
                const response = await axios(config);
                logger.verbose(`Request successful`, `Status: ${response.status}`);
                return response;
            } catch (error) {
                const isLastRetry = i === retries - 1;
                const status = error.response?.status;
                
                if (status === 500) {
                    logger.error(`Server Error (500)`, `Attempt ${i + 1}/${retries}`, error);
                    if (isLastRetry) break;
                    
                    const waitTime = backoffMs * Math.pow(1.5, i);
                    logger.warn(`Waiting ${waitTime/1000}s before retry...`);
                    await delay(waitTime/1000);
                    continue;
                }

                if (isLastRetry) {
                    logger.error(`Max retries reached`, '', error);
                    return null;
                }

                logger.warn(`Request failed`, `Attempt ${i + 1}/${retries}`, error);
                await delay(2);
            }
        }
        return null;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms * 1000));
}

async function saveToFile(filename, data) {
    try {
        await fs.appendFile(filename, `${data}\n`, 'utf-8');
        logger.info(`Data saved to ${filename}`);
    } catch (error) {
        logger.error(`Failed to save data to ${filename}: ${error.message}`);
    }
}

async function readFile(pathFile) {
    try {
        const datas = await fs.readFile(pathFile, 'utf8');
        return datas.split('\n')
            .map(data => data.trim())
            .filter(data => data.length > 0);
    } catch (error) {
        logger.error(`Error reading file: ${error.message}`);
        return [];
    }
}

// Updated function to read wallets from wallets.json
async function readWallets() {
    try {
        const walletData = await fs.readFile('wallets.json', 'utf8');
        const wallets = JSON.parse(walletData); // Parse the JSON data into an array of wallet objects
        return wallets.filter(wallet => wallet.address && wallet.privateKey); // Filter out any invalid entries
    } catch (error) {
        logger.error(`Error reading wallets: ${error.message}`);
        return [];
    }
}

const newAgent = (proxy = null) => {
    if (proxy) {
        if (proxy.startsWith('http://')) {
            return new HttpsProxyAgent(proxy);
        } else if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
            return new SocksProxyAgent(proxy);
        } else {
            logger.warn(`Unsupported proxy type: ${proxy}`);
            return null;
        }
    }
    return null;
};

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
            ...(this.proxy && { httpsAgent: newAgent(this.proxy) }),
            timeout: 60000,
            headers: this.headers,
            validateStatus: (status) => status < 500
        };

        this.wallet = privateKey
            ? new Wallet(privateKey)
            : Wallet.createRandom();
            
        logger.verbose(`Initialized LayerEdgeConnection`, 
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
        
        return await RequestHandler.makeRequest(finalConfig, this.retryCount);
    }

    async dailyCheckIn() {
        try {
            const timestamp = Date.now();
            const message = `I am claiming my daily node point for ${this.wallet.address} at ${timestamp}`;
            const sign = await this.wallet.signMessage(message);
            const dataSign = { sign, timestamp, walletAddress: this.wallet.address };
            const config = {
                data: dataSign,
                headers: { 'Content-Type': 'application/json' }
            };

            const response = await this.makeRequest(
                "post",
                "https://referralapi.layeredge.io/api/light-node/claim-node-points",
                config
            );

            if (response && response.data) {
                if (response.data.statusCode && response.data.statusCode === 405) {
                    const cooldownMatch = response.data.message.match(/after\s+([^!]+)!/);
                    const cooldownTime = cooldownMatch ? cooldownMatch[1].trim() : "unknown time";
                    logger.info("⚠️ Daily Check-in Already Completed", `Come back after ${cooldownTime}`);
                    return true;
                } else {
                    logger.info("✅ Daily Check-in Successful", response.data);
                    return true;
                }
            } else {
                logger.error("❌ Daily Check-in Failed");
                return false;
            }
        } catch (error) {
            logger.error("Error during daily check-in:", error);
            return false;
        }
    }

    async checkNodeStatus() {
        const response = await this.makeRequest(
            "get",
            `https://referralapi.layeredge.io/api/light-node/node-status/${this.wallet.address}`
        );

        if (response && response.data && response.data.data.startTimestamp !== null) {
            logger.info("Node Status Running", response.data);
            return true;
        } else {
            logger.error("Node not running trying to start node...");
            return false;
        }
    }

    async claimProofSubmissionPoints() {
        const response = await this.makeRequest(
            "post",
            `https://referralapi.layeredge.io/api/light-node/claim-proof-submission-points/${this.wallet.address}`
        );
        if (response && response.data) {
            logger.info("Claimed Proof Submission Points", response.data);
            return true;
        } else {
            logger.error("Failed to claim proof submission points");
            return false;
        }
    }

    async stopNode() {
        const response = await this.makeRequest(
            "post",
            `https://referralapi.layeredge.io/api/light-node/stop-node/${this.wallet.address}`
        );
        if (response && response.data) {
            logger.info("Node Stopped", response.data);
            return true;
        }
        return false;
    }

    async connectNode() {
        const response = await this.makeRequest(
            "post",
            `https://referralapi.layeredge.io/api/light-node/start-node/${this.wallet.address}`
        );
        if (response && response.data) {
            logger.info("Node Started", response.data);
            return true;
        }
        return false;
    }

    async claimLightNodePoints() {
        const response = await this.makeRequest(
            "post",
            `https://referralapi.layeredge.io/api/light-node/claim-light-node-points/${this.wallet.address}`
        );
        if (response && response.data) {
            logger.info("Light Node Points Claimed", response.data);
            return true;
        }
        return false;
    }

    async checkNodePoints() {
        const response = await this.makeRequest(
            "get",
            `https://referralapi.layeredge.io/api/light-node/node-points/${this.wallet.address}`
        );
        if (response && response.data) {
            logger.info("Node Points", response.data);
            return true;
        }
        return false;
    }
}

async function processWalletsInChunks(wallets, chunkSize = 100) {
    const chunks = [];
    for (let i = 0; i < wallets.length; i += chunkSize) {
        chunks.push(wallets.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
        const promises = chunk.map(async (wallet, index) => {
            const proxy = proxies[index % proxies.length] || null;
            const { address, privateKey } = wallet;

            try {
                logger.verbose(`Processing wallet ${index + 1}/${chunk.length}`, address);
                const socket = new LayerEdgeConnection(proxy, privateKey);
                
                logger.progress(address, 'Wallet Processing Started', 'start');
                logger.info(`Wallet Details`, `Address: ${address}, Proxy: ${proxy || 'No Proxy'}`);

                logger.progress(address, 'Performing Daily Check-in', 'processing');
                await socket.dailyCheckIn();

                logger.progress(address, 'Submitting Proof', 'processing');
                await socket.submitProof();

                logger.progress(address, 'Claiming Proof Submission Points', 'processing');
                await socket.claimProofSubmissionPoints();

                logger.progress(address, 'Checking Node Status', 'processing');
                const isRunning = await socket.checkNodeStatus();

                if (isRunning) {
                    logger.progress(address, 'Claiming Node Points', 'processing');
                    await socket.stopNode();
                }

                logger.progress(address, 'Reconnecting Node', 'processing');
                await socket.connectNode();

                logger.progress(address, 'Claiming Light Node Points', 'processing');
                await socket.claimLightNodePoints();

                logger.progress(address, 'Checking Node Points', 'processing');
                await socket.checkNodePoints();

                logger.progress(address, 'Wallet Processing Complete', 'success');
            } catch (error) {
                logger.error(`Failed processing wallet ${address}`, '', error);
                logger.progress(address, 'Wallet Processing Failed', 'failed');
                await delay(5);
            }
        });

        await Promise.all(promises);
        logger.warn('Chunk Complete', `Waiting 1 second before processing next chunk...`);
        await delay(1); // Delay for 1 second before the next chunk starts
    }
}

async function run() {
    console.log(banner);
    logger.info('Starting Layer Edge Auto Bot', 'Initializing...');
    
    try {
        const proxies = await readFile('proxy.txt');
        let wallets = await readWallets();
        
        if (proxies.length === 0) {
            logger.warn('No Proxies', 'Running without proxy support');
        }
        
        if (wallets.length === 0) {
            throw new Error('No wallets configured');
        }

        logger.info('Configuration loaded', `Wallets: ${wallets.length}, Proxies: ${proxies.length}`);

        while (true) {
            await processWalletsInChunks(wallets, 100); // Run 100 wallets concurrently
            logger.warn('Cycle Complete', 'Waiting 1 hour before next run...');
            await delay(60 * 60); // Wait for 1 hour before the next run
        }
    } catch (error) {
        logger.error('Fatal error occurred', '', error);
        process.exit(1);
    }
}

run();
