"use client"

import { useEffect, useState } from "react"
import { ModeToggle } from "@/components/mode-toggle"
import LanguageSelector from "@/components/language-selector"
import RegionSelector from "@/components/region-selector"
import AccentSelector from "@/components/accent-selector"
import NewsFeed from "@/components/news-feed"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Settings, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

// Define interfaces for the news and history data
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

interface NewsHistory {
  [date: string]: NewsItem[]
}

export default function Home() {
  const [initialized, setInitialized] = useState(false)
  const [showPreferences, setShowPreferences] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nativeLanguage, setNativeLanguage] = useState("")
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [accent, setAccent] = useState("en-US")
  const [newsData, setNewsData] = useState<NewsItem[]>([])
  const [history, setHistory] = useState<NewsHistory>({})
  const [currentTab, setCurrentTab] = useState("today")
  const [validationError, setValidationError] = useState<string | null>(null)
  const [hasTodayData, setHasTodayData] = useState(false)

  // Get today's date in YYYY-MM-DD format
  const getTodayString = () => {
    return new Date().toISOString().split("T")[0]
  }

  useEffect(() => {
    // Load preferences from localStorage
    const storedLanguage = localStorage.getItem("nativeLanguage")
    const storedRegions = localStorage.getItem("selectedRegions")
    const storedAccent = localStorage.getItem("accent")
    const storedHistory = localStorage.getItem("newsHistory")

    // Parse stored history
    let parsedHistory: NewsHistory = {}
    if (storedHistory) {
      try {
        parsedHistory = JSON.parse(storedHistory) as NewsHistory
        setHistory(parsedHistory)
      } catch (e) {
        console.error("Error parsing stored history:", e)
      }
    }

    // Check if we have today's data
    const today = getTodayString()
    const hasTodaysData = parsedHistory && parsedHistory[today] && parsedHistory[today].length > 0
    setHasTodayData(!!hasTodaysData)

    // If we have today's data, load it
    if (hasTodaysData) {
      setNewsData(parsedHistory[today])
    }

    // Set stored preferences
    if (storedLanguage) setNativeLanguage(storedLanguage)
    if (storedRegions) {
      try {
        setSelectedRegions(JSON.parse(storedRegions))
      } catch (e) {
        console.error("Error parsing stored regions:", e)
        setSelectedRegions([])
      }
    }
    if (storedAccent) setAccent(storedAccent)

    // If preferences exist and we don't have today's data, show preferences
    // Otherwise, hide preferences and show news
    if (storedLanguage && storedRegions && hasTodaysData) {
      setShowPreferences(false)
    } else {
      setShowPreferences(true)
    }

    setInitialized(true)
  }, [])

  const fetchNews = async () => {
    if (!initialized) return

    // Validate language and regions before fetching
    if (!nativeLanguage) {
      setValidationError("Please select your native language")
      return
    }

    if (selectedRegions.length === 0) {
      setValidationError("Please select at least one region")
      return
    }

    setValidationError(null)
    setLoading(true)

    try {
      const response = await fetch("/api/news", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language: nativeLanguage,
          regions: selectedRegions,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to fetch news")
      }

      const data = await response.json()
      setNewsData(data.news)

      // Save to history
      const today = getTodayString()
      const updatedHistory = { ...history, [today]: data.news }
      
      // Keep only the 7 most recent days of history
      const historyDates = Object.keys(updatedHistory).sort((a, b) => 
        new Date(b).getTime() - new Date(a).getTime()
      );
      
      // If we have more than 7 days, remove the oldest ones
      if (historyDates.length > 7) {
        const datesToRemove = historyDates.slice(7);
        datesToRemove.forEach(date => {
          delete updatedHistory[date];
        });
      }
      
      setHistory(updatedHistory)
      localStorage.setItem("newsHistory", JSON.stringify(updatedHistory))
      setHasTodayData(true)
    } catch (error) {
      console.error("Error fetching news:", error)
    } finally {
      setLoading(false)
    }
  }

  const savePreferences = () => {
    // Validate inputs
    if (!nativeLanguage) {
      setValidationError("Please select your native language")
      return
    }

    if (selectedRegions.length === 0) {
      setValidationError("Please select at least one region")
      return
    }

    // Clear validation error
    setValidationError(null)

    // Save preferences
    localStorage.setItem("nativeLanguage", nativeLanguage)
    localStorage.setItem("selectedRegions", JSON.stringify(selectedRegions))
    localStorage.setItem("accent", accent)

    // Hide preferences panel
    setShowPreferences(false)

    fetchNews(); return // fetch anyway even if we have today's data

    // Check if we already have today's data
    const today = getTodayString()
    if (history[today] && history[today].length > 0) {
      setNewsData(history[today])
    } else {
      // Fetch news if we don't have today's data
      fetchNews()
    }
  }

  const getHistoryDates = () => {
    return Object.keys(history).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-xl md:text-2xl font-bold">Learning English from News</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setShowPreferences(!showPreferences)} aria-label={showPreferences ? "Hide Preferences" : "Edit Preferences"}>
              {showPreferences ? <X className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
            </Button>
            <ModeToggle />
          </div>
        </header>

        {showPreferences && (
          <div className="mb-8 p-6 border rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold mb-4">Your Preferences</h2>

            {validationError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-6">
              <LanguageSelector value={nativeLanguage} onChange={setNativeLanguage} />
              <RegionSelector value={selectedRegions} onChange={setSelectedRegions} />
              <AccentSelector value={accent} onChange={setAccent} />

              <div className="flex justify-end">
                <Button onClick={savePreferences}>Save & Continue</Button>
              </div>
            </div>
          </div>
        )}

        {initialized && !showPreferences && (
          <>
            <div className="mb-4">
              <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="today">Today</TabsTrigger>
                  {getHistoryDates()
                    .filter((date) => date !== getTodayString())
                    .map((date) => (
                      <TabsTrigger key={date} value={date}>
                        {new Date(date).toLocaleDateString()}
                      </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="today">
                  {loading ? (
                    <div className="flex justify-center items-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="ml-2">Fetching latest news...</span>
                    </div>
                  ) : (
                    <>
                      {newsData.length > 0 ? (
                        <NewsFeed news={newsData} accent={accent} />
                      ) : (
                        <div className="text-center py-12">
                          <p className="text-lg mb-4">No news available for today.</p>
                          {!hasTodayData && (
                            <Button onClick={fetchNews} disabled={loading}>
                              {loading ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Fetching...
                                </>
                              ) : (
                                "Fetch Today's News"
                              )}
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                {getHistoryDates().map((date) => (
                  <TabsContent key={date} value={date}>
                    <NewsFeed news={history[date] || []} accent={accent} isHistory />
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
