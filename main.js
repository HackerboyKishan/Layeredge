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

// Function to read wallets from a file (e.g., wallets.txt)
async function readWallets() {
    try {
        const wallets = await readFile('wallets.txt');
        if (wallets.length === 0) {
            logger.warn('No wallets found in wallets.txt');
        }
        return wallets;
    } catch (error) {
        logger.error('Error reading wallets file:', error);
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

    // Other methods (checkInvite, registerWallet, connectNode, etc.) remain the same...
}

// Main loop to process wallets
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
            // We process up to 100 wallets at a time
            const walletChunks = [];
            for (let i = 0; i < Math.min(wallets.length, 100); i++) {
                const wallet = wallets[i];
                const proxy = proxies[i % proxies.length] || null;
                walletChunks.push(processWallet(wallet, proxy));
            }

            // Execute all wallet processing concurrently
            await Promise.all(walletChunks);

            logger.warn('Cycle Complete', 'Waiting 10 seconds before next run...');
            await delay(10); // Wait for 10 seconds before running again
        }
    } catch (error) {
        logger.error('Fatal error occurred', '', error);
        process.exit(1);
    }
}

// Define the `processWallet` function
async function processWallet(wallet, proxy = null) {
    try {
        logger.info('Processing wallet', wallet);
        
        const connection = new LayerEdgeConnection(proxy, wallet);
        
        // Example operation: Check if the wallet has an invite
        await connection.checkInvite(); // This should be implemented in the LayerEdgeConnection class

        // Example operation: Register wallet
        await connection.registerWallet(); // This should also be implemented in the LayerEdgeConnection class

        // Other operations (like node connection) could also be handled here
        logger.success(`Wallet processed successfully`, wallet);
    } catch (error) {
        logger.error('Error processing wallet', wallet, error);
    }
}

run();
