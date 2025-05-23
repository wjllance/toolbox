# Uniswap V3 流动性位置分析工具

这个工具用于分析单笔 Uniswap V3 交易中的流动性位置（Liquidity Position）相关操作，包括流动性管理、费用收集等关键事件。使用 viem 库实现，提供类型安全和高效的链上数据分析。

## 核心功能

### 1. 交易分析

- 解析交易中的所有 Uniswap V3 事件
- 识别流动性相关的操作（Mint/Burn/IncreaseLiquidity/DecreaseLiquidity/Collect）
- 计算流动性变化和费用收入
- 生成清晰的交易分析报告

### 2. 事件解析

支持解析以下 Uniswap V3 事件：

#### Pool 事件

- `Mint`: 添加流动性
- `Burn`: 移除流动性
- `Collect`: 收集费用
- `Swap`: 代币交换（用于上下文分析）

#### NonfungiblePositionManager 事件

- `IncreaseLiquidity`: 增加已有头寸的流动性
- `DecreaseLiquidity`: 减少已有头寸的流动性
- `Collect`: 收集费用到指定地址
- `Transfer`: NFT 转移事件（用于追踪头寸所有权）

### 3. 数据展示

- 交易基本信息
- NFT 头寸信息
- 流动性变化详情
- 费用收入统计
- 价格区间信息

## 技术实现

### 1. 事件定义

```typescript
// Pool 事件
interface PoolEvent {
  type: "Mint" | "Burn" | "Collect" | "Swap";
  amount0: bigint;
  amount1: bigint;
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  timestamp: number;
}

// Position 事件
interface PositionEvent {
  type: "IncreaseLiquidity" | "DecreaseLiquidity" | "Collect" | "Transfer";
  tokenId: number;
  amount0?: bigint;
  amount1?: bigint;
  liquidity?: bigint;
  from?: string;
  to?: string;
  timestamp: number;
}
```

### 2. 分析流程

1. 获取交易收据
2. 解析所有相关事件
3. 识别流动性操作类型
4. 计算流动性变化
5. 生成分析报告

## 使用示例

```typescript
// 分析单个交易
const TX_HASH = "0x...";
const result = await analyzeTransaction(TX_HASH);

// 输出示例
{
  transaction: {
    hash: "0x...",
    blockNumber: 12345678,
    timestamp: 1234567890
  },
  position: {
    tokenId: 123456,
    owner: "0x...",
    pool: "0x..."
  },
  events: {
    increaseLiquidity: [{
      tokenId: 123456,
      amount0: "1.5",
      amount1: "2.3",
      liquidity: "1000"
    }],
    decreaseLiquidity: [],
    collect: [],
    transfer: []
  },
  summary: {
    liquidityChange: "1000",
    fees: {
      token0: "0.1",
      token1: "0.2"
    }
  }
}
```

## 依赖项

- viem: 以太坊交互库
- @uniswap/v3-sdk: Uniswap V3 SDK
- decimal.js: 精确数值计算

## 环境要求

- Node.js 16+
- 可用的 RPC 节点

## 注意事项

1. 确保 RPC 节点配置正确
2. 注意处理大数值计算精度
3. 注意价格区间 tick 的计算
4. 考虑 gas 费用对收益的影响
5. 区分 Pool 和 NonfungiblePositionManager 的事件

## 后续优化计划

### 1. 功能优化

- [ ] 优化事件解析逻辑
- [ ] 改进数值计算精度
- [ ] 添加更多交易上下文信息
- [ ] 优化输出格式
- [ ] 添加头寸历史追踪

### 2. 代码质量

- [ ] 添加 TypeScript 支持
- [ ] 添加单元测试
- [ ] 改进错误处理
- [ ] 优化代码结构

### 3. 用户体验

- [ ] 添加命令行参数支持
- [ ] 提供更详细的交易分析
- [ ] 支持导出分析结果
