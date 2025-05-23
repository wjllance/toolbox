// 主流DEX协议的合约地址和事件签名
export const DEX_PROTOCOLS = {
  UNISWAP_V2: {
    name: "Uniswap V2",
    version: "2",
    routerAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    factoryAddress: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    swapSignatures: [
      "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // Swap event
    ],
  },
  UNISWAP_V3: {
    name: "Uniswap V3",
    version: "3",
    routerAddress: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    factoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    swapSignatures: [
      "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67", // Swap event
    ],
  },
  SUSHISWAP: {
    name: "SushiSwap",
    version: "1",
    routerAddress: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    factoryAddress: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
    swapSignatures: [
      "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // Swap event (same as Uniswap V2)
    ],
  },
  ONE_INCH: {
    name: "1inch",
    version: "5",
    routerAddress: "0x1111111254eeb25477b68fb85ed929f73a960582",
    swapSignatures: [
      "0x27c98e911efdd224f4002f6cd831c3ad0d2759ee176f9ee8466cf638fefdec4d", // OrderFilled
    ],
  },
  CURVE: {
    name: "Curve",
    version: "1",
    routerAddress: "0x99a58482BD75cbab83b27EC03CA68fF489b5788f",
    swapSignatures: [
      "0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140", // TokenExchange
      "0xd013ca23e77a65003c2c659c5442c00c805371b7fc1ebd4c206c41d1536bd90b", // TokenExchangeUnderlying
    ],
  },
} as const;

// 常用的稳定币和ETH地址
export const COMMON_TOKENS = {
  ETH: {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
  },
  WETH: {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    name: "Wrapped Ethereum",
    decimals: 18,
  },
  USDC: {
    address: "0xA0b86a33E6417c0c68b3B4f59a2b96b726A0E15B",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  USDT: {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
  },
  DAI: {
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
  },
} as const;

// RPC节点配置
export const RPC_URLS = {
  ETHEREUM_MAINNET:
    process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || "https://rpc.ankr.com/eth",
  ALCHEMY: process.env.NEXT_PUBLIC_ALCHEMY_URL,
  INFURA: process.env.NEXT_PUBLIC_INFURA_URL,
} as const;
