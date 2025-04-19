"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Play, ExternalLink, ChevronDown, ChevronRight, Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { 
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem 
} from "@/components/ui/select"
import { languages } from "@/components/language-selector"
import { regions } from "@/components/region-selector"

interface NewsItem {
  title: string
  titleTranslated: string
  region: string
  sentences: Array<{
    english: string
    translated: string
    favorite?: boolean
  }>
  source: string
  sourceUrl: string
  publishedDate: string
}

interface NewsFeedProps {
  news: NewsItem[]
  accent: string
  isHistory?: boolean
  nativeLanguage?: string
  date: string
}

const ACCENT_TO_VOICE_MAP: Record<string, { lang: string, voiceNames: string[] }> = {
  "en-US": { lang: "en-US", voiceNames: ["Google US English", "Microsoft Aria Online (Natural) - English (United States)", "English (United States)"] },
  "en-GB": { lang: "en-GB", voiceNames: ["Google UK English Female", "Microsoft Sonia Online (Natural) - English (United Kingdom)", "English (United Kingdom)"] },
  "en-NZ": { lang: "en-NZ", voiceNames: ["Google New Zealand", "English (New Zealand)"] },
  "en-IN": { lang: "en-IN", voiceNames: ["Google India", "Microsoft Neerja Online (Natural) - English (India)", "English (India)"] },
}

