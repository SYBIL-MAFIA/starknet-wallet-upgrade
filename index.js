import { processWallets } from './utils/helpers.js';

export const walletName = 'argent' // braavos | argent
export const numUpgraders = 5;
export const delay = [20, 120];

async function main() {
    await processWallets();
}

main().catch(error => console.error(error));
