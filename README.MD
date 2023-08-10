[![Typing SVG](https://readme-typing-svg.demolab.com?font=Raleway&weight=500&size=50&duration=3000&pause=1000&color=20F700&center=true&vCenter=true&width=640&height=90&lines=Starknet+Wallet+Upgrade)](https://git.io/typing-svg)

# StarkNet wallets upgrader

This code will allow you to upgrade Starknet wallets.

## Install dependencies
For the code to work, you need to install the following dependencies:

- starknet - 5.14.1

You can install it using:
```
npm i
```

or
```
npm i starknet@5.14.1
```

## Wallet upgrader

In index.js set:
1. `walletName = argent` or `braavos`, depends on wallet you need to upgrade
2. `numUpgraders = N` - number of wallets upgrade in the same time
3. `delay = [N, K]` - delay between wallets.

Fill in the private keys file in `data/private_keys.txt`

Before upgrade, soft checks you wallet version, if wallet is already upgraded it will be passed.

## Conclusion
```
git clone https://github.com/SYBIL-MAFIA/starknet-wallet-upgrade.git
cd starknet-wallet-upgrade
npm i
open index.js
node index.js
```

### Support / Qs

`Telegram:` https://t.me/retrodropTools | https://t.me/fraggdiller
