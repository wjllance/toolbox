export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface SwapEvent {
  id: string;
  protocol: string;
  version?: string;
  tokenIn: Token;
  tokenOut: Token;
  amountIn: string;
  amountOut: string;
  recipient: string;
  sender: string;
  logIndex: number;
  blockNumber: number;
  transactionHash: string;
  gasUsed?: string;
  gasPrice?: string;
}

export interface TransactionAnalysis {
  hash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  status: "success" | "failed";
  swaps: SwapEvent[];
  totalSwaps: number;
  protocolsUsed: string[];
  network?: "ETHEREUM" | "BASE";
}

export interface DEXProtocol {
  name: string;
  version?: string;
  network?: "ethereum" | "base";
  routerAddress: string;
  factoryAddress?: string;
  swapSignatures: string[];
  parseSwap?: (log: any) => SwapEvent | null;
}

export type SupportedProtocol =
  | "uniswap-v2"
  | "uniswap-v3"
  | "sushiswap"
  | "1inch"
  | "curve"
  | "balancer";
