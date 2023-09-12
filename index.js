import { processWallets } from './utils/helpers.js';

export const walletName = 'braavos' // braavos | argent
export const numUpgraders = 5;
export const delay = [1, 1];

async function main() {
    await processWallets();
}

main().catch(error => console.error(error));
