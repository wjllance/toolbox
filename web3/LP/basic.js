// 使用 viem 替代 ethers.js 实现 uniswap rebalance 交易分析
import { createPublicClient, http, parseAbi, decodeEventLog } from "viem";
import { base } from "viem/chains";
import Bottleneck from "bottleneck";

// =============== 配置 ===============
console.log("🚀 初始化客户端...");

// RPC 节点配置
const RPC_URLS = [
  process.env.RPC_URL,
  "https://base-mainnet.g.alchemy.com/v2/demo",
  "https://base.blockpi.network/v1/rpc/public",
  "https://base.meowrpc.com",
];

// 创建多个客户端实例
const clients = RPC_URLS.map((url) =>
  createPublicClient({
    chain: base,
    transport: http(url),
  })
);

let currentClientIndex = 0;

// =============== 工具函数 ===============
function getCurrentClient() {
  return clients[currentClientIndex];
}

function switchClient() {
  currentClientIndex = (currentClientIndex + 1) % clients.length;
  console.log(`🔄 切换到 RPC 节点 ${currentClientIndex + 1}`);
  return getCurrentClient();
}

// =============== 合约 ABI ===============
const UNISWAP_V3_ABI = parseAbi([
  "event Burn(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
  "event Mint(address indexed sender, address indexed owner, int24 indexed tickLower, int24 tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
]);

const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const POOL_ABI = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

// =============== 限流和缓存 ===============
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 2000,
  reservoir: 1,
  reservoirRefreshAmount: 1,
  reservoirRefreshInterval: 2000,
});

const tokenCache = new Map();

// =============== 核心函数 ===============
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
        delay *= 2;
        retries++;
        switchClient();
        continue;
      }

      throw error;
    }
  }
}

async function getTokenInfo(address) {
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
    tokenCache.set(address, tokenInfo);
    return tokenInfo;
  } catch (error) {
    console.error(`❌ 获取代币信息失败: ${address}`, error);
    return null;
  }
}

// =============== 主函数 ===============
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

  // 定义 Uniswap V3 事件的 topic hash
  const UNISWAP_V3_EVENT_TOPICS = [
    "0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c", // Burn
    "0x40d0efd1a53d60ecbf40971b9daf7dc90178c3aadc7aab1765632738fa8b8f01", // Collect
    "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67", // Swap
    "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde", // Mint
  ];

  // 自动识别所有 Uniswap V3 池子地址
  const poolAddresses = new Set();
  for (const log of receipt.logs) {
    if (UNISWAP_V3_EVENT_TOPICS.includes(log.topics[0])) {
      poolAddresses.add(log.address.toLowerCase());
    }
  }

  console.log("\n🏊 发现的 Uniswap V3 池子地址：");
  Array.from(poolAddresses).forEach((addr, i) => {
    console.log(`  ${i + 1}. ${addr}`);
  });

  // 处理所有日志
  for (const log of receipt.logs) {
    // 只处理 Uniswap V3 池子的 log
    if (!poolAddresses.has(log.address.toLowerCase())) {
      continue;
    }

    console.log(`\n[PoolLog] 处理池子 ${log.address} 的事件`);
    console.log(`  Topic0: ${log.topics[0]}`);

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
        const [token0Address, token1Address] = await Promise.all([
          withRetry(() =>
            getCurrentClient().readContract({
              abi: POOL_ABI,
              address: poolAddress,
              functionName: "token0",
            })
          ),
          withRetry(() =>
            getCurrentClient().readContract({
              abi: POOL_ABI,
              address: poolAddress,
              functionName: "token1",
            })
          ),
        ]);

        console.log(`✅ Token0 地址: ${token0Address}`);
        console.log(`✅ Token1 地址: ${token1Address}`);

        console.log("\n⏳ 获取代币信息...");
        token0 = await getTokenInfo(token0Address);
        token1 = await getTokenInfo(token1Address);

        if (token0 && token1) {
          console.log("\n📊 池子信息:");
          console.log(`  Pool: ${poolAddress}`);
          console.log(
            `  Token0: ${token0.symbol} (${token0.decimals} decimals)`
          );
          console.log(
            `  Token1: ${token1.symbol} (${token1.decimals} decimals)\n`
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

  // 处理所有事件
  if (token0 && token1) {
    let mintEventCount = 0;
    for (const { log, parsed } of events) {
      const format = (val, decimals) => Number(val) / 10 ** decimals;

      console.log(`\n[事件解析] ${parsed.eventName}:`);
      console.log(`  Topics: ${JSON.stringify(log.topics)}`);

      switch (parsed.eventName) {
        case "Burn":
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
          break;

        case "Collect":
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
          break;

        case "Swap":
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
          break;

        case "Mint":
          mintEventCount++;
          console.log(`\n➕ Mint 事件:`);
          console.log(`  sender: ${parsed.args.sender}`);
          console.log(`  owner: ${parsed.args.owner}`);
          console.log(`  tickLower: ${parsed.args.tickLower}`);
          console.log(`  tickUpper: ${parsed.args.tickUpper}`);
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
          break;
      }
    }
    console.log(`\n[统计] 本次共解析出 Mint 事件数量: ${mintEventCount}`);
  } else {
    console.error("❌ 无法获取代币信息，跳过事件分析");
  }

  console.log("\n✨ 交易分析完成!");
}

// =============== 执行 ===============
const TX_HASH =
  "0xdcafedbc4517fed5409046081fb47fa3c30139e358585bddb8c86900a7f2ab99";

console.log("📡 连接到 Base 网络...");
analyzeTransaction(TX_HASH);
