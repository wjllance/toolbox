// 主流DEX协议的合约地址和事件签名
export const DEX_PROTOCOLS = {
  // Ethereum Mainnet
  UNISWAP_V2: {
    name: "Uniswap V2",
    version: "2",
    network: "ethereum",
    routerAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    factoryAddress: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    swapSignatures: [
      "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // Swap event
    ],
  },
  UNISWAP_V3: {
    name: "Uniswap V3",
    version: "3",
    network: "ethereum",
    routerAddress: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    factoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    swapSignatures: [
      "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67", // Swap event
    ],
  },
  SUSHISWAP: {
    name: "SushiSwap",
    version: "1",
    network: "ethereum",
    routerAddress: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    factoryAddress: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
    swapSignatures: [
      "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // Swap event (same as Uniswap V2)
    ],
  },
  ONE_INCH: {
    name: "1inch",
    version: "5",
    network: "ethereum",
    routerAddress: "0x1111111254eeb25477b68fb85ed929f73a960582",
    swapSignatures: [
      "0x27c98e911efdd224f4002f6cd831c3ad0d2759ee176f9ee8466cf638fefdec4d", // OrderFilled
    ],
  },
  CURVE: {
    name: "Curve",
    version: "1",
    network: "ethereum",
    routerAddress: "0x99a58482BD75cbab83b27EC03CA68fF489b5788f",
    swapSignatures: [
      "0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140", // TokenExchange
      "0xd013ca23e77a65003c2c659c5442c00c805371b7fc1ebd4c206c41d1536bd90b", // TokenExchangeUnderlying
    ],
  },
  
  // Base Network
  AERODROME: {
    name: "Aerodrome",
    version: "1",
    network: "base",
    routerAddress: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    factoryAddress: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
    swapSignatures: [
      "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // Swap event (compatible with Uniswap V2)
    ],
  },
  BASESWAP: {
    name: "BaseSwap",
    version: "1",
    network: "base",
    routerAddress: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",
    factoryAddress: "0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB",
    swapSignatures: [
      "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // Swap event (compatible with Uniswap V2)
    ],
  },
  SUSHI_BASE: {
    name: "SushiSwap (Base)",
    version: "1",
    network: "base",
    routerAddress: "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891",
    factoryAddress: "0x71524B4f93c58fcef4985287D9b149f3A4c7f9B3",
    swapSignatures: [
      "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // Swap event (compatible with Uniswap V2)
    ],
  },
} as const;

// 常用的稳定币和原生代币地址
export const COMMON_TOKENS = {
  // Ethereum Tokens
  ETH: {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    network: "ethereum",
  },
  WETH: {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    name: "Wrapped Ethereum",
    decimals: 18,
    network: "ethereum",
  },
  USDC_ETH: {
    address: "0xA0b86a33E6417c0c68b3B4f59a2b96b726A0E15B",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    network: "ethereum",
  },
  USDT_ETH: {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    network: "ethereum",
  },
  DAI_ETH: {
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    network: "ethereum",
  },
  
  // Base Tokens
  BASE_ETH: {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "ETH",
    name: "Ethereum (Base)",
    decimals: 18,
    network: "base",
  },
  WETH_BASE: {
    address: "0x4200000000000000000000000000000000000006",
    symbol: "WETH",
    name: "Wrapped Ethereum (Base)",
    decimals: 18,
    network: "base",
  },
  USDC_BASE: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    name: "USD Coin (Base)",
    decimals: 6,
    network: "base",
  },
  DAI_BASE: {
    address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    symbol: "DAI",
    name: "Dai Stablecoin (Base)",
    decimals: 18,
    network: "base",
  },
  CBETH_BASE: {
    address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22",
    symbol: "cbETH",
    name: "Coinbase Wrapped Staked ETH (Base)",
    decimals: 18,
    network: "base",
  },
} as const;

// RPC节点配置
export const RPC_URLS = {
  ETHEREUM_MAINNET:
    process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || "https://rpc.ankr.com/eth",
  ALCHEMY: process.env.NEXT_PUBLIC_ALCHEMY_URL,
  INFURA: process.env.NEXT_PUBLIC_INFURA_URL,
  BASE_MAINNET:
    process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org",
} as const;

// 支持的网络
export const SUPPORTED_NETWORKS = {
  ETHEREUM: {
    id: 1,
    name: "Ethereum",
    nativeCurrency: {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrl: RPC_URLS.ETHEREUM_MAINNET,
    blockExplorer: "https://etherscan.io",
  },
  BASE: {
    id: 8453,
    name: "Base",
    nativeCurrency: {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrl: RPC_URLS.BASE_MAINNET,
    blockExplorer: "https://basescan.org",
  },
} as const;
