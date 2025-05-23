import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 格式化ETH数量
export function formatEther(value: string, decimals: number = 18): string {
  const bn = BigInt(value);
  const divisor = BigInt(10 ** decimals);
  const quotient = bn / divisor;
  const remainder = bn % divisor;

  if (remainder === 0n) {
    return quotient.toString();
  }

  const remainderStr = remainder.toString().padStart(decimals, "0");
  const trimmedRemainder = remainderStr.replace(/0+$/, "");

  if (trimmedRemainder === "") {
    return quotient.toString();
  }

  return `${quotient}.${trimmedRemainder}`;
}

// 格式化地址
export function formatAddress(address: string, length: number = 4): string {
  if (address.length <= 2 + 2 * length) {
    return address;
  }
  return `${address.slice(0, 2 + length)}...${address.slice(-length)}`;
}

// 格式化时间戳
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

// 验证ETH地址
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// 验证交易hash
export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}
