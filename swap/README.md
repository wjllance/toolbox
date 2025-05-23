# ETH Swap Analyzer

一个基于 NextJS 的以太坊和 Base 交易分析工具，能够根据交易 hash 解析出其中所有的 swap 交易。

## 🚀 功能特性

- **多协议支持**: 支持主流 DEX 协议（Uniswap V2/V3, SushiSwap, 1inch, Curve, Aerodrome 等）
- **实时解析**: 输入交易 hash 即可实时分析
- **详细信息**: 展示每个 swap 的详细信息，包括代币、数量、发送者等
- **统计概览**: 提供交易统计信息和 Gas 费用分析
- **响应式设计**: 支持桌面和移动端访问

## 🏗️ 项目架构

### 技术栈

- **前端框架**: NextJS 14 + TypeScript
- **样式系统**: Tailwind CSS + shadcn/ui
- **区块链交互**: ethers.js
- **状态管理**: React Hooks
- **UI 组件**: 自定义组件库

### 目录结构

```
src/
├── app/                    # NextJS App Router
│   ├── layout.tsx         # 根布局
│   ├── page.tsx           # 主页面
│   └── globals.css        # 全局样式
├── components/            # React组件
│   ├── ui/                # 基础UI组件
│   ├── SwapAnalyzer.tsx   # 主分析组件
│   └── SwapResults.tsx    # 结果展示组件
├── lib/                   # 工具库
│   ├── web3.ts           # Web3交互逻辑
│   ├── constants.ts      # 常量定义
│   └── utils.ts          # 工具函数
└── types/                # TypeScript类型定义
    └── swap.ts           # Swap相关类型
```

### 核心模块

#### 1. 交易解析引擎 (`src/lib/web3.ts`)

- 使用 ethers.js 获取交易数据
- 解析交易日志中的 swap 事件
- 支持多种 DEX 协议的事件格式

#### 2. 协议支持 (`src/lib/constants.ts`)

- **Uniswap V2**: 支持经典的 AMM swap
- **Uniswap V3**: 支持集中流动性 swap
- **SushiSwap**: 兼容 Uniswap V2 格式
- **1inch**: 支持聚合器交易
- **Curve**: 支持稳定币优化交易
- **Aerodrome**: 支持 Base 上的主要 DEX 协议
- **BaseSwap**: 支持 Base 链上的原生 DEX

#### 3. 数据处理

- Token 信息自动获取
- 数量格式化和展示
- 地址缩短和链接生成

## 🚦 快速开始

### 方法一：使用设置脚本（推荐）

```bash
cd web3/swap
./setup.sh
```

### 方法二：手动设置

#### 1. 安装依赖

```bash
cd web3/swap
yarn install
```

#### 2. 配置环境变量

复制环境变量模板文件：

```bash
cp env.example .env.local
```

编辑 `.env.local` 文件，配置以太坊 RPC 节点：

```env
NEXT_PUBLIC_ETHEREUM_RPC_URL=https://rpc.ankr.com/eth
# 或使用 Alchemy/Infura (推荐)
NEXT_PUBLIC_ALCHEMY_URL=https://eth-mainnet.alchemyapi.io/v2/your-api-key

# Base 网络 RPC URL
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
```

#### 3. 启动开发服务器

```bash
yarn dev
```

访问 http://localhost:3000 开始使用。

## 📖 使用指南

1. **输入交易 Hash**: 在输入框中粘贴以太坊或 Base 交易 hash
2. **点击分析**: 点击"分析"按钮开始解析
3. **查看结果**: 查看交易概览、统计信息和详细的 swap 操作

### 示例交易

可以使用以下类型的交易进行测试：

- Uniswap V2/V3 swap 交易
- Base 上的 Aerodrome/BaseSwap 交易
- 包含多个 swap 的复杂交易
- 聚合器交易（如 1inch）

## 🔧 扩展开发

### 添加新的 DEX 协议

1. **更新常量定义** (`src/lib/constants.ts`):

```typescript
export const DEX_PROTOCOLS = {
  // ... 现有协议
  NEW_DEX: {
    name: "New DEX",
    version: "1",
    routerAddress: "0x...",
    swapSignatures: ["0x..."],
  },
};
```

2. **添加解析逻辑** (`src/lib/web3.ts`):

```typescript
function parseNewDexSwapEvent(log: ethers.Log): SwapEvent | null {
  // 实现解析逻辑
}
```

3. **更新解析器** (`src/lib/web3.ts`):

```typescript
switch (protocolKey) {
  case "NEW_DEX":
    swapEvent = parseNewDexSwapEvent(log);
    break;
  // ...
}
```

### 添加新功能

- **价格信息**: 集成价格 API 显示 USD 价值
- **MEV 检测**: 分析套利和 MEV 交易
- **Gas 优化**: 分析 Gas 使用效率
- **历史对比**: 添加历史交易对比功能
- **多链支持**: 扩展支持更多区块链（Arbitrum、Optimism 等）

## 🛠️ 技术细节

### DEX 协议解析

每个 DEX 协议都有其特定的事件格式：

**Uniswap V2 Swap Event:**

```solidity
event Swap(
    address indexed sender,
    uint amount0In,
    uint amount1In,
    uint amount0Out,
    uint amount1Out,
    address indexed to
);
```

**Uniswap V3 Swap Event:**

```solidity
event Swap(
    address indexed sender,
    address indexed recipient,
    int256 amount0,
    int256 amount1,
    uint160 sqrtPriceX96,
    uint128 liquidity,
    int24 tick
);
```

### 数据流程

1. **获取交易**: 通过 ethers.js 获取交易收据
2. **遍历日志**: 检查每个日志的事件签名
3. **协议匹配**: 根据签名匹配对应的 DEX 协议
4. **解析事件**: 使用 ABI 解析事件数据
5. **获取代币**: 查询代币合约获取详细信息
6. **格式化展示**: 格式化数据并在前端展示

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

MIT License

## ⚡ 性能优化

- 使用 React.memo 优化组件渲染
- 实现交易数据缓存
- 使用 Suspense 实现懒加载
- 考虑使用 Web Workers 处理大量数据

## 🔮 未来规划

- [ ] 支持更多 DEX 协议（Balancer, Bancor 等）
- [ ] 添加实时价格和 PnL 计算
- [ ] 支持批量交易分析
- [ ] 添加交易可视化图表
- [ ] 支持多链分析（BSC, Polygon 等）
- [ ] 添加 API 接口供第三方调用

## 🐛 故障排除

### 常见问题

1. **RPC 节点连接失败**

   - 检查 `.env.local` 文件中的 RPC URL 是否正确
   - 确保网络连接正常
   - 尝试使用不同的 RPC 提供商

2. **交易解析失败**

   - 确认交易 hash 格式正确（0x 开头的 64 位十六进制）
   - 检查交易是否存在于以太坊主网
   - 某些交易可能不包含 swap 操作

3. **依赖安装问题**
   - 确保 Node.js 版本 >= 18
   - 清除 npm 缓存：`npm cache clean --force`
   - 删除 node_modules 重新安装

### 获取帮助

如果遇到问题，请：

1. 查看浏览器控制台的错误信息
2. 检查网络请求是否成功
3. 在 GitHub Issues 中搜索类似问题
4. 提交新的 Issue 并提供详细信息
