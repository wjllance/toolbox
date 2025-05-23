import { ethers } from "ethers";
import { TransactionAnalysis, SwapEvent, Token } from "@/types/swap";
import { DEX_PROTOCOLS, RPC_URLS, SUPPORTED_NETWORKS } from "./constants";

// 定义协议键的类型
// 这解决了TypeScript不能正确识别 DEX_PROTOCOLS 对象的键的类型问题
type ProtocolKey = keyof typeof DEX_PROTOCOLS;

// 创建provider
export function createProvider(network: "ETHEREUM" | "BASE" = "ETHEREUM") {
  const rpcUrl = network === "ETHEREUM" ? RPC_URLS.ETHEREUM_MAINNET : RPC_URLS.BASE_MAINNET;
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
export async function parseSwapEvents(txHash: string, network: "ETHEREUM" | "BASE" = "ETHEREUM"): Promise<SwapEvent[]> {
  const provider = createProvider(network);
  const swapEvents: SwapEvent[] = [];

  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      throw new Error("Transaction not found");
    }

    // 创建一个带类型的协议映射，用于过滤网络特定的协议
    const networkProtocols = Object.entries(DEX_PROTOCOLS).filter(([_, protocol]) => {
      const protocolObj = protocol as any;
      const protocolNetwork = (protocolObj.network || "ethereum").toLowerCase();
      const currentNetworkStr = network === "ETHEREUM" ? "ethereum" : "base";
      return protocolNetwork === currentNetworkStr;
    });

    // 遍历所有logs，寻找swap相关的事件
    for (const log of receipt.logs) {
      for (const [protocolKey, protocol] of networkProtocols) {
        if (protocol.swapSignatures.includes(log.topics[0])) {
          let swapEvent: SwapEvent | null = null;

          // 根据协议类型使用不同的解析器
          if (["UNISWAP_V2", "SUSHISWAP"].includes(protocolKey)) {
            swapEvent = parseUniswapV2SwapEvent(
              log,
              txHash,
              receipt.blockNumber
            );
          } else if (["AERODROME", "BASESWAP", "SUSHI_BASE"].includes(protocolKey)) {
            // Base 网络上的 DEX 协议大多兼容 Uniswap V2 的事件格式
            swapEvent = parseUniswapV2SwapEvent(
              log,
              txHash,
              receipt.blockNumber
            );
          } else {
            console.log(`Parser for ${protocol.name} not implemented yet`);
          }

          if (swapEvent) {
            // 添加协议信息
            swapEvent.protocol = protocol.name;
            swapEvent.version = protocol.version || "1";
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
  txHash: string,
  network: "ETHEREUM" | "BASE" = "ETHEREUM"
): Promise<TransactionAnalysis> {
  const provider = createProvider(network);
  const networkName = SUPPORTED_NETWORKS[network].name;

  try {
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(txHash),
      provider.getTransactionReceipt(txHash),
    ]);

    if (!tx || !receipt) {
      throw new Error(`Transaction not found on ${networkName} network`);
    }

    const block = await provider.getBlock(receipt.blockNumber);
    const swaps = await parseSwapEvents(txHash, network);

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
      network: network,
    };
  } catch (error) {
    console.error(`Failed to analyze transaction on ${networkName}:`, error);
    throw error;
  }
}
