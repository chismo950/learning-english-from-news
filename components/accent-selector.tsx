"use client"

import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

const accents = [
  { code: "en-US", name: "American", flag: "🇺🇸" },
  { code: "en-NZ", name: "New Zealand", flag: "🇳🇿" },
  { code: "en-GB", name: "British", flag: "🇬🇧" },
  { code: "en-IN", name: "Indian", flag: "🇮🇳" },
]

interface AccentSelectorProps {
  value: string
  onChange: (value: string) => void
}

export default function AccentSelector({ value, onChange }: AccentSelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-base">English Accent for Audio</Label>
      <RadioGroup value={value} onValueChange={onChange} className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {accents.map((accent) => (
          <div key={accent.code} className="flex items-center space-x-2">
            <RadioGroupItem value={accent.code} id={`accent-${accent.code}`} />
            <Label htmlFor={`accent-${accent.code}`} className="cursor-pointer">
              <span className="mr-2">{accent.flag}</span>
              {accent.name}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  )
}
