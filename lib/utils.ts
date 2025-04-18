import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 判断是否为 iOS 或 iPad 设备
export function isIOSorIPad(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || 
    // iPadOS 13+ 会被识别为 Mac，但有触摸能力
    (ua.includes("Macintosh") && "ontouchend" in document)
}

export const isInAppWebview = () => {
  if (typeof window !== "undefined") {
    return window.navigator.userAgent.includes("_App")
  }
  return false
}