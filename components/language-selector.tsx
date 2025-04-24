"use client"

import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

export const languages = [
  { code: "mi", name: "Te Reo Māori", flag: "🇳🇿" },
  { code: "zh-TW", name: "繁體中文", flag: "繁" },
  { code: "zh-CN", name: "简体中文", flag: "🇨🇳" },
  { code: "si", name: "සිංහල", flag: "🇱🇰" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "한국어", flag: "🇰🇷" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "es", name: "Español", flag: "es" },
  { code: "pt", name: "Português", flag: "pt" },
  { code: "th", name: "ไทย", flag: "🇹🇭" },
  { code: "vi", name: "Tiếng Việt", flag: "🇻🇳" },
]

interface LanguageSelectorProps {
  value: string
  onChange: (value: string) => void
}

export default function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-base">Your Native Language</Label>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2"
      >
        {languages.map((language) => (
          <div key={language.code} className="flex items-center space-x-2">
            <RadioGroupItem value={language.code} id={`language-${language.code}`} />
            <Label htmlFor={`language-${language.code}`} className="cursor-pointer">
              <span className="mr-2">{language.flag}</span>
              {language.name}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  )
}
