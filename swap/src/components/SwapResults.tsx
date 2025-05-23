"use client";

import { TransactionAnalysis, SwapEvent } from "@/types/swap";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAddress, formatTimestamp, formatEther } from "@/lib/utils";
import { ExternalLink, Clock, Hash, DollarSign, BarChart3 } from "lucide-react";
import { SUPPORTED_NETWORKS } from "@/lib/constants";

interface SwapResultsProps {
  analysis: TransactionAnalysis;
}

function SwapEventCard({ swap }: { swap: SwapEvent }) {
  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{swap.protocol}</CardTitle>
          {swap.version && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              v{swap.version}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-600">Token In</p>
            <p className="text-sm font-mono">
              {formatEther(swap.amountIn, swap.tokenIn.decimals)}{" "}
              {swap.tokenIn.symbol}
            </p>
            <p className="text-xs text-gray-500">
              {formatAddress(swap.tokenIn.address)}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">Token Out</p>
            <p className="text-sm font-mono">
              {formatEther(swap.amountOut, swap.tokenOut.decimals)}{" "}
              {swap.tokenOut.symbol}
            </p>
            <p className="text-xs text-gray-500">
              {formatAddress(swap.tokenOut.address)}
            </p>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
            <div>
              <span className="font-medium">发送者: </span>
              {formatAddress(swap.sender)}
            </div>
            <div>
              <span className="font-medium">接收者: </span>
              {formatAddress(swap.recipient)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SwapResults({ analysis }: SwapResultsProps) {
  return (
    <div className="space-y-6">
      {/* 交易概览 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Hash className="mr-2 h-5 w-5" />
            交易概览
          </CardTitle>
          <CardDescription>基本交易信息</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-600">交易Hash</p>
              <div className="flex items-center space-x-2">
                <p className="text-sm font-mono">
                  {formatAddress(analysis.hash, 6)}
                </p>
                <a
                  href={`${analysis.network === "BASE" 
                    ? SUPPORTED_NETWORKS.BASE.blockExplorer 
                    : SUPPORTED_NETWORKS.ETHEREUM.blockExplorer}/tx/${analysis.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-600">状态</p>
              <div className="flex items-center space-x-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    analysis.status === "success"
                      ? "bg-green-500"
                      : "bg-red-500"
                  }`}
                />
                <p className="text-sm capitalize">{analysis.status}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-600">区块号</p>
              <p className="text-sm font-mono">
                {analysis.blockNumber.toLocaleString()}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-600">时间</p>
              <p className="text-sm">{formatTimestamp(analysis.timestamp)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Swap统计 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart3 className="mr-2 h-5 w-5" />
            Swap统计
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                {analysis.totalSwaps}
              </p>
              <p className="text-sm text-gray-600">总Swap数量</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">
                {analysis.protocolsUsed.length}
              </p>
              <p className="text-sm text-gray-600">使用的协议数</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">
                {formatEther(analysis.gasUsed)} ETH
              </p>
              <p className="text-sm text-gray-600">Gas费用</p>
            </div>
          </div>

          {analysis.protocolsUsed.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-600 mb-2">
                使用的协议:
              </p>
              <div className="flex flex-wrap gap-2">
                {analysis.protocolsUsed.map((protocol) => (
                  <span
                    key={protocol}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                  >
                    {protocol}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Swap详情 */}
      {analysis.swaps.length > 0 ? (
        <div>
          <h3 className="text-lg font-semibold mb-4">Swap详情</h3>
          <div className="space-y-4">
            {analysis.swaps.map((swap) => (
              <SwapEventCard key={swap.id} swap={swap} />
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-500">在此交易中未发现任何swap操作</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
