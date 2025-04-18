"use client"

import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

export const regions = [
  { code: "new-zealand", name: "New Zealand", flag: "🇳🇿" },
  { code: "china", name: "China", flag: "🇨🇳" },
  { code: "sri-lanka", name: "Sri Lanka", flag: "🇱🇰" },
  { code: "germany", name: "Germany", flag: "🇩🇪" },
  { code: "japan", name: "Japan", flag: "🇯🇵" },
  { code: "korea", name: "Korea", flag: "🇰🇷" },
  { code: "france", name: "France", flag: "🇫🇷" },
  { code: "spain", name: "Spain", flag: "🇪🇸" },
  { code: "portugal", name: "Portugal", flag: "🇵🇹" },
  { code: "international", name: "International News", flag: "🌎" },
]

interface RegionSelectorProps {
  value: string[]
  onChange: (value: string[]) => void
}

export default function RegionSelector({ value, onChange }: RegionSelectorProps) {
  const [error, setError] = useState<string | null>(null)

  // Count non-international regions
  const countRegularRegions = (regions: string[]) => {
    return regions.filter((r) => r !== "international").length
  }

  const handleRegionChange = (region: string, checked: boolean) => {
    if (checked) {
      // If adding international, just add it
      if (region === "international") {
        onChange([...value, region])
        setError(null)
        return
      }

      // If adding a regular region, check if we're already at the limit
      const currentRegularCount = countRegularRegions(value)
      if (currentRegularCount >= 2) {
        setError("You can select a maximum of 2 regions (excluding International News)")
        return
      }

      onChange([...value, region])
      setError(null)
    } else {
      onChange(value.filter((r) => r !== region))
      setError(null)
    }
  }

  return (
    <div className="space-y-3">
      <Label className="text-base">News Regions</Label>
      {error && (
        <Alert variant="destructive" className="mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {regions.map((region) => (
          <div key={region.code} className="flex items-center space-x-2">
            <Checkbox
              id={`region-${region.code}`}
              checked={value.includes(region.code)}
              onCheckedChange={(checked) => handleRegionChange(region.code, checked as boolean)}
            />
            <Label htmlFor={`region-${region.code}`} className="cursor-pointer">
              <span className="mr-2">{region.flag}</span>
              {region.name}
            </Label>
          </div>
        ))}
      </div>
    </div>
  )
}
