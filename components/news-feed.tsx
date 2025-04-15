"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Play, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { isIOSorIPad } from "@/lib/utils"

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
  preloadAudio?: boolean // New prop to control preloading
}

// Map of accent values to language/voice codes for browser TTS
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
  preloadAudio = false // Default to false (no preloading)
}: NewsFeedProps) {
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [preloadedAudio, setPreloadedAudio] = useState<Record<string, HTMLAudioElement>>({})
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({})
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])

  // Initialize speech synthesis and load available voices
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      // Get initial list of voices
      const voices = window.speechSynthesis.getVoices()
      setAvailableVoices(voices)

      // Handle voices changing (happens in some browsers after page load)
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

  // Find the best matching voice for the current accent
  const getBestVoiceForAccent = (accentCode: string): SpeechSynthesisVoice | null => {
    if (!availableVoices.length || !window.speechSynthesis) return null
    
    const accentConfig = ACCENT_TO_VOICE_MAP[accentCode] || ACCENT_TO_VOICE_MAP["en-US"] // default to US accent
    
    // Try to find a voice that matches one of the preferred voice names
    for (const voiceName of accentConfig.voiceNames) {
      const matchedVoice = availableVoices.find(voice => 
        voice.name.includes(voiceName) || voice.name === voiceName
      )
      if (matchedVoice) return matchedVoice
    }
    
    // If no match by name, try to find by language
    const langMatch = availableVoices.find(voice => voice.lang === accentConfig.lang)
    if (langMatch) return langMatch
    
    // If still no match, return any English voice or null
    return availableVoices.find(voice => voice.lang.startsWith('en')) || null
  }

  // Play text using browser's speech synthesis
  const playWithBrowserTTS = (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return false
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel()
    
    const utterance = new SpeechSynthesisUtterance(text)
    
    // Set the voice based on accent
    const voice = getBestVoiceForAccent(accent)
    if (voice) utterance.voice = voice
    
    // Set language based on accent
    const accentConfig = ACCENT_TO_VOICE_MAP[accent] || ACCENT_TO_VOICE_MAP["en-US"]
    utterance.lang = accentConfig.lang
    
    // Start speaking
    window.speechSynthesis.speak(utterance)
    
    return true
  }

  // Preload audio for all sentences - only if preloadAudio is true
  useEffect(() => {
    // Skip preloading if the feature is disabled
    if (!preloadAudio) return;
    
    const audioCache: Record<string, HTMLAudioElement> = {}
    const loadingState: Record<string, boolean> = {}
    
    // Create preload function - renamed to avoid conflict with the prop name
    const preloadAudioFile = (text: string, sentenceId: string) => {
      const encodedText = encodeURIComponent(text)
      let audioUrl = `/api/tts?text=${encodedText}&speaker_id=p364`
      if (isIOSorIPad()) {
        audioUrl = `https://tts.english-dictionary.app/api/tts?speaker_id=p364&text=${encodedText}`;
      }
      
      const audio = new Audio()
      audio.src = audioUrl
      
      // Mark as loading
      loadingState[sentenceId] = true
      
      // When the audio is loaded, update the loading state
      audio.oncanplaythrough = () => {
        loadingState[sentenceId] = false
        setIsLoading({...loadingState})
      }
      
      // Catch any loading errors
      audio.onerror = () => {
        console.error(`Failed to preload audio for: ${text}`)
        loadingState[sentenceId] = false
        setIsLoading({...loadingState})
      }
      
      // Add to cache
      audioCache[sentenceId] = audio
    }
    
    // Start preloading all sentences
    news.forEach((item, index) => {
      item.sentences.forEach((sentence, idx) => {
        const sentenceId = `${index}-${idx}`
        preloadAudioFile(sentence.english, sentenceId)
      })
    })
    
    // Update state with all preloaded audios and loading status
    setPreloadedAudio(audioCache)
    setIsLoading(loadingState)
    
    // Cleanup function
    return () => {
      // Abort all audio loading on unmount
      Object.values(audioCache).forEach(audio => {
        audio.oncanplaythrough = null
        audio.onerror = null
        audio.src = ''
      })
      
      // Cancel any speech synthesis
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [news, preloadAudio]) // Added preloadAudio to dependencies

  const playSentence = (text: string, sentenceId: string) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    
    // Stop any speech synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    
    // Update state to show which sentence is playing
    setPlayingAudioId(sentenceId)
    
    // If not preloading, set loading state for this sentence
    if (!preloadAudio) {
      setIsLoading(prev => ({...prev, [sentenceId]: true}))
    }
    
    // Use preloaded audio if available and preloading is enabled
    if (preloadAudio && preloadedAudio[sentenceId]) {
      const audio = preloadedAudio[sentenceId]
      
      // Reset audio to beginning if it was already played
      audio.currentTime = 0
      
      // Set as current audio
      audioRef.current = audio
      
      // Play the audio
      const playPromise = audio.play()
      
      // Handle play errors - fallback to browser TTS
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Audio playback failed, falling back to browser TTS:", error)
          
          // Try to play with browser TTS
          const ttsFallbackSuccessful = playWithBrowserTTS(text)
          
          // If browser TTS also failed or isn't available, show error
          if (!ttsFallbackSuccessful) {
            console.error("Browser TTS fallback also failed")
          }
        })
      }
      
      // Reset when done
      audio.onended = () => {
        setPlayingAudioId(null)
        audioRef.current = null
      }
    } else {
      // Load audio on demand
      const encodedText = encodeURIComponent(text)
      let audioUrl = `/api/tts?text=${encodedText}&speaker_id=p364`
      if (isIOSorIPad()) {
        audioUrl = `https://tts.english-dictionary.app/api/tts?speaker_id=p364&text=${encodedText}`;
      }
      
      // Create and play the audio
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      
      // Update loading state when audio is ready
      if (!preloadAudio) {
        audio.oncanplaythrough = () => {
          setIsLoading(prev => ({...prev, [sentenceId]: false}))
        }
      }
      
      // Play the audio
      const playPromise = audio.play()
      
      // Handle play errors - fallback to browser TTS
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Audio playback failed, falling back to browser TTS:", error)
          setIsLoading(prev => ({...prev, [sentenceId]: false}))
          
          // Try to play with browser TTS
          const ttsFallbackSuccessful = playWithBrowserTTS(text)
          
          // If browser TTS also failed or isn't available, show error
          if (!ttsFallbackSuccessful) {
            console.error("Browser TTS fallback also failed")
          }
        })
      }
      
      // Reset when done
      audio.onended = () => {
        setPlayingAudioId(null)
        audioRef.current = null
        
        // Clean up handler
        if (!preloadAudio) {
          audio.oncanplaythrough = null
        }
      }
    }
  }

  // Stop all audio playback
  const stopAllAudio = () => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    
    // Stop any speech synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    
    setPlayingAudioId(null)
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAllAudio()
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
    // If item a is international news, it should come after item b
    if (a.region === "international" && b.region !== "international") {
      return 1
    }
    // If item b is international news, it should come after item a
    if (a.region !== "international" && b.region === "international") {
      return -1
    }
    // Otherwise, keep the original order
    return 0
  })

  return (
    <div className="space-y-6">
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
              {item.sentences.map((sentence, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-start">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-8 w-8 p-0 mr-2 rounded-full ${
                        playingAudioId === `${index}-${idx}` 
                          ? 'bg-primary text-primary-foreground' 
                          : isLoading[`${index}-${idx}`] 
                            ? 'opacity-50 cursor-wait' 
                            : ''
                      }`}
                      onClick={() => playSentence(sentence.english, `${index}-${idx}`)}
                      disabled={isLoading[`${index}-${idx}`]}
                    >
                      <Play className="h-4 w-4" />
                      <span className="sr-only">Play</span>
                    </Button>
                    <p className="text-base">{sentence.english}</p>
                  </div>
                  <p className="text-base text-muted-foreground pl-10">{sentence.translated}</p>
                  {idx < item.sentences.length - 1 && <Separator className="my-2" />}
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 text-sm text-muted-foreground">
            Published: {new Date(item.publishedDate).toLocaleString()}
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
