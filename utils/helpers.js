import fs from 'fs';
import { Account, CallData, constants, Contract, ec, hash, RpcProvider } from 'starknet';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { delay, ERC20, maxGwei, numUpgraders, shuffle, UseMmnemonic, walletName } from '../index.js';
import { BraavosAbi } from './abi.js';
import { HDNodeWallet, Wallet, JsonRpcProvider, formatUnits } from 'ethers';
import {
    argentXaccountClassHash,
    argentXaccountClassHashNew,
    argentXproxyClassHash,
    braavosAccountClassHashNew,
    braavosInitialClassHash,
    braavosProxyClassHash,
    starkscan
} from './constants.js';

const provider = new RpcProvider({nodeUrl: "https://starknet.blockpi.network/v1/rpc/public", retries:3})


export const loadArgentWallets = async () => {
    try {
        return fs.readFileSync('./data/starkData.txt', "utf8")
            .split("\n")
            .map(row => row.trim())
            .filter(row => row !== "") ;
    } catch (err) {
        console.error(`Error while loading wallet data: ${err.message}`);
        throw err;
    }
};


const randomDelay = () => {
    const seconds = Math.random() * (delay[1] - delay[0]) + delay[0];
    console.log(`Delaying ${seconds} seconds`);
    return Math.round(seconds * 1000);
};


export const sleep = (seconds) => {
    if (typeof seconds === 'number' && !isNaN(seconds)) {
        const milliseconds = seconds * 1000;
        return new Promise((resolve) => setTimeout(resolve, milliseconds));
    } else {
        const randomMilliseconds = randomDelay();
        return new Promise((resolve) => setTimeout(resolve, randomMilliseconds));
    }
};


const calculateArgentAddress = async (privateKey) => {

    const publicKey = ec.starkCurve.getStarkKey(privateKey);

    const ConstructorCallData = CallData.compile({
        implementation: argentXaccountClassHash,
        selector: hash.getSelectorFromName("initialize"),
        calldata: CallData.compile({ signer: publicKey, guardian: "0" }),
    });

    return hash.calculateContractAddressFromHash(
        publicKey,
        argentXproxyClassHash,
        ConstructorCallData,
        0
    );
};


const calculateInitializer = async (publicKey) => {
    return CallData.compile({ public_key: publicKey });
};


const build_proxyConstructor = async (Initializer) => {
    return CallData.compile({
        implementation_address: braavosInitialClassHash,
        initializer_selector: hash.getSelectorFromName('initializer'),
        calldata: [...Initializer],
    });
};


const build_proxyConstructorCallData = async (publicKey) => {
    const Initializer = await calculateInitializer(publicKey);
    return build_proxyConstructor(Initializer);
};


const calculateBraavosAddress = async (key) => {
    const publicKey = ec.starkCurve.getStarkKey(key);
    const ProxyConstructorCallData = await build_proxyConstructorCallData(publicKey);

    return hash.calculateContractAddressFromHash(
        publicKey,
        braavosProxyClassHash,
        ProxyConstructorCallData,
        0
    );
};


const getArgentImplementation = async (address) => {
    try {
        return await provider.getClassHashAt(address);
    } catch (error) {
        if (error.message && error.message.includes("is not deployed")) {
            console.log("Wallet is not deployed yet.");
            return undefined;
        } else {
            console.log('An error occurred', error);
            return undefined;
        }
    }
};


const getBraavosImplementation = async (address) => {
    try {
        const contract = await new Contract(BraavosAbi, address, provider);
        return await contract.functions.get_implementation();
    } catch (error) {
        if (error.message && error.message.includes("is not deployed")) {
            console.log(`Wallet is not deployed yet - ${address}.`);
            return undefined;
        } else {
            console.log(`${address} - An error occurred ${error}.`);
            return undefined;
        }
    }
};



const getAddress = async (walletName, key) => {
    switch (walletName){
        case 'argent':
            return await calculateArgentAddress(key);
        case 'braavos':
            return calculateBraavosAddress(key);
        default:
            throw new Error('Unknown walletName');
    }
};


const getImplementation = async (walletName, address) => {
    switch (walletName) {
        case 'argent':
            const implementation = await getArgentImplementation(address);
            if (implementation !== undefined) {
                return implementation;
            } else {
                return undefined;
            }
        case 'braavos':
            const implementationBraavos = (await getBraavosImplementation(address));
            if (implementationBraavos !== undefined) {
                return implementationBraavos.implementation;
            } else {
                return undefined;
            }
        default:
            throw new Error('Unknown walletName');
    }
};


