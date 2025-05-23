// 使用 viem 替代 ethers.js 实现 uniswap rebalance 交易分析
import { createPublicClient, http, parseAbi, decodeEventLog } from "viem";
import { base } from "viem/chains";
import Bottleneck from "bottleneck";

// =============== 配置 ===============
console.log("🚀 初始化客户端...");

// 添加更多 RPC 节点
const RPC_URLS = [
  process.env.RPC_URL,
  "https://mainnet.base.org",
  "https://base.blockpi.network/v1/rpc/public",
  "https://base.meowrpc.com",
  "https://base.publicnode.com",
  "https://base-rpc.publicnode.com",
];

// 优化 RPC 客户端管理
let currentClientIndex = 0;
const clients = RPC_URLS.map((url) =>
  createPublicClient({
    transport: http(url),
    chain: base,
  })
);

const getCurrentClient = () => {
  return clients[currentClientIndex];
};

const switchClient = () => {
  currentClientIndex = (currentClientIndex + 1) % clients.length;
  console.log(`🔄 切换到 RPC 节点 ${currentClientIndex + 1}`);
  return getCurrentClient();
};

// =============== 工具函数 ===============

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

// 添加 Uniswap V2 和 V4 的 ABI
const UNISWAP_V2_PAIR_ABI = parseAbi([
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount0Out, uint256 amount1In, uint256 amount1Out, address indexed to)",
]);

const UNISWAP_V4_POOL_ABI = parseAbi([
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
]);

// =============== 限流和缓存 ===============
const limiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 1000,
  reservoir: 2,
  reservoirRefreshAmount: 2,
  reservoirRefreshInterval: 1000,
});

const tokenCache = new Map();
const poolCache = new Map();

// 添加已知的池子信息
const KNOWN_POOLS = {
  "0xec558e484cc9f2210714e345298fdc53b253c27d": {
    token0: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      symbol: "USDC",
      decimals: 6,
    },
    token1: {
      address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      symbol: "cbBTC",
      decimals: 8,
    },
  },
  "0xd92e0767473d1e3ff11ac036f2b1db90ad0ae55f": {
    token0: {
      address: "0x4200000000000000000000000000000000000006",
      symbol: "WETH",
      decimals: 18,
    },
    token1: {
      address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      symbol: "USDT",
      decimals: 6,
    },
  },
};

