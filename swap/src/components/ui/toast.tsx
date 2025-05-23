import * as React from "react";

// 简化的 Toast 组件，避免复杂的依赖
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export function ToastViewport() {
  return <div id="toast-viewport" />;
}

export function Toast() {
  return null;
}
