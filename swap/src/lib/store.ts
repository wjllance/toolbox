import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type NetworkType = "ETHEREUM" | "BASE";

interface NetworkState {
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
}

// 创建一个安全的存储机制，考虑到服务器端渲染的情况
const safeStorage = {
  getItem: (...args: Parameters<Storage['getItem']>): ReturnType<Storage['getItem']> => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(...args)
  },
  setItem: (...args: Parameters<Storage['setItem']>): ReturnType<Storage['setItem']> => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(...args)
    }
  },
  removeItem: (...args: Parameters<Storage['removeItem']>): ReturnType<Storage['removeItem']> => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(...args)
    }
  },
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set) => ({
      network: "ETHEREUM",
      setNetwork: (network) => set({ network }),
    }),
    {
      name: 'network-storage', // 用于localStorage的唯一名称
      storage: createJSONStorage(() => safeStorage),
    }
  )
);
