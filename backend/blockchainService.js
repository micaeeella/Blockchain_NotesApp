// backend/blockchainService.js
require("dotenv").config();
const { BlockFrostAPI } = require("@blockfrost/blockfrost-js");

const projectId = process.env.BLOCKFROST_PROJECT_ID;
const network = process.env.BLOCKFROST_NETWORK || "preview";

if (!projectId) {
  console.warn("⚠️ BLOCKFROST_PROJECT_ID is not set in .env");
}

const api = new BlockFrostAPI({
  projectId,
  network,
});

// Get UTxOs + simple ADA summary
async function getAddressSummary(address) {
  const utxos = await api.addressesUtxos(address);
  let lovelace = 0n;

  for (const utxo of utxos) {
    for (const amount of utxo.amount) {
      if (amount.unit === "lovelace") {
        lovelace += BigInt(amount.quantity);
      }
    }
  }

  return {
    address,
    utxos,
    lovelace: lovelace.toString(),
    ada: Number(lovelace) / 1_000_000,
  };
}

async function getAddressUtxos(address) {
  const utxos = await api.addressesUtxos(address);
  return utxos;
}

// Submit signed transaction (CBOR hex) to Blockfrost
async function submitTx(signedTxHex) {
  // Blockfrost expects a Buffer with raw bytes
  const txBytes = Buffer.from(signedTxHex, "hex");
  const txHash = await api.txSubmit(txBytes);
  return txHash;
}

module.exports = {
  getAddressSummary,
  getAddressUtxos,
  submitTx,
};
