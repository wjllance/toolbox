#!/usr/bin/env python3
import json
import requests
from typing import Dict, List, Tuple
from collections import defaultdict

# 事件签名哈希
EVENT_SIGNATURES = {
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": "Transfer(address,address,uint256)",
    "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67": "Swap(address,address,int256,int256,uint160,uint128,int24)",  # Uniswap V3
    "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83": "Swap(address,address,int256,int256,uint160,uint128,int24)",  # Another swap variant
    "0x2170c741c41531aec20e7c107c24eecfdd15e69c9bb0a8dd37b1840b9e0b207b": "Swap(bytes32,address,address,uint256,uint256)",  # Balancer
}

# 已知的token合约地址
KNOWN_TOKENS = {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
    "0x4200000000000000000000000000000000000006": "WETH", 
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": "cbBTC",
    "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": "USDT",
    "0x03a520b32c04bf3beef7beb72e919cf822ed34f1": "Uniswap V3 NFT",
}

# Token精度
TOKEN_DECIMALS = {
    "USDC": 6,
    "USDT": 6, 
    "WETH": 18,
    "cbBTC": 8,
    "Uniswap V3 NFT": 0,
}

def analyze_transaction_logs(logs: List[Dict]) -> Dict:
    """分析交易日志，识别swap操作和相关token"""
    
    swaps = []
    transfers = []
    
    for log in logs:
        log_index = log.get("index", 0)
        address = log.get("address", "").lower()
        topics = log.get("topics", [])
        data = log.get("data", "")
        
        if not topics:
            continue
            
        event_signature = topics[0]
        
        # 识别Transfer事件
        if event_signature == "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef":
            if len(topics) >= 3:
                from_addr = "0x" + topics[1][-40:]
                to_addr = "0x" + topics[2][-40:]
                amount = int(data, 16) if data and data != "0x" else 0
                
                token_symbol = KNOWN_TOKENS.get(address, f"Token({address[:8]}...)")
                
                transfers.append({
                    "index": log_index,
                    "token": token_symbol,
                    "token_address": address,
                    "from": from_addr,
                    "to": to_addr,
                    "amount": amount,
                    "amount_formatted": format_amount(amount, token_symbol)
                })
        
        # 识别Swap事件
        elif event_signature in ["0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
                                "0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83"]:
            swaps.append({
                "index": log_index,
                "pool_address": address,
                "event_type": "Uniswap V3 Swap" if event_signature.startswith("0xc42079") else "Pool Swap",
                "sender": "0x" + topics[1][-40:] if len(topics) > 1 else "",
                "recipient": "0x" + topics[2][-40:] if len(topics) > 2 else "",
                "data": data
            })
        
        # 识别Balancer Swap事件
        elif event_signature == "0x2170c741c41531aec20e7c107c24eecfdd15e69c9bb0a8dd37b1840b9e0b207b":
            swaps.append({
                "index": log_index,
                "pool_address": address,
                "event_type": "Balancer Swap",
                "pool_id": topics[1] if len(topics) > 1 else "",
                "token_in": "0x" + topics[2][-40:] if len(topics) > 2 else "",
                "token_out": "0x" + topics[3][-40:] if len(topics) > 3 else "",
                "data": data
            })
    
    return {
        "swaps": swaps,
        "transfers": transfers,
        "summary": generate_summary(swaps, transfers)
    }

def format_amount(amount: int, token_symbol: str = "") -> str:
    """根据token类型格式化金额显示"""
    if amount == 0:
        return "0"
    
    # 获取token精度
    decimals = TOKEN_DECIMALS.get(token_symbol, 18)
    
    if decimals == 0:
        return str(amount)
    
    # 转换为实际数量
    actual_amount = amount / (10 ** decimals)
    
    if actual_amount < 0.000001:
        return f"{actual_amount:.8f}"
    elif actual_amount < 0.01:
        return f"{actual_amount:.6f}"
    elif actual_amount < 1:
        return f"{actual_amount:.4f}"
    elif actual_amount < 1000:
        return f"{actual_amount:.2f}"
    elif actual_amount < 1000000:
        return f"{actual_amount / 1000:.2f}K"
    else:
        return f"{actual_amount / 1000000:.2f}M"

