import { ethers } from "ethers";
import { TransactionAnalysis, SwapEvent, Token } from "@/types/swap";
import { DEX_PROTOCOLS, RPC_URLS } from "./constants";

// 创建provider
export function createProvider() {
  const rpcUrl = RPC_URLS.ETHEREUM_MAINNET;
  return new ethers.JsonRpcProvider(rpcUrl);
}

// 获取token信息的ABI
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
];

// 获取token信息
export async function getTokenInfo(
  tokenAddress: string,
  provider: ethers.Provider
): Promise<Token> {
  try {
    // 如果是ETH地址，直接返回ETH信息
    if (
      tokenAddress === "0x0000000000000000000000000000000000000000" ||
      tokenAddress.toLowerCase() ===
        "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
    ) {
      return {
        address: tokenAddress,
        symbol: "ETH",
        name: "Ethereum",
        decimals: 18,
      };
    }

    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [symbol, name, decimals] = await Promise.all([
      contract.symbol(),
      contract.name(),
      contract.decimals(),
    ]);

    return {
      address: tokenAddress,
      symbol,
      name,
      decimals: Number(decimals),
    };
  } catch (error) {
    console.error(`Failed to get token info for ${tokenAddress}:`, error);
    return {
      address: tokenAddress,
      symbol: "UNKNOWN",
      name: "Unknown Token",
      decimals: 18,
    };
  }
}

// 解析Uniswap V2类型的Swap事件
function parseUniswapV2SwapEvent(
  log: ethers.Log,
  txHash: string,
  blockNumber: number
): SwapEvent | null {
  try {
    // Uniswap V2 Swap事件ABI
    const swapInterface = new ethers.Interface([
      "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
    ]);

    const parsed = swapInterface.parseLog(log);
    if (!parsed) return null;

    const { sender, amount0In, amount1In, amount0Out, amount1Out, to } =
      parsed.args;

    // 简化处理：这里需要根据pool地址获取token信息
    // 实际实现中需要调用pair合约的token0()和token1()方法
    return {
      id: `${txHash}-${log.index}`,
      protocol: "Uniswap V2",
      version: "2",
      tokenIn: {
        address: "0x0000000000000000000000000000000000000000", // 需要实际解析
        symbol: "TOKEN_IN",
        name: "Token In",
        decimals: 18,
      },
      tokenOut: {
        address: "0x0000000000000000000000000000000000000000", // 需要实际解析
        symbol: "TOKEN_OUT",
        name: "Token Out",
        decimals: 18,
      },
      amountIn: (amount0In.toString() !== "0"
        ? amount0In
        : amount1In
      ).toString(),
      amountOut: (amount0Out.toString() !== "0"
        ? amount0Out
        : amount1Out
      ).toString(),
      recipient: to,
      sender: sender,
      logIndex: log.index,
      blockNumber: blockNumber,
      transactionHash: txHash,
    };
  } catch (error) {
    console.error("Failed to parse Uniswap V2 swap event:", error);
    return null;
  }
}

// 解析交易中的swap事件
export async function parseSwapEvents(txHash: string): Promise<SwapEvent[]> {
  const provider = createProvider();
  const swapEvents: SwapEvent[] = [];

  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      throw new Error("Transaction not found");
    }

    // 遍历所有logs，寻找swap相关的事件
    for (const log of receipt.logs) {
      // 检查是否是已知的swap事件签名
      for (const [protocolKey, protocol] of Object.entries(DEX_PROTOCOLS)) {
        if (protocol.swapSignatures.includes(log.topics[0])) {
          let swapEvent: SwapEvent | null = null;

          switch (protocolKey) {
            case "UNISWAP_V2":
            case "SUSHISWAP":
              swapEvent = parseUniswapV2SwapEvent(
                log,
                txHash,
                receipt.blockNumber
              );
              break;
            // 这里可以添加其他协议的解析逻辑
            default:
              console.log(`Parser for ${protocol.name} not implemented yet`);
          }

          if (swapEvent) {
            swapEvents.push(swapEvent);
          }
        }
      }
    }

    return swapEvents;
  } catch (error) {
    console.error("Failed to parse swap events:", error);
    throw error;
  }
}

// 分析完整的交易
export async function analyzeTransaction(
  txHash: string
): Promise<TransactionAnalysis> {
  const provider = createProvider();

  try {
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(txHash),
      provider.getTransactionReceipt(txHash),
    ]);

    if (!tx || !receipt) {
      throw new Error("Transaction not found");
    }

    const block = await provider.getBlock(receipt.blockNumber);
    const swaps = await parseSwapEvents(txHash);

    // 获取使用的协议列表
    const protocolsUsed = [...new Set(swaps.map((swap) => swap.protocol))];

    return {
      hash: txHash,
      blockNumber: receipt.blockNumber,
      timestamp: block?.timestamp || 0,
      from: tx.from,
      to: tx.to || "",
      value: tx.value.toString(),
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: tx.gasPrice?.toString() || "0",
      status: receipt.status === 1 ? "success" : "failed",
      swaps,
      totalSwaps: swaps.length,
      protocolsUsed,
    };
  } catch (error) {
    console.error("Failed to analyze transaction:", error);
    throw error;
  }
}
