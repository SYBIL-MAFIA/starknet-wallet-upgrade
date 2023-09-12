import fs from 'fs';
import { Account, CallData, constants, Contract, ec, hash, Provider, TransactionStatus } from 'starknet';
import { delay, numUpgraders, walletName } from '../index.js';
import { BraavosAbi } from './abi.js';

import {
    argentXaccountClassHash, argentXaccountClassHashNew,
    argentXproxyClassHash,
    braavosAccountClassHashNew,
    braavosInitialClassHash,
    braavosProxyClassHash,
    starkscan
} from './constants.js';

const provider = new Provider({ sequencer: { network: constants.NetworkName.SN_MAIN }});

export const loadArgentWallets = async () => {
    try {
        return fs.readFileSync('./data/private_keys.txt', "utf8")
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
}


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
    return await provider.getClassHashAt(address);
};


const getBraavosImplementation = async (address) => {
    const contract = await new Contract(BraavosAbi, address, provider);
    return await contract.functions.get_implementation();
}



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
            return await getArgentImplementation(address);
        case 'braavos':
            return (await getBraavosImplementation(address)).implementation;
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


const executeAndWaitTx = async (account, txPayload, address) => {
    try {
        const executeHash = await account.execute(txPayload);
        const res = await provider.waitForTransaction(executeHash.transaction_hash, { successStates: [TransactionStatus.ACCEPTED_ON_L2] });
        if (res) {
            console.log('Wallet successfully upgraded');
            console.log(`See transaction on explorer: ${ starkscan + executeHash.transaction_hash }`);
        }
    } catch (error) {
        console.error(`An error occurred while upgrading wallet | ${address} = ${error.message}`);
    }
};


export const txUpdateWallets = async (key) => {

    const address = await getAddress(walletName, key)
    const account = new Account(provider, address, key);

    await sleep();
    console.log(`Checking wallet version for address ${address} | ${walletName}`);
    try {
        let implementation = await getImplementation(walletName, address);

        const txPayload = await buildUpgradePayload(address, implementation);
        if (txPayload !== null) {
            await executeAndWaitTx(account, txPayload, address);
        }
    } catch (error) {
        console.error('An error occurred:', error)
    }
};


export const processWallets = async () => {
    const wallets = await loadArgentWallets();

    let index = 0;
    while (index < wallets.length) {
        const actualUpgraders = Math.min(wallets.length - index, numUpgraders);
        const currentBatch = wallets.slice(index, index + actualUpgraders);
        await Promise.all(currentBatch.map(wallet => txUpdateWallets(wallet)));
        index += actualUpgraders;
    }
};
