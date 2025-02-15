import fs from 'fs/promises';
import log from './utils/logger.js';
import { readFiles, delay } from './utils/helper.js';
import banner from './utils/banner.js';
import LayerEdge from './utils/socket.js';

const WALLETS_PATH = 'wallets.json';  // Change to walletsRef.json if you want to run ref wallets

// Function to read wallets 
async function readWallets() {
    try {
        await fs.access(WALLETS_PATH);
        const data = await fs.readFile(WALLETS_PATH, "utf-8");
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            log.info("No wallets found in", WALLETS_PATH);
            return [];
        }
        throw err;
    }
}

// Concurrency limit
const CONCURRENCY_LIMIT = 20; // Max number of concurrent tasks

async function processWallet(wallet, proxy) {
    const { address, privateKey } = wallet;
    try {
        const socket = new LayerEdge(proxy, privateKey);
        log.info(`Processing Wallet Address: ${address} with proxy:`, proxy);
        log.info(`Checking Node Status for: ${address}`);
        await socket.checkIN();
        const isRunning = await socket.checkNodeStatus();

        if (isRunning) {
            log.info(`Wallet ${address} is running - trying to claim node points...`);
            await socket.stopNode();
        }
        log.info(`Trying to reconnect node for Wallet: ${address}`);
        await socket.connectNode();

        log.info(`Checking Node Points for Wallet: ${address}`);
        await socket.checkNodePoints();
    } catch (error) {
        log.error(`Error Processing wallet ${wallet.address}:`, error.message);
    }
}

// Function to run tasks concurrently with limit
async function run() {
    log.info(banner);
    await delay(3);

    const proxies = await readFiles('proxy.txt');
    let wallets = await readWallets();
    
    if (proxies.length === 0) log.warn("No proxies found in proxy.txt - running without proxies");
    if (wallets.length === 0) {
        log.info('No Wallets found, creating new Wallets first "npm run autoref"');
        return;
    }

    log.info('Starting run Program with all Wallets:', wallets.length);

    while (true) {
        // Process wallets in parallel with concurrency limit
        const promises = [];
        for (let i = 0; i < wallets.length; i++) {
            const wallet = wallets[i];
            const proxy = proxies[i % proxies.length] || null;
            promises.push(processWallet(wallet, proxy));

            // If we reach concurrency limit, wait for the ongoing tasks
            if (promises.length >= CONCURRENCY_LIMIT) {
                await Promise.all(promises);
                promises.length = 0; // Clear the array
            }
        }

        // Process any remaining wallets after the loop
        if (promises.length > 0) {
            await Promise.all(promises);
        }

        log.warn(`All Wallets have been processed, waiting 1 hour before next run...`);
        await delay(60 * 60);
    }
}

run();
