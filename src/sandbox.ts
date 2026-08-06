import { hashTypedData, encodeAbiParameters, encodeFunctionData } from 'viem'

const hash = hashTypedData({
  domain: {
    name: 'USD Coin',
    version: '2',
    chainId: 8453,
    verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  },
  types: {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }
    ]
  },
  primaryType: 'TransferWithAuthorization',
  message: {
    from: '0x0470F4D1c2Cde7f3CC7ce34Aff2b205e227191f4',
    to: '0x853F2c11774bB08031E7DeA93803569bbe2058F8',
    value: 5000000n,
    validAfter: 0n,
    validBefore: 1776205203n,
    nonce: '0x0829e90678478698ff4337a0df46da5390ab433f68ab905a723dc29ba2afd1f3'
  }
})

const calldata = encodeFunctionData({
  abi: [{
    inputs: [
      { name: 'hash', type: 'bytes32' },
      { name: 'signature', type: 'bytes' }
    ],
    name: 'isValidSignature',
    outputs: [{ name: 'magicValue', type: 'bytes4' }],
    stateMutability: 'view',
    type: 'function'
  }],
  functionName: 'isValidSignature',
  args: [
    hash,
    '0x01845ADb2C711129d4f3966735eD98a9F09fC4cE5734eb1fde36fa0c4f8ad339376bb1653dc8ce517998f61df74d96ad3bb04c09606534cc92a29ad9d3e874b8cb1c73a2c2534678d07ae28ba042f1df3ad2b266fb1c'
  ]
})

console.log('hash:', hash)
console.log('calldata:', calldata)