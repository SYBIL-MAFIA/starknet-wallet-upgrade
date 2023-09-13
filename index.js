import { processWallets } from './utils/helpers.js';

export const walletName = 'braavos'; // braavos | argent
export const numUpgraders = 2; // num wallets to upgrade at same time
export const delay = [1, 1]; // delay between wallets
export const shuffle = true; // shuffle wallets true | false
export const UseMmnemonic = true; // use mnemonics true | false   if true, enter mnemonics in starkData.txt

export const maxGwei = 10; // max gas in gwei
export const ERC20 = 'https://api.zmok.io/mainnet/oaen6dy8ff6hju9k'; // erc20 rpc

async function main() {
    await processWallets();
}

main().catch(error => console.error(error));