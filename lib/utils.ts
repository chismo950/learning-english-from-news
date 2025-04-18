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



/**
 * 判定当前浏览器是否运行在 Apple‑silicon (M‑series) Mac。
 *
 * @returns Promise<true | false | undefined>
 *          true       → Apple Silicon
 *          false      → Intel
 *          undefined  → 无法确定（浏览器/环境限制）
 */
export async function detectAppleSiliconMac(): Promise<true | false | undefined> {
  // -------- 仅在客户端执行 --------
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return undefined;
  }

  /* ---------- 1️⃣ UA‑CH ---------- */
  // 某些 TS lib 把 userAgentData 标成 unknown；显式断言
  const uaData = (navigator as any).userAgentData as
    | NavigatorUAData
    | undefined;

  if (uaData?.getHighEntropyValues) {
    try {
      // “architecture” 属于高熵字段
      const { architecture } = await uaData.getHighEntropyValues(
        ['architecture']
      ) as { architecture?: string };

      if (architecture === 'arm') return true;                     // M1/M2/M3 …
      if (architecture === 'x86' || architecture === 'x86_64') {
        return false;                                             // Intel
      }
    } catch {
      /* ignore */
    }
  }

  /* ---------- 2️⃣ WebGL ---------- */
  try {
    const canvas = document.createElement('canvas');

    // 断言到 WebGLRenderingContext，TS 才知道有 getExtension
    const gl =
      (canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')) as
        | WebGLRenderingContext
        | null;

    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(
          debugInfo.UNMASKED_RENDERER_WEBGL
        ) as string | null;

        if (renderer) {
          // 典型渲染器：Apple M3 Pro、Apple M2、Apple M1
          if (/Apple\s+M\d/i.test(renderer)) return true;
          if (/Intel|AMD|NVIDIA/i.test(renderer)) return false;
        }
      }
    }
  } catch {
    /* ignore */
  }

  /* ---------- 3️⃣ 无法确定 ---------- */
  return undefined;
}

/* ---------- 可选：为旧 TS 环境补充简易声明 ---------- */
/**
 * 在 TS < 4.5 时可能缺少 NavigatorUAData；如已由 lib.dom.d.ts 提供可删除
 */
declare global {
  interface NavigatorUAData {
    getHighEntropyValues(hints: string[]): Promise<{
      architecture?: string;
      [key: string]: unknown;
    }>;
  }
}