// 使用 viem 替代 ethers.js 实现 uniswap rebalance 交易分析
import { createPublicClient, http, parseAbi, decodeEventLog } from "viem";
import { base } from "viem/chains";
import Bottleneck from "bottleneck";

console.log("🚀 初始化客户端...");

// 定义多个 RPC 节点
const RPC_URLS = [
  process.env.RPC_URL,
  "https://base-mainnet.g.alchemy.com/v2/demo",
  "https://base.blockpi.network/v1/rpc/public",
  "https://base.meowrpc.com",
];

// 创建多个客户端
const clients = RPC_URLS.map((url) =>
  createPublicClient({
    chain: base,
    transport: http(url),
  })
);

let currentClientIndex = 0;

// 获取当前客户端
function getCurrentClient() {
  return clients[currentClientIndex];
}

// 切换到下一个客户端
function switchClient() {
  currentClientIndex = (currentClientIndex + 1) % clients.length;
  console.log(`🔄 切换到 RPC 节点 ${currentClientIndex + 1}`);
  return getCurrentClient();
}

const TX_HASH =
  "0xdcafedbc4517fed5409046081fb47fa3c30139e358585bddb8c86900a7f2ab99";

const UNISWAP_V3_ABI = parseAbi([
  "event Burn(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
  "event Mint(address sender, address indexed recipient, int24 tickLower, int24 tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
]);

const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const POOL_ABI = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

// 创建限流器，增加延迟时间
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 2000, // 增加到2秒
  reservoir: 1,
  reservoirRefreshAmount: 1,
  reservoirRefreshInterval: 2000,
});

// 添加缓存
const tokenCache = new Map();

// 重试函数
async function withRetry(fn, maxRetries = 3, initialDelay = 5000) {
  let retries = 0;
  let delay = initialDelay;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (retries >= maxRetries) {
        throw error;
      }

      if (error.cause?.status === 429) {
        console.log(
          `⏳ 遇到频率限制，等待 ${delay / 1000} 秒后重试... (${
            retries + 1
          }/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // 指数退避
        retries++;
        switchClient(); // 切换 RPC 节点
        continue;
      }

      throw error;
    }
  }
}

async function getTokenInfo(address) {
  // 检查缓存
  if (tokenCache.has(address)) {
    console.log(`📦 使用缓存的代币信息: ${address}`);
    return tokenCache.get(address);
  }

  try {
    const [symbol, decimals] = await Promise.all([
      limiter.schedule(() =>
        withRetry(() =>
          getCurrentClient().readContract({
            address,
            abi: ERC20_ABI,
            functionName: "symbol",
          })
        )
      ),
      limiter.schedule(() =>
        withRetry(() =>
          getCurrentClient().readContract({
            address,
            abi: ERC20_ABI,
            functionName: "decimals",
          })
        )
      ),
    ]);

    const tokenInfo = { address, symbol, decimals };
    // 存入缓存
    tokenCache.set(address, tokenInfo);
    return tokenInfo;
  } catch (error) {
    console.error(`❌ 获取代币信息失败: ${address}`, error);
    return null;
  }
}

async function analyzeTransaction(txHash) {
  console.log(`\n📝 开始分析交易: ${txHash}`);
  console.log("⏳ 获取交易收据...");

  const receipt = await withRetry(() =>
    getCurrentClient().getTransactionReceipt({ hash: txHash })
  );
  console.log(`✅ 交易收据获取成功，区块号: ${receipt.blockNumber}`);

  let poolAddress = null;
  let token0 = null;
  let token1 = null;
  let events = [];

  console.log(`\n🔍 开始分析 ${receipt.logs.length} 条日志...`);

  // 第一遍：收集所有事件并找到池子地址
  for (const log of receipt.logs) {
    try {
      const parsed = decodeEventLog({
        abi: UNISWAP_V3_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (parsed.eventName === "Swap" && !poolAddress) {
        poolAddress = log.address;
        console.log("\n🏊 发现 Uniswap V3 池子地址...");
        console.log(`📍 池子地址: ${poolAddress}`);

        console.log("⏳ 获取代币地址...");
        const token0Address = await withRetry(() =>
          getCurrentClient().readContract({
            abi: POOL_ABI,
            address: poolAddress,
            functionName: "token0",
          })
        );
        const token1Address = await withRetry(() =>
          getCurrentClient().readContract({
            abi: POOL_ABI,
            address: poolAddress,
            functionName: "token1",
          })
        );
        console.log(`✅ Token0 地址: ${token0Address}`);
        console.log(`✅ Token1 地址: ${token1Address}`);

        console.log("\n⏳ 获取代币信息...");
        token0 = await getTokenInfo(token0Address);
        token1 = await getTokenInfo(token1Address);

        if (token0 && token1) {
          console.log("\n📊 池子信息:");
          console.log(`Pool: ${poolAddress}`);
          console.log(`Token0: ${token0.symbol} (${token0.decimals} decimals)`);
          console.log(
            `Token1: ${token1.symbol} (${token1.decimals} decimals)\n`
          );
        }
      }

      if (parsed.eventName) {
        events.push({ log, parsed });
      }
    } catch (err) {
      // 非 Uniswap 日志，忽略
      continue;
    }
  }

  // 第二遍：处理所有事件
  if (token0 && token1) {
    for (const { log, parsed } of events) {
      const format = (val, decimals) => Number(val) / 10 ** decimals;

      if (parsed.eventName === "Burn") {
        console.log(`\n🔥 Burn 事件:`);
        console.log(`  liquidity: ${parsed.args.liquidity.toString()}`);
        console.log(
          `  amount0: ${format(parsed.args.amount0, token0.decimals)} ${
            token0.symbol
          }`
        );
        console.log(
          `  amount1: ${format(parsed.args.amount1, token1.decimals)} ${
            token1.symbol
          }`
        );
      }

      if (parsed.eventName === "Collect") {
        console.log(`\n💰 Collect 事件:`);
        console.log(
          `  amount0: ${format(parsed.args.amount0, token0.decimals)} ${
            token0.symbol
          }`
        );
        console.log(
          `  amount1: ${format(parsed.args.amount1, token1.decimals)} ${
            token1.symbol
          }`
        );
      }

      if (parsed.eventName === "Swap") {
        console.log(`\n🔁 Swap 事件:`);
        const amount0 = format(parsed.args.amount0, token0.decimals);
        const amount1 = format(parsed.args.amount1, token1.decimals);
        if (amount0 < 0) {
          console.log(
            `  用 ${Math.abs(amount0)} ${token0.symbol} 换取 ${amount1} ${
              token1.symbol
            }`
          );
        } else {
          console.log(
            `  用 ${Math.abs(amount1)} ${token1.symbol} 换取 ${amount0} ${
              token0.symbol
            }`
          );
        }
      }

      if (parsed.eventName === "Mint") {
        console.log(`\n➕ Mint 事件:`);
        console.log(`  liquidity: ${parsed.args.amount.toString()}`);
        console.log(
          `  amount0: ${format(parsed.args.amount0, token0.decimals)} ${
            token0.symbol
          }`
        );
        console.log(
          `  amount1: ${format(parsed.args.amount1, token1.decimals)} ${
            token1.symbol
          }`
        );
        console.log(`  tickLower: ${parsed.args.tickLower}`);
        console.log(`  tickUpper: ${parsed.args.tickUpper}`);
      }
    }
  } else {
    console.error("❌ 无法获取代币信息，跳过事件分析");
  }

  console.log("\n✨ 交易分析完成!");
}

console.log("📡 连接到 Base 网络...");
analyzeTransaction(TX_HASH);
