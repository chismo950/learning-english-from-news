"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { isInAppWebview } from "@/lib/utils"

// Add TypeScript declaration for ReactNativeWebView
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

// Function to send theme to the app
const sendThemeToApp = (theme: string) => {
  if (typeof window !== "undefined" && isInAppWebview()) {
    // Use postMessage or other method to communicate with the app
    console.log('sendThemeToApp', theme)
    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "THEME_CHANGE", theme }))
    } else {
      window.postMessage?.({ type: "THEME_CHANGE", theme }, "*")
    }
  }
}

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  // Effect to handle initial theme detection and send to app
  useEffect(() => {
    console.log('theme', theme)
    if (isInAppWebview()) {
      // If theme is already set, send it to the app
      if (theme) {
        sendThemeToApp(theme)
      } 
    }
  }, [theme])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
