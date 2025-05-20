import { unstable_cache } from 'next/cache'
import { GoogleGenerativeAI } from "@google/generative-ai"
import { Redis } from '@upstash/redis'
// Initialize Redis client
const redis = new Redis({ url: process.env.KV_REST_API_URL || '', token: process.env.KV_REST_API_TOKEN || '' })

// Helper to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array]
  for (let i = newArray.length - 1; i > 0; i--) {
    const j: number = Math.floor(Math.random() * (i + 1))
    const temp = newArray[i]
    newArray[i] = newArray[j]
    newArray[j] = temp
  }
  return newArray
}

// Fetch English news, check Redis, fallback to AI, and store in Redis
async function fetchEnglishNews(region: string, todayStr: string, level: string) {
  // include level in Redis key and compute yesterday's date
  const redisKey = `news_english_${level}_${region}_${todayStr}`
  const date = new Date(todayStr)
  const yesterday = new Date(date)
  yesterday.setDate(date.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split("T")[0]

  const cached = await redis.get(redisKey)
  if (typeof cached === 'string') {
    return JSON.parse(cached)
  }

  let apiKeys: string[] = []
  try {
    apiKeys = JSON.parse(process.env.GOOGLE_GENERATIVE_AI_API_KEYS || '[]')
    if (!Array.isArray(apiKeys) || apiKeys.length === 0) throw new Error('No valid API keys')
  } catch {
    throw new Error('API configuration error')
  }
  const shuffledKeys = shuffleArray(apiKeys)
  let allNews: any[] = []
  let lastError: any

  for (const key of shuffledKeys) {
    try {
      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        tools: [{
          // @ts-ignore
          google_search: {},
        }],
      })
      // Determine instruction based on level
      const levelInstruction = level === 'intermediate'
        ? 'As this is for intermediate English learners, use vocabulary within the range of Wordly Wise 3000. Avoid complex or uncommon words.'
        : 'As this is for advanced English learners, feel free to use complex and varied vocabulary.';
      const prompt = `Find the 5 latest English news articles from ${region === "international" ? "international news" : region} published on ${todayStr} or ${yesterdayStr}.

For each article:
1. Break down the article into 3-5 key sentences.

IMPORTANT REQUIREMENTS:
- If the news is related to China, ONLY cite Chinese media sources with domains ending in .cn
- If the news is not related to China, you can cite any media source worldwide.
- DO NOT include any news that mentions Chinese leadership by name.
- DO NOT include any politically sensitive news related to China.
- DO NOT include any news related to Taiwan.
- ONLY include positive, uplifting or neutral news stories. DO NOT include negative news like disasters, accidents, crimes, conflicts, or other distressing events.
- ONLY include news published on ${todayStr} or ${yesterdayStr}. DO NOT include any older news articles.
- ${levelInstruction}

Format your response as a JSON array with this structure:
[  {
    "title": "Article title",
    "sentences": ["Key sentence"],
    "source": "Source name",
    "sourceUrl": "URL to the article",
    "publishedDate": "Publication date and time"
  }
]

Return ONLY the JSON array, with no additional text, markdown, or formatting.`
      const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] })
      let text = result.response.text().trim()
      if (text.includes('```')) {
        text = text.replace(/```\w*\s*/, '').replace(/\s*```$/, '')
      }
      allNews = JSON.parse(text)
      break
    } catch (e) {
      lastError = e
    }
  }
  if (allNews.length === 0 && lastError) console.error('Failed to fetch English news:', lastError)
  await redis.set(redisKey, JSON.stringify(allNews), { ex: 60 * 60 * 24 })
  return allNews
}

// Replace incorrect unstable_cache usage with function wrapper
// Wrap fetching in unstable_cache for 24h, keyed by date
function getCachedEnglishNews(region: string, todayStr: string, level: string) {
  const cacheKey = ['news_english', level, region, todayStr]
  const cachedFetch = unstable_cache(
    async () => fetchEnglishNews(region, todayStr, level),
    cacheKey,
    { revalidate: 60 * 60 * 24 }
  )
  return cachedFetch()
}

// GET handler for English news
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const region = searchParams.get('region')
  const level = searchParams.get('level')
  if (!region || !level) {
    return Response.json({ error: 'Region and level are required' }, { status: 400 })
  }
  const todayStr = new Date().toISOString().split('T')[0]
  try {
    const news = await getCachedEnglishNews(region, todayStr, level)
    return Response.json(news)
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : 'Failed to fetch English news'
    return Response.json({ error: message }, { status: 500 })
  }
}