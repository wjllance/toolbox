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
const UNISWAP_V3_POOL_ABI = parseAbi([
  "event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
  "event Collect(address indexed owner, address recipient, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount0, uint128 amount1)",
  "event Mint(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
]);

const POSITION_MANAGER_ABI = parseAbi([
  "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
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
  const receipt = await withRetry(() =>
    getCurrentClient().getTransactionReceipt({ hash: txHash })
  );
  console.log(`✅ 交易收据获取成功，区块号: ${receipt.blockNumber}`);

  let poolAddress = null;
  let token0 = null;
  let token1 = null;
  let events = {
    pool: [],
    position: [],
  };

  // 定义事件的 topic hash
  const POOL_EVENT_TOPICS = [
    "0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c", // Burn
    "0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0", // Collect
    "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde", // Mint
    "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67", // Swap
  ];

  const POSITION_EVENT_TOPICS = [
    "0x3067048beee31b25b2f1681f88dac838c8bba36af25bfb2b7cf7473a5847e35f", // IncreaseLiquidity
    "0x26f6a048ee9138f2c0ce266f322cb99228e8d619ae2bff30c67f8dcf9d2377b4", // DecreaseLiquidity
    "0x40d0efd1a53d60ecbf40971b9daf7dc90178c3aadc7aab1765632738fa8b8f01", // Collect
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer
  ];

  // 处理所有日志
  for (const log of receipt.logs) {
    try {
      if (POOL_EVENT_TOPICS.includes(log.topics[0])) {
        const parsed = decodeEventLog({
          abi: UNISWAP_V3_POOL_ABI,
          data: log.data,
          topics: log.topics,
        });
        events.pool.push({ log, parsed });

        if (!poolAddress) {
          poolAddress = log.address;
          console.log(`\n📍 分析池子: ${poolAddress}`);

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

          token0 = await getTokenInfo(token0Address);
          token1 = await getTokenInfo(token1Address);

          if (token0 && token1) {
            console.log(`📊 ${token0.symbol}/${token1.symbol} 池子`);
          }
        }
      } else if (POSITION_EVENT_TOPICS.includes(log.topics[0])) {
        const parsed = decodeEventLog({
          abi: POSITION_MANAGER_ABI,
          data: log.data,
          topics: log.topics,
        });
        events.position.push({ log, parsed });
      }
    } catch (err) {
      continue;
    }
  }

  // 处理所有事件
  if (token0 && token1) {
    const eventCounts = {
      pool: {
        Burn: 0,
        Collect: 0,
        Mint: 0,
        Swap: 0,
      },
      position: {
        IncreaseLiquidity: 0,
        DecreaseLiquidity: 0,
        Collect: 0,
        Transfer: 0,
      },
    };

    // 处理 Pool 事件
    for (const { parsed } of events.pool) {
      eventCounts.pool[parsed.eventName]++;

      const format = (val, decimals) => {
        const num = Number(val) / 10 ** decimals;
        if (num > 1e9) return "异常数值";
        return num.toFixed(6);
      };

      switch (parsed.eventName) {
        case "Burn":
          console.log(`\n🔥 Pool Burn #${eventCounts.pool.Burn}:`);
          console.log(`  owner: ${parsed.args.owner}`);
          console.log(`  tickLower: ${parsed.args.tickLower}`);
          console.log(`  tickUpper: ${parsed.args.tickUpper}`);
          console.log(`  amount: ${parsed.args.amount.toString()}`);
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
          console.log(`\n💰 Pool Collect #${eventCounts.pool.Collect}:`);
          console.log(`  owner: ${parsed.args.owner}`);
          console.log(`  recipient: ${parsed.args.recipient}`);
          console.log(`  tickLower: ${parsed.args.tickLower}`);
          console.log(`  tickUpper: ${parsed.args.tickUpper}`);
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

        case "Mint":
          console.log(`\n➕ Pool Mint #${eventCounts.pool.Mint}:`);
          console.log(`  owner: ${parsed.args.owner}`);
          console.log(`  tickLower: ${parsed.args.tickLower}`);
          console.log(`  tickUpper: ${parsed.args.tickUpper}`);
          console.log(`  amount: ${parsed.args.amount.toString()}`);
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
          console.log(`\n🔁 Pool Swap #${eventCounts.pool.Swap}:`);
          const amount0Formatted = formatAmount(
            parsed.args.amount0,
            token0.decimals,
            token0.symbol
          );
          const amount1Formatted = formatAmount(
            parsed.args.amount1,
            token1.decimals,
            token1.symbol
          );

          if (amount0Formatted.isAbnormal || amount1Formatted.isAbnormal) {
            console.log("  ⚠️ 异常交易金额:");
            console.log(
              `    amount0: ${amount0Formatted.raw} (${amount0Formatted.value} ${token0.symbol})`
            );
            console.log(
              `    amount1: ${amount1Formatted.raw} (${amount1Formatted.value} ${token1.symbol})`
            );
            console.log(
              `    当前价格: ${Number(parsed.args.sqrtPriceX96) / 2 ** 96}`
            );
            console.log(`    流动性: ${parsed.args.liquidity.toString()}`);
            console.log(`    当前 tick: ${parsed.args.tick}`);
          } else {
            const amount0 = Number(parsed.args.amount0) / 10 ** token0.decimals;
            const amount1 = Number(parsed.args.amount1) / 10 ** token1.decimals;
            if (amount0 < 0) {
              console.log(
                `  用 ${Math.abs(amount0).toFixed(6)} ${
                  token0.symbol
                } 换取 ${amount1.toFixed(6)} ${token1.symbol}`
              );
            } else {
              console.log(
                `  用 ${Math.abs(amount1).toFixed(6)} ${
                  token1.symbol
                } 换取 ${amount0.toFixed(6)} ${token0.symbol}`
              );
            }
          }
          break;
      }
    }

    // 处理 Position 事件
    for (const { parsed } of events.position) {
      eventCounts.position[parsed.eventName]++;

      const format = (val, decimals) => {
        const num = Number(val) / 10 ** decimals;
        if (num > 1e9) return "异常数值";
        return num.toFixed(6);
      };

      switch (parsed.eventName) {
        case "IncreaseLiquidity":
          console.log(
            `\n📈 Position IncreaseLiquidity #${eventCounts.position.IncreaseLiquidity}:`
          );
          console.log(`  tokenId: ${parsed.args.tokenId}`);
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

        case "DecreaseLiquidity":
          console.log(
            `\n📉 Position DecreaseLiquidity #${eventCounts.position.DecreaseLiquidity}:`
          );
          console.log(`  tokenId: ${parsed.args.tokenId}`);
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
          console.log(
            `\n💰 Position Collect #${eventCounts.position.Collect}:`
          );
          console.log(`  tokenId: ${parsed.args.tokenId}`);
          console.log(`  recipient: ${parsed.args.recipient}`);
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

        case "Transfer":
          console.log(
            `\n📤 Position Transfer #${eventCounts.position.Transfer}:`
          );
          console.log(`  tokenId: ${parsed.args.tokenId}`);
          console.log(`  from: ${parsed.args.from}`);
          console.log(`  to: ${parsed.args.to}`);
          break;
      }
    }

    console.log("\n📊 事件统计:");
    console.log("Pool 事件:");
    Object.entries(eventCounts.pool).forEach(([event, count]) => {
      if (count > 0) {
        console.log(`  ${event}: ${count} 个`);
      }
    });
    console.log("Position 事件:");
    Object.entries(eventCounts.position).forEach(([event, count]) => {
      if (count > 0) {
        console.log(`  ${event}: ${count} 个`);
      }
    });
  } else {
    console.error("❌ 无法获取代币信息，跳过事件分析");
  }

  console.log("\n✨ 交易分析完成!");
}

// =============== 执行 ===============
const TX_HASH =
  "0xdcafedbc4517fed5409046081fb47fa3c30139e358585bddb8c86900a7f2ab99";

console.log("📡 连接到 Base 网络...");
analyzeTransaction(TX_HASH).then(() => {
  analyzeAbnormalSwap(TX_HASH);
});

// 添加新的格式化函数
const formatAmount = (amount, decimals, symbol) => {
  const num = Number(amount) / 10 ** decimals;
  if (num > 1e9) {
    return {
      value: "异常数值",
      raw: amount.toString(),
      isAbnormal: true,
    };
  }
  return {
    value: num.toFixed(6),
    raw: amount.toString(),
    isAbnormal: false,
  };
};

// 在文件末尾添加新的分析函数
async function analyzeAbnormalSwap(txHash) {
  console.log("\n🔍 分析异常交易...");
  const receipt = await withRetry(() =>
    getCurrentClient().getTransactionReceipt({ hash: txHash })
  );

  // 获取交易详情
  const tx = await withRetry(() =>
    getCurrentClient().getTransaction({ hash: txHash })
  );

  console.log("\n📊 交易详情:");
  console.log(`  发送方: ${tx.from}`);
  console.log(`  接收方: ${tx.to}`);
  console.log(`  Gas 价格: ${tx.gasPrice}`);
  console.log(`  Gas 限制: ${tx.gas}`);
  console.log(`  交易值: ${tx.value}`);

  // 分析所有 Swap 事件
  let swapCount = 0;
  for (const log of receipt.logs) {
    if (
      log.topics[0] ===
      "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67"
    ) {
      swapCount++;
      try {
        const parsed = decodeEventLog({
          abi: UNISWAP_V3_POOL_ABI,
          data: log.data,
          topics: log.topics,
        });

        console.log(`\n🔄 Swap #${swapCount}:`);
        console.log(`  池子地址: ${log.address}`);
        console.log(`  amount0: ${parsed.args.amount0.toString()}`);
        console.log(`  amount1: ${parsed.args.amount1.toString()}`);
        console.log(`  价格: ${Number(parsed.args.sqrtPriceX96) / 2 ** 96}`);
        console.log(`  流动性: ${parsed.args.liquidity.toString()}`);
        console.log(`  tick: ${parsed.args.tick}`);
      } catch (err) {
        console.log(`  解析失败: ${err.message}`);
      }
    }
  }
}
