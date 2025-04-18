"use client"

import { useEffect, useState, useRef } from "react"
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
  nativeLanguage?: string
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
  const [accent, setAccent] = useState("en-NZ")
  const [newsData, setNewsData] = useState<NewsItem[]>([])
  const [history, setHistory] = useState<NewsHistory>({})
  const [currentTab, setCurrentTab] = useState("today")
  const [validationError, setValidationError] = useState<string | null>(null)
  const [hasTodayData, setHasTodayData] = useState(false)
  const [isSticky, setIsSticky] = useState(false)
  const [isBannerHidden, setIsBannerHidden] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)

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

    // Only show banner if user agent does NOT contain '_App'
    if (typeof window !== "undefined") {
      const ua = window.navigator.userAgent
      setShowBanner(!ua.includes("_App"))
    }

    setInitialized(true)
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      if (bannerRef.current) {
        const headerHeight = 80; // Approximate header height
        const scrollPosition = window.scrollY;
        
        if (scrollPosition > headerHeight) {
          setIsSticky(true);
        } else {
          setIsSticky(false);
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

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
      // Add nativeLanguage only to the first news item
      const newsWithLanguage = [...data.news];
      if (newsWithLanguage.length > 0) {
        newsWithLanguage[0] = {
          ...newsWithLanguage[0],
          nativeLanguage
        };
      }
      
      const updatedHistory = { ...history, [today]: newsWithLanguage }

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

  const hideBanner = () => {
    setIsBannerHidden(true);
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-4">
          <h1 className="text-xl md:text-2xl font-bold">Learning English from News</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setShowPreferences(!showPreferences)} aria-label={showPreferences ? "Hide Preferences" : "Edit Preferences"}>
              {showPreferences ? <X className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
            </Button>
            <ModeToggle />
          </div>
        </header>

        {showBanner && !isBannerHidden && (
          <div 
            ref={bannerRef}
            className={`mb-4 p-4 border rounded-lg shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-2 transition-all duration-300 ${
              isSticky 
                ? "fixed top-0 left-0 right-0 z-50 max-w-6xl mx-auto rounded-none border-t-0 bg-background" 
                : "bg-muted/50"
            }`}
          >
            <div>
              <h3 className="font-medium mb-1">📚 Enhance Your Learning</h3>
              <p className="text-sm text-muted-foreground">Look up words, get examples, and improve your vocabulary with AI-Powered Dictionary.</p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
              <Button asChild variant="default" className="flex-grow md:flex-grow-0 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md hover:shadow-lg transition-all">
                <a href="https://english-dictionary.app" target="_blank">Try It Now</a>
              </Button>
              <Button variant="ghost" size="icon" onClick={hideBanner} className="ml-1">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        
        {/* Add a spacer div when sticky and not hidden to prevent layout shift */}
        {isSticky && !isBannerHidden && <div className="mb-4 p-4 opacity-0">Spacer</div>}

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
              {/* <AccentSelector value={accent} onChange={setAccent} /> */}

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
                {/* Make TabsList horizontally scrollable on overflow */}
                <div className="overflow-x-auto max-w-full scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-muted-foreground/30 -mx-2 px-2">
                  <TabsList
                    className="mb-4 flex-nowrap w-max"
                    style={{
                      display: 'flex',
                      width: 'max-content',
                    }}
                  >
                    <TabsTrigger value="today" className="whitespace-nowrap flex-shrink-0">Today</TabsTrigger>
                    {getHistoryDates()
                      .filter((date) => date !== getTodayString())
                      .map((date) => (
                        <TabsTrigger key={date} value={date} className="whitespace-nowrap flex-shrink-0">
                          {new Date(date).toLocaleDateString()}
                        </TabsTrigger>
                      ))}
                  </TabsList>
                </div>

                <TabsContent value="today">
                  {loading ? (
                    <div className="flex justify-center items-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="ml-2">Fetching latest news...</span>
                    </div>
                  ) : (
                    <>
                      {newsData.length > 0 ? (
                        <NewsFeed news={newsData} accent={accent} nativeLanguage={newsData[0].nativeLanguage??nativeLanguage} />
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
                    <NewsFeed news={history[date] || []} accent={accent} isHistory nativeLanguage={history[date][0].nativeLanguage??nativeLanguage} />
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
