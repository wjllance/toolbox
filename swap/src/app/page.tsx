import { SwapAnalyzer } from "@/components/SwapAnalyzer";

export default function Home() {
  return (
    <main className="container mx-auto py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          ETH Swap Analyzer
        </h1>
        <p className="text-lg text-gray-600">
          输入交易hash来解析以太坊链上的swap交易
        </p>
      </div>
      <SwapAnalyzer />
    </main>
  );
}
