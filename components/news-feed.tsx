"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Play, ExternalLink, ChevronDown, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { isIOSorIPad } from "@/lib/utils"
import { 
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem 
} from "@/components/ui/select"
import { languages } from "@/components/language-selector"

interface NewsItem {
  title: string
  titleTranslated: string
  region: string
  sentences: Array<{
    english: string
    translated: string
  }>
  source: string
  sourceUrl: string
  publishedDate: string
}

interface NewsFeedProps {
  news: NewsItem[]
  accent: string
  isHistory?: boolean
  nativeLanguage?: string // add this prop
}

const ACCENT_TO_VOICE_MAP: Record<string, { lang: string, voiceNames: string[] }> = {
  "en-US": { lang: "en-US", voiceNames: ["Google US English", "Microsoft Aria Online (Natural) - English (United States)", "English (United States)"] },
  "en-GB": { lang: "en-GB", voiceNames: ["Google UK English Female", "Microsoft Sonia Online (Natural) - English (United Kingdom)", "English (United Kingdom)"] },
  "en-NZ": { lang: "en-NZ", voiceNames: ["Google New Zealand", "English (New Zealand)"] },
  "en-IN": { lang: "en-IN", voiceNames: ["Google India", "Microsoft Neerja Online (Natural) - English (India)", "English (India)"] },
}

