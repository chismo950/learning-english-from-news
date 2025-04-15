"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Play, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

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
}

export default function NewsFeed({ news, accent, isHistory = false }: NewsFeedProps) {
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playSentence = (text: string, sentenceId: string) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    // Create the API URL with encoded text
    const encodedText = encodeURIComponent(text)
    const audioUrl = `/api/tts?text=${encodedText}&speaker_id=p364`
    
    // Create and play the audio
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    
    // Update state to show which sentence is playing
    setPlayingAudioId(sentenceId)
    
    // Play the audio
    audio.play()
    
    // Reset when done
    audio.onended = () => {
      setPlayingAudioId(null)
      audioRef.current = null
    }
  }

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
                      className={`h-8 w-8 p-0 mr-2 rounded-full ${playingAudioId === `${index}-${idx}` ? 'bg-primary text-primary-foreground' : ''}`}
                      onClick={() => playSentence(sentence.english, `${index}-${idx}`)}
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