export default function NewsFeed({ 
  news, 
  accent: initialAccent, 
  isHistory = false,
  nativeLanguage = "zh-CN",
  date,
}: NewsFeedProps) {
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({})
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const audioCache = useRef<Record<string, string>>({}) // `${sentenceId}-${accent}` -> audioUrl
  const [openEnglish, setOpenEnglish] = useState<Record<string, boolean>>({})
  const [openTranslation, setOpenTranslation] = useState<Record<string, boolean>>({})
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [inputRows, setInputRows] = useState<Record<string, number>>({})

  const getInitialAccent = () => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("preferredAccent")
      if (stored && (stored === "en-US" || stored === "en-GB" || stored === "en-IN")) {
        return stored
      }
    }
    // Default to en-US regardless of initialAccent
    return "en-US"
  }

  const [selectedAccent, setSelectedAccent] = useState(getInitialAccent)

  const handleInputChange = (sentenceKey: string, value: string) => {
    setInputValues(prev => ({ ...prev, [sentenceKey]: value }))
    const lines = value.split("\n").length
    setInputRows(prev => ({ ...prev, [sentenceKey]: Math.max(1, lines) }))
  }

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
      if (stored === "listening" || stored === "easy" || stored === "writing") return stored
    }
    return "easy"
  }
  const [audioSpeed, setAudioSpeed] = useState(getInitialAudioSpeed)
  const [studyMode, setStudyMode] = useState<"listening" | "easy" | "writing">(getInitialStudyMode)

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
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("preferredAccent", selectedAccent)
    }
  }, [selectedAccent])

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
    
    const voice = getBestVoiceForAccent(selectedAccent)
    if (voice) utterance.voice = voice
    
    const accentConfig = ACCENT_TO_VOICE_MAP[selectedAccent] || ACCENT_TO_VOICE_MAP["en-US"]
    utterance.lang = accentConfig.lang

    utterance.rate = audioSpeed

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

    // Create a composite cache key that includes the accent
    const cacheKey = `${sentenceId}-${selectedAccent}`
    const cachedUrl = audioCache.current[cacheKey]
    
    if (cachedUrl) {
      const audio = new Audio(cachedUrl)
      audioRef.current = audio
      audio.playbackRate = audioSpeed
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
        body: JSON.stringify({ 
          text, 
          accent: selectedAccent
        })
      })
      if (!res.ok) throw new Error('TTS API error')
      const blob = await res.blob()
      const audioUrl = URL.createObjectURL(blob)
      // Store with the accent-specific cache key
      audioCache.current[cacheKey] = audioUrl
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      audio.playbackRate = audioSpeed
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
      Object.values(audioCache.current).forEach(url => {
        URL.revokeObjectURL(url)
      })
      audioCache.current = {}
    }
  }, [])

  const sortNews = (arr: NewsItem[]) =>
    [...arr].sort((a, b) => {
      // bring items with any favorite sentence to the top
      const aHasFav = a.sentences.some(s => s.favorite)
      const bHasFav = b.sentences.some(s => s.favorite)
      if (aHasFav && !bHasFav) return -1
      if (!aHasFav && bHasFav) return 1

      // region-based ordering
      if (a.region === "international" && b.region !== "international") return 1
      if (a.region !== "international" && b.region === "international") return -1
      return 0
    })

  const [feedNews, setFeedNews] = useState<NewsItem[]>(() => sortNews(news))
  useEffect(() => {
    setFeedNews(sortNews(news))
  }, [news])

  useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem("newsHistory")
    if (!raw) return
    try {
      const hist: Record<string, NewsItem[]> = JSON.parse(raw)
      if (hist[date]) {
        setFeedNews(sortNews(hist[date]))
      }
    } catch (e) {
      console.error("Failed to sync favorites on tab switch:", e)
    }
  }, [date])

  const toggleFavorite = (sentenceText: string) => {
    const updated = feedNews.map(item => ({
      ...item,
      sentences: item.sentences.map(s =>
        s.english === sentenceText
          ? { ...s, favorite: !s.favorite }
          : s
      ),
    }))
    setFeedNews(updated)
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem("newsHistory")
      if (raw) {
        try {
          const hist: Record<string, NewsItem[]> = JSON.parse(raw)
          if (hist[date]) {
            hist[date] = hist[date].map(item => ({
              ...item,
              sentences: item.sentences.map(s =>
                s.english === sentenceText
                  ? { ...s, favorite: !s.favorite }
                  : s
              ),
            }))
            window.localStorage.setItem("newsHistory", JSON.stringify(hist))
          }
        } catch (e) {
          console.error("Error updating favorite:", e)
        }
      }
    }
  }

  const sortedNews = feedNews

  if (news.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-lg mb-4">No news available for this date.</p>
      </div>
    )
  }

  const translationLabel = languages.find(l => l.code === nativeLanguage)?.name || "Translation"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="audio-speed" className="text-sm text-muted-foreground whitespace-nowrap">Speed:</label>
          <Select
            value={audioSpeed.toString()}
            onValueChange={val => setAudioSpeed(Number(val))}
          >
            <SelectTrigger id="audio-speed" className="w-20 h-8 px-2 py-1 text-sm">
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
        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="study-mode" className="text-sm text-muted-foreground whitespace-nowrap">Mode:</label>
          <Select
            value={studyMode}
            onValueChange={val => setStudyMode(val as "listening" | "easy" | "writing")}
          >
            <SelectTrigger id="study-mode" className="w-36 h-8 px-2 py-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Relaxed Mode</SelectItem>
              <SelectItem value="listening">Listening Practice</SelectItem>
              <SelectItem value="writing">Writing Practice</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="accent-select" className="text-sm text-muted-foreground whitespace-nowrap">Accent:</label>
          <Select
            value={selectedAccent}
            onValueChange={setSelectedAccent}
          >
            <SelectTrigger id="accent-select" className="w-24 h-8 px-2 py-1 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en-US">🇺🇸 American English</SelectItem>
              <SelectItem value="en-GB">🇬🇧 British English</SelectItem>
              <SelectItem value="en-IN">🇮🇳 Indian English</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {sortedNews.map((item, index) => (
        <Card key={index} className="overflow-hidden">
          <CardHeader className="bg-muted/50">
            <div className="flex justify-between items-center">
              <div className="grow">
                <Badge variant="outline" className="mb-2">
                  {regions.find(l => l.code === item.region)?.flag} {item.region}
                </Badge>
              </div>
              <div className="mr-2 text-muted-foreground">
                {new Date(item.publishedDate).toLocaleDateString()}
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {/* <span className="ml-1">Source</span> */}
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
                    <div className="flex">
                      <div className="flex flex-col mr-4 space-y-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-8 w-8 p-0 rounded-full ${
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 rounded-full"
                          onClick={() => toggleFavorite(sentence.english)}
                          aria-label="Toggle Favorite"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              sentence.favorite
                                ? "text-yellow-500"
                                : "text-muted-foreground"
                            }`}
                          />
                        </Button>
                      </div>
                      <div className="flex flex-col space-y-1 flex-1">
                        
                        {studyMode === "writing" && (
                          <textarea
                            className="w-full p-2 border rounded resize-none overflow-hidden text-base"
                            // rows still defines min‐lines; height will adjust dynamically
                            rows={inputRows[sentenceKey] || 1}
                            value={inputValues[sentenceKey] || ""}
                            placeholder="Type the sentence you heard"
                            onChange={e => handleInputChange(sentenceKey, e.target.value)}
                            onInput={e => {
                              const el = e.currentTarget as HTMLTextAreaElement
                              el.style.height = "auto"
                              el.style.height = `${el.scrollHeight}px`
                            }}
                          />
                        )}

                        {(studyMode === "listening" || studyMode === "writing") ? (
                          <span className="pt-1">
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
                              <p className="text-base">{sentence.english}</p>
                            )}
                          </span>
                        ) : (
                          <p className="text-base pt-1">{sentence.english}</p>
                        )}

                        {(studyMode === "listening" || studyMode === "writing") ? (
                          <span className="pt-3">
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
                              <p className="text-base text-muted-foreground">{sentence.translated}</p>
                            )}
                          </span>
                        ) : (
                          <p className="text-base text-muted-foreground pt-3">{sentence.translated}</p>
                        )}
                      </div>
                    </div>
                    {idx < item.sentences.length - 1 && <Separator className="my-2" />}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