def calculate_token_flows(transfers: List[Dict]) -> Dict:
    """计算每个token的流入流出统计"""
    
    # 用于汇总的数据结构
    token_summary = defaultdict(lambda: {
        "total_in": 0,
        "total_out": 0,
        "net_flow": 0,
        "transfer_count": 0,
        "decimals": 18
    })
    
    # 需要排除的地址（零地址等）
    EXCLUDE_ADDRESSES = {
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0x000000000000000000000000000000000000000000000000000000000000dead"
    }
    
    for transfer in transfers:
        token = transfer["token"]
        amount = transfer["amount"]
        from_addr = transfer["from"]
        to_addr = transfer["to"]
        
        # 跳过NFT和零地址转账
        if token == "Uniswap V3 NFT" or from_addr in EXCLUDE_ADDRESSES or to_addr in EXCLUDE_ADDRESSES:
            continue
            
        decimals = TOKEN_DECIMALS.get(token, 18)
        token_summary[token]["decimals"] = decimals
        token_summary[token]["transfer_count"] += 1
        
        # 这里简化处理，将所有转账都计入流量统计
        # 实际项目中需要识别用户地址 vs 合约地址来判断真正的流入流出
        actual_amount = amount / (10 ** decimals) if amount > 0 else 0
        
        if actual_amount > 0:
            token_summary[token]["total_out"] += actual_amount
            token_summary[token]["total_in"] += actual_amount  # 对于内部转账，流入等于流出
    
    # 计算净流量（这里简化为0，因为内部转账）
    for token_data in token_summary.values():
        token_data["net_flow"] = token_data["total_in"] - token_data["total_out"]
    
    return dict(token_summary)

def generate_summary(swaps: List[Dict], transfers: List[Dict]) -> Dict:
    """生成swap操作摘要"""
    
    # 计算token流量统计
    token_flows = calculate_token_flows(transfers)
    
    # 识别主要的swap路径
    swap_paths = []
    for i in range(len(transfers) - 1):
        curr = transfers[i]
        next_transfer = transfers[i + 1]
        # 如果一个token流出，另一个token流入，可能是swap
        if curr["token"] != next_transfer["token"]:
            swap_paths.append({
                "from_token": curr["token"],
                "to_token": next_transfer["token"],
                "from_amount": curr["amount_formatted"],
                "to_amount": next_transfer["amount_formatted"]
            })
    
    return {
        "total_swaps": len(swaps),
        "total_transfers": len(transfers),
        "tokens_involved": list(set([t["token"] for t in transfers])),
        "token_flows": token_flows,
        "potential_swap_paths": swap_paths[:5]  # 只显示前5个
    }

def main():
    # 读取交易日志文件
    with open("tx_logs_dcafedbc.json", "r") as f:
        logs = json.load(f)
    
    # 分析日志
    analysis = analyze_transaction_logs(logs)
    
    # 打印结果
    print("=== 交易中的Swap操作分析 ===\n")
    
    print(f"📊 总体统计:")
    print(f"   - Swap事件数量: {analysis['summary']['total_swaps']}")
    print(f"   - Transfer事件数量: {analysis['summary']['total_transfers']}")
    print(f"   - 涉及的Token: {', '.join(analysis['summary']['tokens_involved'])}")
    
    # 新增：Token数量汇总
    print(f"\n💰 Token数量汇总:")
    print(f"{'Token':<15} {'总流量':<15} {'转账次数':<10} {'精度':<5}")
    print("=" * 50)
    
    for token, flow_data in analysis['summary']['token_flows'].items():
        if token == "Uniswap V3 NFT":
            continue
        total_volume = flow_data['total_in']  # 由于是内部转账，用total_in作为总流量
        count = flow_data['transfer_count']
        decimals = flow_data['decimals']
        
        print(f"{token:<15} {total_volume:<15.2f} {count:<10} {decimals:<5}")
    
    print(f"\n🔄 识别到的Swap事件:")
    for swap in analysis["swaps"]:
        print(f"   [{swap['index']}] {swap['event_type']}")
        print(f"       Pool: {swap['pool_address']}")
        if 'sender' in swap:
            print(f"       Sender: {swap['sender']}")
            print(f"       Recipient: {swap['recipient']}")
        if 'token_in' in swap:
            token_in_symbol = KNOWN_TOKENS.get(swap['token_in'], swap['token_in'][:10])
            token_out_symbol = KNOWN_TOKENS.get(swap['token_out'], swap['token_out'][:10])
            print(f"       Token In: {token_in_symbol}")
            print(f"       Token Out: {token_out_symbol}")
        print()
    
    print(f"\n💸 主要Token转账详情:")
    current_token = None
    shown_transfers = 0
    max_show = 15
    
    for transfer in analysis["transfers"]:
        if transfer["token"] == "Uniswap V3 NFT":
            continue
            
        if shown_transfers >= max_show:
            break
            
        if transfer["token"] != current_token:
            print(f"\n   {transfer['token']} ({transfer['token_address']}):")
            current_token = transfer["token"]
        
        from_display = transfer["from"][:10] + "..." if len(transfer["from"]) > 10 else transfer["from"]
        to_display = transfer["to"][:10] + "..." if len(transfer["to"]) > 10 else transfer["to"]
        
        print(f"     [{transfer['index']}] {from_display} → {to_display}: {transfer['amount_formatted']}")
        shown_transfers += 1
    
    remaining = len([t for t in analysis["transfers"] if t["token"] != "Uniswap V3 NFT"]) - shown_transfers
    if remaining > 0:
        print(f"     ... 还有 {remaining} 个转账")

if __name__ == "__main__":
    main() 