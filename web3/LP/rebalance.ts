import { config } from "dotenv";
import {
  createPublicClient,
  http,
  parseAbiItem,
  formatUnits,
  type Log,
  decodeEventLog,
} from "viem";
import { mainnet } from "viem/chains";

config();

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.RPC_URL),
});

const abi = [
  parseAbiItem(
    "event Burn(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
  ),
  parseAbiItem(
    "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)"
  ),
  parseAbiItem(
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
  ),
  parseAbiItem(
    "event Mint(address sender, address indexed recipient, int24 tickLower, int24 tickUpper, uint128 amount, uint256 amount0, uint256 amount1)"
  ),
];

const TX_HASH: `0x${string}` =
  "0xdcafedbc4517fed5409046081fb47fa3c30139e358585bddb8c86900a7f2ab99";

async function analyzeTransaction(txHash: `0x${string}`): Promise<void> {
  const tx = await client.getTransactionReceipt({ hash: txHash });
  if (!tx) return console.error("交易未找到");

  const logs = tx.logs;
  console.log(`分析交易: ${txHash}\n`);

  for (const log of logs) {
    try {
      const parsed = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics,
      });

      if (parsed.eventName === "Burn") {
        console.log("🧨 Burn - 移除流动性：");
        console.log(`- liquidity: ${parsed.args.liquidity.toString()}`);
        console.log(`- amount0: ${formatUnits(parsed.args.amount0, 6)}`);
        console.log(`- amount1: ${formatUnits(parsed.args.amount1, 18)}\n`);
      }

      if (parsed.eventName === "Collect") {
        console.log("💰 Collect - 提取费用：");
        console.log(`- amount0: ${formatUnits(parsed.args.amount0, 6)}`);
        console.log(`- amount1: ${formatUnits(parsed.args.amount1, 18)}\n`);
      }

      if (parsed.eventName === "Swap") {
        console.log("🔁 Swap - 代币交换：");
        const amt0: number = parseFloat(formatUnits(parsed.args.amount0, 6));
        const amt1: number = parseFloat(formatUnits(parsed.args.amount1, 18));
        if (amt0 < 0) {
          console.log(`- 用 ${Math.abs(amt0)} Token0 换取 ${amt1} Token1\n`);
        } else {
          console.log(`- 用 ${Math.abs(amt1)} Token1 换取 ${amt0} Token0\n`);
        }
      }

      if (parsed.eventName === "Mint") {
        console.log("➕ Mint - 添加流动性：");
        console.log(`- amount0: ${formatUnits(parsed.args.amount0, 6)}`);
        console.log(`- amount1: ${formatUnits(parsed.args.amount1, 18)}\n`);
      }
    } catch (err) {
      // not a Uniswap V3 event, skip
      continue;
    }
  }
}

analyzeTransaction(TX_HASH);