export default function NewsFeed({ 
  news, 
  accent, 
  isHistory = false,
  nativeLanguage = "zh-CN", // default fallback
}: NewsFeedProps) {
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({})
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const audioCache = useRef<Record<string, string>>({}) // sentenceId -> audioUrl
  const [openEnglish, setOpenEnglish] = useState<Record<string, boolean>>({})
  const [openTranslation, setOpenTranslation] = useState<Record<string, boolean>>({})

  // --- 新增: 从 localStorage 读取初始值 ---
  const getInitialAudioSpeed = () => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("audioSpeed")
      if (stored && !isNaN(Number(stored))) return Number(stored)
    }
    return 1
  }
  const getInitialStudyMode = () => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("studyMode")
      if (stored === "listening" || stored === "easy") return stored
    }
    return "easy"
  }
  const [audioSpeed, setAudioSpeed] = useState(getInitialAudioSpeed) // 新增音频速度状态
  const [studyMode, setStudyMode] = useState<"listening" | "easy">(getInitialStudyMode)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices()
      setAvailableVoices(voices)

      const voicesChangedHandler = () => {
        const updatedVoices = window.speechSynthesis.getVoices()
        setAvailableVoices(updatedVoices)
      }

      window.speechSynthesis.addEventListener('voiceschanged', voicesChangedHandler)

      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', voicesChangedHandler)
      }
    }
  }, [])

  // --- 新增: audioSpeed/studyMode 写入 localStorage ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("audioSpeed", audioSpeed.toString())
    }
  }, [audioSpeed])
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("studyMode", studyMode)
    }
  }, [studyMode])

  const getBestVoiceForAccent = (accentCode: string): SpeechSynthesisVoice | null => {
    if (!availableVoices.length || !window.speechSynthesis) return null
    
    const accentConfig = ACCENT_TO_VOICE_MAP[accentCode] || ACCENT_TO_VOICE_MAP["en-US"]
    
    for (const voiceName of accentConfig.voiceNames) {
      const matchedVoice = availableVoices.find(voice => 
        voice.name.includes(voiceName) || voice.name === voiceName
      )
      if (matchedVoice) return matchedVoice
    }
    
    const langMatch = availableVoices.find(voice => voice.lang === accentConfig.lang)
    if (langMatch) return langMatch
    
    return availableVoices.find(voice => voice.lang.startsWith('en')) || null
  }

  const playWithBrowserTTS = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false
    
    window.speechSynthesis.cancel()
    
    const utterance = new SpeechSynthesisUtterance(text)
    
    const voice = getBestVoiceForAccent(accent)
    if (voice) utterance.voice = voice
    
    const accentConfig = ACCENT_TO_VOICE_MAP[accent] || ACCENT_TO_VOICE_MAP["en-US"]
    utterance.lang = accentConfig.lang

    utterance.rate = audioSpeed // 应用音频速度

    window.speechSynthesis.speak(utterance)
    
    return true
  }

  const playSentence = async (text: string, sentenceId: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setPlayingAudioId(sentenceId)
    setIsLoading(prev => ({ ...prev, [sentenceId]: true }))

    // 检查缓存
    const cachedUrl = audioCache.current[sentenceId]
    if (cachedUrl) {
      const audio = new Audio(cachedUrl)
      audioRef.current = audio
      audio.playbackRate = audioSpeed // 应用音频速度
      audio.oncanplaythrough = () => {
        setIsLoading(prev => ({ ...prev, [sentenceId]: false }))
      }
      audio.onended = () => {
        setPlayingAudioId(null)
        audioRef.current = null
      }
      audio.onerror = () => {
        setIsLoading(prev => ({ ...prev, [sentenceId]: false }))
        const ttsFallbackSuccessful = playWithBrowserTTS(text)
        if (!ttsFallbackSuccessful) {
          console.error('Browser TTS fallback also failed')
        }
      }
      await audio.play()
      return
    }

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speaker_id: accent || 'p364' })
      })
      if (!res.ok) throw new Error('TTS API error')
      const blob = await res.blob()
      const audioUrl = URL.createObjectURL(blob)
      audioCache.current[sentenceId] = audioUrl // 缓存
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      audio.playbackRate = audioSpeed // 应用音频速度
      audio.oncanplaythrough = () => {
        setIsLoading(prev => ({ ...prev, [sentenceId]: false }))
      }
      audio.onended = () => {
        setPlayingAudioId(null)
        audioRef.current = null
        // 不 revokeObjectURL，这样缓存可用，统一在卸载时释放
      }
      audio.onerror = () => {
        setIsLoading(prev => ({ ...prev, [sentenceId]: false }))
        const ttsFallbackSuccessful = playWithBrowserTTS(text)
        if (!ttsFallbackSuccessful) {
          console.error('Browser TTS fallback also failed')
        }
      }
      await audio.play()
    } catch (err) {
      setIsLoading(prev => ({ ...prev, [sentenceId]: false }))
      const ttsFallbackSuccessful = playWithBrowserTTS(text)
      if (!ttsFallbackSuccessful) {
        console.error('Browser TTS fallback also failed')
      }
    }
  }

  const stopAllAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    
    setPlayingAudioId(null)
  }

  useEffect(() => {
    return () => {
      stopAllAudio()
      // 释放所有缓存的 audioUrl
      Object.values(audioCache.current).forEach(url => {
        URL.revokeObjectURL(url)
      })
      audioCache.current = {}
    }
  }, [])

  if (news.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-lg mb-4">No news available for this date.</p>
      </div>
    )
  }

  const sortedNews = [...news].sort((a, b) => {
    if (a.region === "international" && b.region !== "international") {
      return 1
    }
    if (a.region !== "international" && b.region === "international") {
      return -1
    }
    return 0
  })

  // Get translation label based on nativeLanguage
  const translationLabel = languages.find(l => l.code === nativeLanguage)?.name || "Translation"

  return (
    <div className="space-y-6">
      {/* audio speed selection */}
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-2">
          <label htmlFor="audio-speed" className="text-sm text-muted-foreground">Speed:</label>
          <Select
            value={audioSpeed.toString()}
            onValueChange={val => setAudioSpeed(Number(val))}
          >
            <SelectTrigger id="audio-speed" className="w-24 h-8 px-2 py-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.7">0.7x</SelectItem>
              <SelectItem value="0.85">0.85x</SelectItem>
              <SelectItem value="1">1x</SelectItem>
              <SelectItem value="1.15">1.15x</SelectItem>
              <SelectItem value="1.3">1.3x</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* study mode selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="study-mode" className="text-sm text-muted-foreground">Mode:</label>
          <Select
            value={studyMode}
            onValueChange={val => setStudyMode(val as "listening" | "easy")}
          >
            <SelectTrigger id="study-mode" className="w-28 h-8 px-2 py-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="listening">Listening Mode</SelectItem>
              <SelectItem value="easy">Easy Mode</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {sortedNews.map((item, index) => (
        <Card key={index} className="overflow-hidden">
          <CardHeader className="bg-muted/50">
            <div className="flex justify-between items-start">
              <div>
                <Badge variant="outline" className="mb-2">
                  {item.region}
                </Badge>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Source
                </a>
              </Button>
            </div>
            <CardTitle className="text-xl">{item.title}</CardTitle>
            <p className="text-base text-muted-foreground">{item.titleTranslated}</p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {item.sentences.map((sentence, idx) => {
                const sentenceKey = `${index}-${idx}`
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-start">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-8 w-8 p-0 mr-2 rounded-full ${
                          playingAudioId === sentenceKey
                            ? 'bg-primary text-primary-foreground'
                            : isLoading[sentenceKey]
                              ? 'opacity-50 cursor-wait'
                              : ''
                        }`}
                        onClick={() => playSentence(sentence.english, sentenceKey)}
                        disabled={isLoading[sentenceKey]}
                      >
                        <Play className="h-4 w-4" />
                        <span className="sr-only">Play</span>
                      </Button>
                      {/* Listening Mode collapsible English */}
                      {studyMode === "listening" ? (
                        <div className="flex-1">
                          <button
                            className="flex items-center gap-1 text-base font-medium focus:outline-none"
                            onClick={() =>
                              setOpenEnglish(prev => ({
                                ...prev,
                                [sentenceKey]: !prev[sentenceKey]
                              }))
                            }
                          >
                            {openEnglish[sentenceKey] ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                            <span>English</span>
                          </button>
                          {openEnglish[sentenceKey] && (
                            <div className="pt-1">
                              <p className="text-base">{sentence.english}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        // Easy Mode: show English directly
                        <p className="text-base">{sentence.english}</p>
                      )}
                    </div>
                    {/* Listening Mode collapsible translation */}
                    {studyMode === "listening" ? (
                      <div className="pl-10">
                        <button
                          className="flex items-center gap-1 text-base text-muted-foreground focus:outline-none"
                          onClick={() =>
                            setOpenTranslation(prev => ({
                              ...prev,
                              [sentenceKey]: !prev[sentenceKey]
                            }))
                          }
                        >
                          {openTranslation[sentenceKey] ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <span>{translationLabel}</span>
                        </button>
                        {openTranslation[sentenceKey] && (
                          <div className="pt-1">
                            <p className="text-base text-muted-foreground">{sentence.translated}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      // Easy Mode: show translation directly
                      <p className="text-base text-muted-foreground pl-10">{sentence.translated}</p>
                    )}
                    {idx < item.sentences.length - 1 && <Separator className="my-2" />}
                  </div>
                )
              })}
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 text-sm text-muted-foreground">
            Published: {new Date(item.publishedDate).toLocaleDateString()}
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
