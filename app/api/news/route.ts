import { GoogleGenerativeAI } from "@google/generative-ai"
import { unstable_cache } from 'next/cache'
import { Redis } from '@upstash/redis'

// Initialize Redis client
const redis = new Redis({ url: process.env.KV_REST_API_URL || '', token: process.env.KV_REST_API_TOKEN || '' })

// Helper function to generate consistent Redis key
function generateRedisKey(language: string, regions: string[], todayStr: string, level: string): string {
  const sortedRegions = [...regions].sort().join('_');
  return `news_${todayStr}_${language}_${sortedRegions}_${level}`;
}

// Helper function to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array]
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[newArray[i], newArray[j]] = [newArray[j], newArray[i]]
  }
  return newArray
}

// Define data shapes
interface Sentence { english: string; translated: string }
interface Article {
  title: string
  titleTranslated: string
  region: string
  sentences: Sentence[]
  source: string
  sourceUrl: string
  publishedDate: string
}

// Function to fetch news that will be cached
async function fetchNewsForRegions(
  language: string, regions: string[], todayStr: string, level: string
): Promise<Article[]> {
  // Check Redis cache first
  const redisKey = generateRedisKey(language, regions, todayStr, level);
  const cachedNews = await redis.get<Article[]>(redisKey);
  
  if (cachedNews) {
    console.log(`Cache hit for ${redisKey}`);
    return cachedNews;
  }
  
  console.log(`Cache miss for ${redisKey}, fetching from AI...`);
  
  // Parse API keys from environment variable
  let apiKeys: string[] = []
  try {
    apiKeys = JSON.parse(process.env.GOOGLE_GENERATIVE_AI_API_KEYS || '[]')
    if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
      throw new Error('No valid API keys found')
    }
  } catch (error) {
    console.error('Error parsing API keys:', error)
    throw new Error("API configuration error")
  }

  // Shuffle API keys for load balancing
  const shuffledApiKeys = shuffleArray(apiKeys)

  // Collect news for all selected regions
  const allNews: Article[] = []

  for (const region of regions) {
    // Calculate yesterday's date based on todayStr
    const today = new Date(todayStr);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const prompt = `
Find the 5 latest news articles from ${region === "international" ? "international news" : region}.

For each article:
1. Break down the article into 3-5 key sentences.
2. For each sentence, provide:
   - A translation in ${language} language

IMPORTANT REQUIREMENTS:
- If the news is related to China, ONLY cite Chinese media sources with domains ending in .cn
- If the news is not related to China, you can cite any media source worldwide.
- DO NOT include any news that mentions Chinese leadership by name.
- DO NOT provide any politically sensitive news related to China.
- ONLY include positive, uplifting or neutral news stories. DO NOT include negative news like disasters, accidents, crimes, conflicts, or other distressing events.
- ONLY include news published on ${todayStr} or ${yesterdayStr}. DO NOT include any older news articles.
- REMOVE ALL citation markers, reference numbers, and footnotes (like [1], [2, 6], etc.) from English sentences. Do not include any square brackets with numbers.
${level === 'intermediate' ? '- As this is for intermediate English learners, use vocabulary within the range of Wordly Wise 3000. Avoid complex or uncommon words outside this range.' : ''}

Format your response as a JSON array with this structure:
[
  {
    "title": "Article title",
    "titleTranslated": "Translated title",
    "region": "${region}",
    "sentences": [
      {
        "english": "English sentence",
        "translated": "Translated sentence"
      }
    ],
    "source": "Source name",
    "sourceUrl": "URL to the article",
    "publishedDate": "Publication date and time"
  }
]

Return ONLY the JSON with no additional text, no markdown formatting, and no code blocks.
`

    let succeeded = false
    let lastError = null
    
    // Try each API key until successful
    for (const apiKey of shuffledApiKeys) {
      if (succeeded) break
      
      try {
        const genAI = new GoogleGenerativeAI(apiKey)
        const genModel = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          tools: [
            {
              // @ts-ignore
              google_search: {},
            },
          ],
        })
        
        const result = await genModel.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        })
        
        const response = result.response
        const text = response.text()
        let jsonText = text

        // Remove markdown code block formatting if present
        if (jsonText.includes("```json")) {
          jsonText = jsonText.replace(/```json\s*/, "").replace(/\s*```\s*$/, "")
        } else if (jsonText.includes("```")) {
          jsonText = jsonText.replace(/```\s*/, "").replace(/\s*```\s*$/, "")
        }

        // Trim any extra whitespace
        jsonText = jsonText.trim()

        // Parse the JSON response
        try {
          const regionNews = JSON.parse(jsonText)
          allNews.push(...regionNews)
          succeeded = true
          console.log(`Successfully fetched news for ${region} with API key: ${apiKey.substring(0, 10)}...`)
        } catch (jsonError) {
          console.error(`Error parsing JSON for ${region}:`, jsonError)
          console.error("Raw response:", text)
          console.error("Processed JSON text:", jsonText)
          lastError = jsonError
        }
      } catch (error) {
        console.error(`Error using API key ${apiKey.substring(0, 10)}... for ${region}:`, error)
        lastError = error
        // Continue to the next API key
      }
    }

    if (!succeeded) {
      console.error(`Failed to fetch news for ${region} with all API keys. Last error:`, lastError)
    }
  }

  // Cache the result in Redis with 24-hour expiration
  if (allNews.length > 0) {
    await redis.set(redisKey, allNews, { ex: 86400 }); // 24 hours in seconds
    console.log(`Cached news data in Redis with key: ${redisKey}`);
  }

  return allNews
}

// Create a function that returns a cached version of fetchNewsForRegions with specific parameters
function getCachedNews(
  language: string, regions: string[], todayStr: string, level: string
): Promise<Article[]> {
  // Sort regions alphabetically before joining
  const cacheKey = ['news-api-cache', language, regions.sort().join(','), todayStr, level];
  
  // Create a cached function with these specific parameters
  const cachedFetch = unstable_cache(
    async () => {
      return await fetchNewsForRegions(language, regions, todayStr, level);
    },
    cacheKey,
    {
      // Cache for 24 hours
      revalidate: 60 * 60 * 24,
      tags: ['news-data']
    }
  );
  
  // Return the result of the cached function
  return cachedFetch();
}

// Update the POST function to handle markdown-formatted JSON responses
export async function POST(request: Request) {
  try {
    const { language, regions, level } = await request.json()

    if (!language || !regions || regions.length === 0 || !level || (level !== 'intermediate' && level !== 'advanced')) {
      return Response.json({ error: "Language, regions, and valid level are required" }, { status: 400 })
    }

    // Get today's date
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]

    try {
      // Use the cached function including level
      const allNews = await getCachedNews(language, regions, todayStr, level)

      // Remove footnotes from English sentences before sending response
      allNews.forEach(article => {
        article.sentences.forEach(sent => {
          sent.english = sent.english.replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim()
        })
      })

      return Response.json({ news: allNews })
    } catch (error) {
      console.error("Error processing request:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to process request"
      return Response.json({ error: errorMessage }, { status: 500 })
    }
  } catch (error) {
    console.error("Error processing request:", error)
    return Response.json({ error: "Failed to process request" }, { status: 500 })
  }
}