const buildUpgradePayload = async (address, implementation) => {
    switch (walletName) {
        case 'argent':
            if (implementation !== '0x1a736d6ed154502257f02b1ccdf4d9d1089f80811cd6acad48e6b6a9d1f2003') {
                return [{
                    contractAddress: address,
                    entrypoint: 'upgrade',
                    calldata: CallData.compile({
                        implementation: argentXaccountClassHashNew,
                        calldata: ['0'],
                    })
                }];
            } else {
                console.log(`Wallet has already been upgraded | ${address}`);
                return null;
            }
        case 'braavos':
            if (implementation !== 2655151451055183738536515324425311349966178541063137855096471676700129075298n) {
                return [{
                    contractAddress: address,
                    entrypoint: 'upgrade',
                    calldata: CallData.compile({
                        new_implementation: braavosAccountClassHashNew,
                    })
                }];
            } else {
                console.log(`Wallet has already been upgraded | ${address}`);
                return null;
            }
        default:
            throw new Error('Unknown walletName');
    }
};

export const WaitForGas = async () => {
    try {
        const provider = new JsonRpcProvider(ERC20);
        while (true) {
            const latestBlock = await provider.getBlock('latest');
            let baseFee = latestBlock.baseFeePerGas;
            let current_gas = parseFloat(formatUnits(baseFee, 'gwei'));
            if (current_gas >= maxGwei) {
                console.log(`Gas is high, waiting for 1 min.... current ${current_gas} | max ${maxGwei}`);
                await sleep(60);
            } else {
                return true;
            }
        }
    } catch (e) {
        console.log(e);
        throw new Error(e);
    }
};


const executeAndWaitTx = async (account, txPayload, address) => {
    try {
        await WaitForGas()
        const executeHash = await account.execute(txPayload);
        const res = await provider.waitForTransaction(executeHash.transaction_hash);
        if (res) {
            console.log('Wallet successfully upgraded');
            console.log(`See transaction on explorer: ${ starkscan + executeHash.transaction_hash }`);
        }
    } catch (error) {
        console.error(`An error occurred while upgrading wallet | ${address} = ${error.message}`);
    }
};


export const txUpdateWallets = async (key) => {

    const address = await getAddress(walletName, key);
    const account = new Account(provider, address, key);

    await sleep();
    console.log(`Checking wallet version for address ${address} | ${walletName}`);
    try {
        let implementation = await getImplementation(walletName, address);
        let txPayload;
        if (implementation !== undefined) {
            txPayload = await buildUpgradePayload(address, implementation);
        }
        if (txPayload !== null) {
            await executeAndWaitTx(account, txPayload, address);
        }
    } catch (error) {
        console.error('An error occurred:', error)
    }
};

const getPKFromMnemonicArgent = async(mnemonics)=>{
    let pk = []
    const path = "m/44'/9004'/0'/0/0";

    for (const mnemonic of mnemonics) {
        const signer = (Wallet.fromPhrase(mnemonic)).privateKey;
        const masterNode = HDNodeWallet.fromSeed(
            toHexString(signer));
        const childNode = masterNode.derivePath(path);

        pk.push('0x' + ec.starkCurve.grindKey(childNode.privateKey).toString());
    }

    return pk;
};

const getPkFromMnemonicBraavos = async (mnemonics) => {
    let pk = [];
    const path = "m/44'/9004'/0'/0/0";

    for (const mnemonic of mnemonics) {
        const seed = mnemonicToSeedSync(mnemonic);
        const hdKey = HDKey.fromMasterSeed(seed);
        const hdKeyDerived = hdKey.derive(path);

        pk.push("0x" + ec.starkCurve.grindKey(hdKeyDerived.privateKey).toString());
    }

    return pk;
};


export const getPkFromMnemo = async (mnemonics) => {
    switch (walletName) {
        case 'argent':
            return await getPKFromMnemonicArgent(mnemonics);
        case 'braavos':
            return await getPkFromMnemonicBraavos(mnemonics);
        default:
            throw new Error('Unknown walletName');
    }
}

const toHexString = (value) => {
    let hex = BigInt(value).toString(16);
    if (hex.length % 2 !== 0) {
        hex = '0' + hex;
    }
    return '0x' + hex;
};


const shuffleWallets = async (wallets) => {
    for (let i = wallets.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wallets[i], wallets[j]] = [wallets[j], wallets[i]];
    }
    return wallets;
}


export const processWallets = async () => {
    let wallets = await loadArgentWallets();
    if (UseMmnemonic) {
        wallets = await getPkFromMnemo(wallets);
    }

    if (shuffle) {
        wallets = await shuffleWallets(wallets);
    }

    let index = 0;
    while (index < wallets.length) {
        const actualUpgraders = Math.min(wallets.length - index, numUpgraders);
        const currentBatch = wallets.slice(index, index + actualUpgraders);
        await Promise.all(currentBatch.map(wallet => txUpdateWallets(wallet)));
        index += actualUpgraders;
    }
};