// =============== 核心函数 ===============
const withRetry = async (fn, maxRetries = 5, initialDelay = 2000) => {
  let retries = 0;
  let delay = initialDelay;
  let lastError = null;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (retries >= maxRetries) {
        console.error(
          `❌ 达到最大重试次数 (${maxRetries})，最后一次错误:`,
          error.message
        );
        throw error;
      }

      // 检查是否是 rate limit 或配额限制错误
      if (
        error.message?.includes("rate limit") ||
        error.details?.includes("rate limit") ||
        error.message?.includes("quota") ||
        error.details?.includes("quota") ||
        error.message?.includes("resource not found") ||
        error.details?.includes("resource not found")
      ) {
        console.log(`⚠️ RPC 节点限制，等待 ${delay}ms 后重试...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 10000); // 最大延迟 10 秒
        retries++;
        switchClient();
        continue;
      }

      throw error;
    }
  }
};

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
  console.log("🚀 初始化客户端...");
  console.log("📡 连接到 Base 网络...");

  // 在开始分析交易之前验证已知池子
  await validateKnownPools();

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
    "0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c", // V3 Burn
    "0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0", // V3 Collect
    "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde", // V3 Mint
    "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67", // V3 Swap
    "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // V2 Swap
    "0x19b47279256b2a23a1665c810c8d55a1758950e09377acb841d0a21f2e2f0f3d", // V4 Swap
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
        let parsed;
        let version;

        // 根据 topic 确定版本和解析方式
        if (
          log.topics[0] ===
          "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"
        ) {
          // V2 Swap
          parsed = decodeEventLog({
            abi: UNISWAP_V2_PAIR_ABI,
            data: log.data,
            topics: log.topics,
          });
          version = "V2";
        } else if (
          log.topics[0] ===
          "0x19b47279256b2a23a1665c810c8d55a1758950e09377acb841d0a21f2e2f0f3d"
        ) {
          // V4 Swap
          parsed = decodeEventLog({
            abi: UNISWAP_V4_POOL_ABI,
            data: log.data,
            topics: log.topics,
          });
          version = "V4";
        } else {
          // V3 事件
          parsed = decodeEventLog({
            abi: UNISWAP_V3_POOL_ABI,
            data: log.data,
            topics: log.topics,
          });
          version = "V3";
        }

        events.pool.push({ log, parsed, version });

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
    for (const { parsed, version } of events.pool) {
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
          console.log(`\n🔁 ${version} Pool Swap #${eventCounts.pool.Swap}:`);

          if (version === "V2") {
            const amount0In =
              Number(parsed.args.amount0In) / 10 ** token0.decimals;
            const amount0Out =
              Number(parsed.args.amount0Out) / 10 ** token0.decimals;
            const amount1In =
              Number(parsed.args.amount1In) / 10 ** token1.decimals;
            const amount1Out =
              Number(parsed.args.amount1Out) / 10 ** token1.decimals;

            if (amount0In > 0) {
              console.log(
                `  用 ${amount0In.toFixed(6)} ${
                  token0.symbol
                } 换取 ${amount1Out.toFixed(6)} ${token1.symbol}`
              );
            } else {
              console.log(
                `  用 ${amount1In.toFixed(6)} ${
                  token1.symbol
                } 换取 ${amount0Out.toFixed(6)} ${token0.symbol}`
              );
            }
          } else {
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
              if (version === "V4") {
                console.log(`    手续费: ${parsed.args.fee / 10000}%`);
              }
            } else {
              const amount0 =
                Number(parsed.args.amount0) / 10 ** token0.decimals;
              const amount1 =
                Number(parsed.args.amount1) / 10 ** token1.decimals;
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

// 添加池子验证函数
async function validatePoolInfo(poolAddress, token0Address, token1Address) {
  try {
    const [actualToken0, actualToken1] = await Promise.all([
      getCurrentClient().readContract({
        abi: POOL_ABI,
        address: poolAddress,
        functionName: "token0",
      }),
      getCurrentClient().readContract({
        abi: POOL_ABI,
        address: poolAddress,
        functionName: "token1",
      }),
    ]);

    if (
      actualToken0.toLowerCase() !== token0Address.toLowerCase() ||
      actualToken1.toLowerCase() !== token1Address.toLowerCase()
    ) {
      console.warn(`⚠️ 池子 ${poolAddress} 的代币信息不匹配！`);
      console.warn(`  预期: ${token0Address}/${token1Address}`);
      console.warn(`  实际: ${actualToken0}/${actualToken1}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`❌ 验证池子信息失败: ${poolAddress}`, error);
    return false;
  }
}

// 验证所有已知池子
async function validateKnownPools() {
  console.log("\n🔍 验证已知池子信息...");
  for (const [address, info] of Object.entries(KNOWN_POOLS)) {
    console.log(`\n验证池子: ${address}`);
    console.log(`  预期代币对: ${info.token0.symbol}/${info.token1.symbol}`);
    const isValid = await validatePoolInfo(
      address,
      info.token0.address,
      info.token1.address
    );
    if (!isValid) {
      console.error(`❌ 池子 ${address} 验证失败，请更新信息`);
    } else {
      console.log(`✅ 池子 ${address} 验证通过`);
    }
  }
}

// 修改 getPoolInfo 函数，添加验证
async function getPoolInfo(poolAddress) {
  // 首先检查缓存
  if (poolCache.has(poolAddress)) {
    console.log(`📦 使用缓存的池子信息: ${poolAddress}`);
    return poolCache.get(poolAddress);
  }

  // 然后检查已知池子
  if (KNOWN_POOLS[poolAddress]) {
    console.log(`📦 使用已知的池子信息: ${poolAddress}`);
    const poolInfo = KNOWN_POOLS[poolAddress];

    // 验证池子信息
    try {
      const isValid = await validatePoolInfo(
        poolAddress,
        poolInfo.token0.address,
        poolInfo.token1.address
      );
      if (isValid) {
        poolCache.set(poolAddress, poolInfo);
        return poolInfo;
      }
      console.log("⚠️ 已知池子信息可能不准确，尝试从链上获取最新信息");
    } catch (error) {
      console.log("⚠️ 池子验证失败，使用已知信息继续");
      return poolInfo;
    }
  }

  // 最后尝试从链上获取
  try {
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

    // 如果获取到代币地址，尝试获取代币信息
    if (token0Address && token1Address) {
      try {
        const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] =
          await Promise.all([
            withRetry(() =>
              getCurrentClient().readContract({
                abi: [
                  {
                    name: "symbol",
                    type: "function",
                    stateMutability: "view",
                    inputs: [],
                    outputs: [{ type: "string" }],
                  },
                ],
                address: token0Address,
                functionName: "symbol",
              })
            ),
            withRetry(() =>
              getCurrentClient().readContract({
                abi: [
                  {
                    name: "decimals",
                    type: "function",
                    stateMutability: "view",
                    inputs: [],
                    outputs: [{ type: "uint8" }],
                  },
                ],
                address: token0Address,
                functionName: "decimals",
              })
            ),
            withRetry(() =>
              getCurrentClient().readContract({
                abi: [
                  {
                    name: "symbol",
                    type: "function",
                    stateMutability: "view",
                    inputs: [],
                    outputs: [{ type: "string" }],
                  },
                ],
                address: token1Address,
                functionName: "symbol",
              })
            ),
            withRetry(() =>
              getCurrentClient().readContract({
                abi: [
                  {
                    name: "decimals",
                    type: "function",
                    stateMutability: "view",
                    inputs: [],
                    outputs: [{ type: "uint8" }],
                  },
                ],
                address: token1Address,
                functionName: "decimals",
              })
            ),
          ]);

        const poolInfo = {
          address: poolAddress,
          token0: {
            address: token0Address,
            symbol: token0Symbol,
            decimals: token0Decimals,
          },
          token1: {
            address: token1Address,
            symbol: token1Symbol,
            decimals: token1Decimals,
          },
        };

        poolCache.set(poolAddress, poolInfo);
        console.log(`  ✅ 成功获取池子信息: ${token0Symbol}/${token1Symbol}`);
        return poolInfo;
      } catch (error) {
        console.error(`❌ 获取代币信息失败: ${poolAddress}`, error);
        // 如果获取代币信息失败，至少返回代币地址
        return {
          token0: { address: token0Address },
          token1: { address: token1Address },
        };
      }
    }
  } catch (error) {
    console.error(`❌ 获取池子信息失败: ${poolAddress}`, error);
    return null;
  }
}

// 修改 analyzeAbnormalSwap 函数
async function analyzeAbnormalSwap(txHash) {
  console.log("\n🔍 分析跨池交易...");
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
  let poolInfos = new Map();
  let swapEvents = [];

  console.log("\n🔍 开始收集 Swap 事件...");
  console.log(`  总日志数: ${receipt.logs.length}`);

  for (const log of receipt.logs) {
    // 记录所有可能的 Swap 事件 topic
    if (
      log.topics[0] ===
        "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67" || // V3 Swap
      log.topics[0] ===
        "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822" || // V2 Swap
      log.topics[0] ===
        "0x19b47279256b2a23a1665c810c8d55a1758950e09377acb841d0a21f2e2f0f3d"
    ) {
      // V4 Swap

      console.log(`\n📝 发现 Swap 事件 #${swapCount + 1}:`);
      console.log(`  Topic: ${log.topics[0]}`);
      console.log(`  合约地址: ${log.address}`);
      console.log(`  数据长度: ${log.data.length}`);

      swapCount++;
      try {
        let parsed;
        let version;

        if (
          log.topics[0] ===
          "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"
        ) {
          parsed = decodeEventLog({
            abi: UNISWAP_V2_PAIR_ABI,
            data: log.data,
            topics: log.topics,
          });
          version = "V2";
        } else if (
          log.topics[0] ===
          "0x19b47279256b2a23a1665c810c8d55a1758950e09377acb841d0a21f2e2f0f3d"
        ) {
          parsed = decodeEventLog({
            abi: UNISWAP_V4_POOL_ABI,
            data: log.data,
            topics: log.topics,
          });
          version = "V4";
        } else {
          parsed = decodeEventLog({
            abi: UNISWAP_V3_POOL_ABI,
            data: log.data,
            topics: log.topics,
          });
          version = "V3";
        }

        // 获取池子信息
        if (!poolInfos.has(log.address)) {
          console.log(`  🔄 获取池子信息: ${log.address}`);
          const poolInfo = await getPoolInfo(log.address);
          if (poolInfo) {
            poolInfos.set(log.address, poolInfo);
            console.log(
              `  ✅ 成功获取池子信息: ${poolInfo.token0.symbol}/${poolInfo.token1.symbol}`
            );
          } else {
            console.log(`  ❌ 无法获取池子信息`);
          }
        }

        const poolInfo = poolInfos.get(log.address);
        console.log(`\n🔄 Swap #${swapCount}:`);
        console.log(`  池子地址: ${log.address}`);
        if (poolInfo) {
          console.log(
            `  交易对: ${poolInfo.token0.symbol}/${poolInfo.token1.symbol}`
          );
        }
        console.log(`  amount0: ${parsed.args.amount0.toString()}`);
        console.log(`  amount1: ${parsed.args.amount1.toString()}`);

        if (version === "V3" || version === "V4") {
          console.log(`  价格: ${Number(parsed.args.sqrtPriceX96) / 2 ** 96}`);
          console.log(`  流动性: ${parsed.args.liquidity.toString()}`);
          console.log(`  tick: ${parsed.args.tick}`);
          if (version === "V4") {
            console.log(`  手续费: ${parsed.args.fee / 10000}%`);
          }
        }

        // 分析交易方向
        if (poolInfo) {
          const amount0 =
            Number(parsed.args.amount0) / 10 ** poolInfo.token0.decimals;
          const amount1 =
            Number(parsed.args.amount1) / 10 ** poolInfo.token1.decimals;
          if (amount0 < 0) {
            console.log(
              `  交易方向: ${poolInfo.token0.symbol} -> ${poolInfo.token1.symbol}`
            );
            console.log(
              `  交易金额: ${Math.abs(amount0).toFixed(6)} ${
                poolInfo.token0.symbol
              } -> ${amount1.toFixed(6)} ${poolInfo.token1.symbol}`
            );
          } else {
            console.log(
              `  交易方向: ${poolInfo.token1.symbol} -> ${poolInfo.token0.symbol}`
            );
            console.log(
              `  交易金额: ${Math.abs(amount1).toFixed(6)} ${
                poolInfo.token1.symbol
              } -> ${amount0.toFixed(6)} ${poolInfo.token0.symbol}`
            );
          }
        }

        // 保存 Swap 事件信息
        swapEvents.push({
          version,
          poolAddress: log.address,
          poolInfo,
          parsed,
          log,
        });
      } catch (err) {
        console.log(`  ❌ 解析失败: ${err.message}`);
        console.log(`  原始数据:`, log);
      }
    }
  }

  console.log(`\n📊 Swap 事件统计:`);
  console.log(`  总发现 Swap 事件: ${swapCount}`);
  console.log(`  成功解析: ${swapEvents.length}`);
  console.log(`  解析失败: ${swapCount - swapEvents.length}`);

  // 分析交易路径
  if (swapEvents.length > 1) {
    console.log("\n🛣️ 交易路径分析:");
    console.log(
      "  这个交易包含了多个池子的交换，可能是通过 Uniswap Router 执行的跨池交易"
    );
    console.log("  交易路径:");

    let totalInput = 0;
    let totalOutput = 0;
    let inputToken = null;
    let outputToken = null;

    for (let i = 0; i < swapEvents.length; i++) {
      const event = swapEvents[i];
      const { poolInfo, parsed } = event;

      if (poolInfo) {
        const amount0 =
          Number(parsed.args.amount0) / 10 ** poolInfo.token0.decimals;
        const amount1 =
          Number(parsed.args.amount1) / 10 ** poolInfo.token1.decimals;

        if (i === 0) {
          // 第一个 Swap 确定输入代币
          if (amount0 < 0) {
            inputToken = poolInfo.token0;
            totalInput = Math.abs(amount0);
          } else {
            inputToken = poolInfo.token1;
            totalInput = Math.abs(amount1);
          }
        }

        if (i === swapEvents.length - 1) {
          // 最后一个 Swap 确定输出代币
          if (amount0 > 0) {
            outputToken = poolInfo.token0;
            totalOutput = amount0;
          } else {
            outputToken = poolInfo.token1;
            totalOutput = amount1;
          }
        }

        console.log(
          `  ${i + 1}. ${poolInfo.token0.symbol}/${poolInfo.token1.symbol} 池`
        );
        console.log(
          `     输入: ${Math.abs(amount0 < 0 ? amount0 : amount1).toFixed(6)} ${
            amount0 < 0 ? poolInfo.token0.symbol : poolInfo.token1.symbol
          }`
        );
        console.log(
          `     输出: ${Math.abs(amount0 > 0 ? amount0 : amount1).toFixed(6)} ${
            amount0 > 0 ? poolInfo.token0.symbol : poolInfo.token1.symbol
          }`
        );
      }
    }

    if (inputToken && outputToken) {
      console.log("\n💰 交易总结:");
      console.log(`  总输入: ${totalInput.toFixed(6)} ${inputToken.symbol}`);
      console.log(`  总输出: ${totalOutput.toFixed(6)} ${outputToken.symbol}`);
      if (totalInput > 0 && totalOutput > 0) {
        const price = totalOutput / totalInput;
        console.log(
          `  平均价格: 1 ${inputToken.symbol} = ${price.toFixed(6)} ${
            outputToken.symbol
          }`
        );
      }
    }
  }
}
