"use client"

import { useEffect, useState, useRef } from "react"
import { ModeToggle } from "@/components/mode-toggle"
import LanguageSelector from "@/components/language-selector"
import RegionSelector from "@/components/region-selector"
import NewsFeed from "@/components/news-feed"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Settings, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { detectAppleSiliconMac, isInAppWebview, isIOSorIPad } from "@/lib/utils"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

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
  const [level, setLevel] = useState("intermediate")
  const [newsData, setNewsData] = useState<NewsItem[]>([])
  const [history, setHistory] = useState<NewsHistory>({})
  const [currentTab, setCurrentTab] = useState("today")
  const [validationError, setValidationError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [hasTodayData, setHasTodayData] = useState(false)
  const [isSticky, setIsSticky] = useState(false)
  const [isBannerHidden, setIsBannerHidden] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [loadingPercentage, setLoadingPercentage] = useState(0);
  const [displayPercentage, setDisplayPercentage] = useState(0);
  const targetPercentageRef = useRef(5); // Start at 5% to show immediate progress
  const bannerRef = useRef<HTMLDivElement>(null)
  const prefetchedAudioKeys = useRef<Set<string>>(new Set())

  // Get today's date in YYYY-MM-DD format
  const getTodayString = () => {
    return new Date().toISOString().split("T")[0]
  }

  useEffect(() => {
    // Load preferences from localStorage
    const storedLanguage = localStorage.getItem("nativeLanguage")
    const storedRegions = localStorage.getItem("selectedRegions")
    const storedLevel = localStorage.getItem("level")
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

    if (storedLevel) setLevel(storedLevel)

    // Check if we have today's data
    const today = getTodayString()
    const hasTodaysData = parsedHistory && parsedHistory[today] && parsedHistory[today].length > 0
    setHasTodayData(!!hasTodaysData)

    // If we have today's data, load it
    if (hasTodaysData) {
      setNewsData(parsedHistory[today])
      // Also prefetch audio for existing news data
      prefetchAudioForNews(parsedHistory[today])
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

    // If preferences exist and we don't have today's data, show preferences
    // Otherwise, hide preferences and show news
    if (storedLanguage && storedRegions && hasTodaysData) {
      setShowPreferences(false)
    } else {
      setShowPreferences(true)
    }

    (async () => {
      const isAppleSiliconMac = await detectAppleSiliconMac() === true
      console.log('isAppleSiliconMac', isAppleSiliconMac)
      setShowBanner(
        !isInAppWebview()
        && (
          isIOSorIPad()
          || isAppleSiliconMac
        )
      )
    })();

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

  // Function to prefetch audio for all sentences
  const prefetchAudioForNews = async (newsItems: NewsItem[]) => {
    // Read the user's selected accent from localStorage (set in `components/news-feed.tsx`)
    const getSelectedAccent = (): "American" | "British" | "Indian" => {
      try {
        if (typeof window !== "undefined") {
          const stored = window.localStorage.getItem("preferredAccent")
          if (stored === "American" || stored === "British" || stored === "Indian") {
            return stored
          }
        }
      } catch (_) { }
      return "American"
    }

    const selectedAccent = getSelectedAccent()

    for (const item of newsItems) {
      for (const sentence of item.sentences) {
        const cacheKey = `${sentence.english}_${selectedAccent}`

        // Skip if already prefetched for this accent
        if (prefetchedAudioKeys.current.has(cacheKey)) {
          console.log(`Skipping already prefetched audio for "${sentence.english}" in ${selectedAccent} accent`)
          continue
        }

        let retryCount = 0
        const maxRetries = 2

        const prefetchAudio = async (): Promise<void> => {
          try {
            const response = await fetch(`/api/tts/gemini?prefetch=true&text=${encodeURIComponent(sentence.english)}&accent=${encodeURIComponent(selectedAccent)}`, {
              method: "GET"
            })

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`)
            }

            // For prefetch requests, just get the JSON response (no audio content)
            const result = await response.json()
            console.log(`Prefetched audio for "${sentence.english}" in ${selectedAccent} accent:`, result)

            // Mark as prefetched
            prefetchedAudioKeys.current.add(cacheKey)
          } catch (error) {
            console.error(`Failed to prefetch audio for "${sentence.english}" (${selectedAccent}):`, error)

            if (retryCount < maxRetries) {
              retryCount++
              console.log(`Retrying prefetch (${retryCount}/${maxRetries}) for "${sentence.english}" (${selectedAccent})`)
              await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second before retry
              await prefetchAudio()
            } else {
              console.error(`Failed to prefetch audio after ${maxRetries} retries for "${sentence.english}" (${selectedAccent})`)
            }
          }
        }

        await prefetchAudio()
        // Wait 5 seconds between each prefetch request to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }

  const fetchNews = async () => {
    if (!initialized) return

    // Validate language and regions before fetching
    if (!nativeLanguage) {
      setValidationError("Please select your native language")
      setShowPreferences(true)
      return
    }

    if (selectedRegions.length === 0) {
      setValidationError("Please select at least one region")
      setShowPreferences(true)
      return
    }

    setValidationError(null)
    setFetchError(null)
    setLoading(true)

    try {
      const requestBody = JSON.stringify({
        language: nativeLanguage,
        regions: selectedRegions,
        level,
      })

      let newsResult = null
      let apiSource = ""

      // First, try OpenAI API
      try {
        console.log("Trying OpenAI API first...")
        const openaiResponse = await fetch("/api/news/openai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: requestBody,
        })

        if (!openaiResponse.ok) {
          throw new Error("OpenAI API request failed")
        }

        const openaiData = await openaiResponse.json()
        if (!openaiData.news || openaiData.news.length === 0) {
          throw new Error("OpenAI API returned empty news")
        }

        newsResult = openaiData.news
        apiSource = "OpenAI"
        console.log("OpenAI API succeeded")
      } catch (openaiError) {
        console.log("OpenAI API failed, trying Gemini API...", openaiError)

        // If OpenAI fails, try Gemini API
        try {
          const geminiResponse = await fetch("/api/news", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: requestBody,
          })

          if (!geminiResponse.ok) {
            throw new Error("Gemini API request failed")
          }

          const geminiData = await geminiResponse.json()
          if (!geminiData.news || geminiData.news.length === 0) {
            throw new Error("Gemini API returned empty news")
          }

          newsResult = geminiData.news
          apiSource = "Gemini"
          console.log("Gemini API succeeded")
        } catch (geminiError) {
          console.log("Both APIs failed:", { openaiError, geminiError })
          throw new Error("Both APIs failed or returned empty data")
        }
      }

      // If we get here, one of the APIs succeeded
      console.log(`News fetched successfully from ${apiSource}`)
      setNewsData(newsResult)
      setFetchError(null) // Clear any previous error

      // Prefetch audio for all sentences
      prefetchAudioForNews(newsResult)

      // Save to history
      const today = getTodayString()
      // Add nativeLanguage only to the first news item
      const newsWithLanguage = [...newsResult];
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
      // If the race failed, it means both APIs failed or there was another error
      setFetchError("Server is busy, please try again")
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

    // Clear validation and fetch errors
    setValidationError(null)
    setFetchError(null)

    // Save preferences
    localStorage.setItem("nativeLanguage", nativeLanguage)
    localStorage.setItem("selectedRegions", JSON.stringify(selectedRegions))
    localStorage.setItem("level", level)

    // Hide preferences panel
    setShowPreferences(false)

    fetchNews();
  }

  const getHistoryDates = () => {
    return Object.keys(history).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  }

  const hideBanner = () => {
    setIsBannerHidden(true);
  };

  // Effect to randomly increase target percentage
  useEffect(() => {
    if (!loading) {
      setDisplayPercentage(0);
      targetPercentageRef.current = 5; // Reset to 5% for next time
      return;
    }

    // Small initial delay before starting percentage
    const initialDelay = setTimeout(() => {
      const interval = setInterval(() => {
        const increment = Math.random() * 2.9 + 0.1; // Random between 0.1% and 2%
        targetPercentageRef.current = Math.min(99.99, targetPercentageRef.current + increment);
      }, 1000);

      return () => clearInterval(interval);
    }, 300);

    return () => clearTimeout(initialDelay);
  }, [loading]);

  // Effect for smooth animation
  useEffect(() => {
    if (!loading) return;

    const step = 0.05; // Increased step size for more visible changes

    const animationInterval = setInterval(() => {
      setDisplayPercentage(prev => {
        if (prev < targetPercentageRef.current) {
          return Math.min(targetPercentageRef.current, prev + step);
        }
        return prev;
      });
    }, 16); // ~60fps

    return () => clearInterval(animationInterval);
  }, [loading]);

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-4">
          <h1 className="hidden md:block text-2xl font-bold">Learning English from the News</h1>
          <h1 className="block md:hidden text-2xl font-bold">English News</h1>
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
            className={`mb-4 p-4 border rounded-lg shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-2 transition-all duration-300 ${isSticky
              ? "fixed top-0 left-0 right-0 z-50 max-w-6xl mx-auto rounded-none border-t-0 bg-background"
              : "bg-muted/50"
              }`}
          >
            <div>
              <h3 className="font-medium mb-1">📱 Download Our App</h3>
              <p className="text-sm text-muted-foreground">Learn English from the news anytime, anywhere.</p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
              <Button asChild variant="default" className="flex-grow md:flex-grow-0 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md hover:shadow-lg transition-all">
                <a href="https://apps.apple.com/app/id6744784488" target="_blank">Try It Now</a>
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
              <div className="flex flex-col">
                <label className="block text-base font-medium mb-1">Proficiency Level</label>
                <RadioGroup value={level} onValueChange={setLevel} className="flex space-x-4">
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="intermediate" id="level-intermediate" />
                    <label htmlFor="level-intermediate">🌿 Intermediate</label>
                  </div>
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="advanced" id="level-advanced" />
                    <label htmlFor="level-advanced">🌳 Advanced</label>
                  </div>
                </RadioGroup>
              </div>

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
                    <div>
                      <div className="flex justify-center items-center mt-32">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <span className="ml-2">Fetching latest news...</span>
                      </div>
                      <div className="text-center">{displayPercentage.toFixed(2)}%</div>
                    </div>
                  ) : (
                    <>
                      {fetchError && (
                        <Alert variant="destructive" className="mb-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{fetchError}</AlertDescription>
                        </Alert>
                      )}
                      {newsData.length > 0 ? (
                        <NewsFeed
                          news={newsData}
                          accent={accent}
                          nativeLanguage={newsData[0].nativeLanguage ?? nativeLanguage}
                          date={getTodayString()}
                        />
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
                    <NewsFeed
                      news={history[date] || []}
                      accent={accent}
                      isHistory
                      nativeLanguage={history?.[date]?.[0]?.nativeLanguage ?? nativeLanguage}
                      date={date}
                    />
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
