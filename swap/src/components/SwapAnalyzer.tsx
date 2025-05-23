"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isValidTxHash } from "@/lib/utils";
import { TransactionAnalysis } from "@/types/swap";
import { analyzeTransaction } from "@/lib/web3";
import { SwapResults } from "./SwapResults";
import { Search, Loader2 } from "lucide-react";

export function SwapAnalyzer() {
  const [txHash, setTxHash] = useState("");
  const [analysis, setAnalysis] = useState<TransactionAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!txHash.trim()) {
      setError("请输入交易hash");
      return;
    }

    if (!isValidTxHash(txHash.trim())) {
      setError("无效的交易hash格式");
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const result = await analyzeTransaction(txHash.trim());
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAnalyze();
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 输入区域 */}
      <Card>
        <CardHeader>
          <CardTitle>交易分析</CardTitle>
          <CardDescription>
            输入以太坊交易hash来分析其中包含的所有swap交易
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <Input
              placeholder="输入交易hash (0x...)"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
              disabled={loading}
            />
            <Button
              onClick={handleAnalyze}
              disabled={loading || !txHash.trim()}
              size="default"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  分析中...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  分析
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 结果展示 */}
      {analysis && <SwapResults analysis={analysis} />}
    </div>
  );
}
