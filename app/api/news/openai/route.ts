/**
 * You're eligible for free daily usage on traffic shared with OpenAI.
 * Up to 250 thousand tokens per day across gpt-4.5-preview, gpt-4.1, gpt-4o, o1 and o3
 * Up to 2.5 million tokens per day across gpt-4.1-mini, gpt-4.1-nano, gpt-4o-mini, o1-mini, o3-mini, o4-mini, and codex-mini-latest
 * curl -X POST http://localhost:6397/api/news/openai -H "Content-Type: application/json" -d '{"language": "Chinese", "regions": ["international"], "level": "advanced", "skipCache": true}'
 */

import OpenAI from 'openai'
import { unstable_cache } from 'next/cache'
import { Redis } from '@upstash/redis'

// Initialize Redis client
const redis = new Redis({ url: process.env.KV_REST_API_URL || '', token: process.env.KV_REST_API_TOKEN || '' })

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

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
  language: string, regions: string[], todayStr: string, level: string, skipCache: boolean = false
): Promise<Article[]> {
  // Generate Redis key for both cache check and cache set
  const redisKey = generateRedisKey(language, regions, todayStr, level);
  
  // Check Redis cache first (unless skipCache is true)
  if (!skipCache) {
    const cachedNews = await redis.get<Article[]>(redisKey);
    
    if (cachedNews) {
      console.log(`Cache hit for ${redisKey}`);
      return cachedNews;
    }
  }
  
  console.log(`${skipCache ? 'Skipping cache,' : 'Cache miss for ' + redisKey + ','} fetching from AI...`);
  
  // Collect news for all selected regions
  const allNews: Article[] = []

  for (const region of regions) {
    // Calculate yesterday's date based on todayStr
    const today = new Date(todayStr);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const prompt = `
You are a news aggregator API. You MUST return valid JSON data only.

Find the 5 latest news articles from ${region === "international" ? "international news" : region}.

For each article:
1. Break down the article into 3-5 key sentences.
2. For each sentence, provide:
   - A translation in ${language} language

CRITICAL INSTRUCTIONS:
- You MUST return ONLY valid JSON in the exact format specified below
- Do NOT include any explanatory text, apologies, or markdown formatting
- If you cannot find news, return an empty array: []

CONTENT REQUIREMENTS:
- If the news is related to China, ONLY cite Chinese media sources with domains ending in .cn
- If the news is not related to China, you can cite any media source worldwide.
- DO NOT include any news that mentions Chinese leadership by name.
- DO NOT provide any politically sensitive news related to China.
- ONLY include positive, uplifting or neutral news stories. DO NOT include negative news like disasters, accidents, crimes, conflicts, or other distressing events.
- ONLY include news published on ${todayStr} or ${yesterdayStr}. DO NOT include any older news articles.
- REMOVE ALL citation markers, reference numbers, and footnotes (like [1], [2, 6], etc.) from English sentences. Do not include any square brackets with numbers.
${level === 'intermediate' ? '- As this is for intermediate English learners, use vocabulary within the range of Wordly Wise 3000. Avoid complex or uncommon words outside this range.' : ''}

REQUIRED JSON FORMAT:
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

RETURN ONLY THE JSON ARRAY ABOVE. NO OTHER TEXT.
`

    try {
      const res = await openai.responses.create({
        /**
         * gpt-4o: 22s
         * gpt-4.5-preview: 36s
         * gpt-4.1: 14s
         */
        model: 'gpt-4.1',
        input: prompt,
        stream: false,
      })
      
      // 提取响应内容
      const response = res.output?.[0]
      let responseText = ''
      
      if (response && 'content' in response) {
        responseText = response.content
          ?.map((c: any) => ('text' in c ? c.text : ''))
          .join('\n') || ''
      } else if (response && 'text' in response) {
        responseText = (response as any).text || ''
      }
        
      if (!responseText) {
        throw new Error('No response from OpenAI')
      }
      
      let jsonText = responseText

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
        console.log(`Successfully fetched news for ${region}`)
      } catch (jsonError) {
        console.error(`Error parsing JSON for ${region}:`, jsonError)
        console.error("Raw response:", responseText)
        console.error("Processed JSON text:", jsonText)
        throw jsonError
      }
    } catch (error) {
      console.error(`Error fetching news for ${region}:`, error)
      throw error
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
  language: string, regions: string[], todayStr: string, level: string, skipCache: boolean = false
): Promise<Article[]> {
  // If skipCache is true, call fetchNewsForRegions directly
  if (skipCache) {
    return fetchNewsForRegions(language, regions, todayStr, level, true);
  }
  
  // Sort regions alphabetically before joining
  const cacheKey = ['news-api-cache', language, regions.sort().join(','), todayStr, level];
  
  // Create a cached function with these specific parameters
  const cachedFetch = unstable_cache(
    async () => {
      return await fetchNewsForRegions(language, regions, todayStr, level, false);
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

// Update the POST function to handle the new parameter
export async function POST(request: Request) {
  try {
    const { language, regions, level, skipCache = false } = await request.json()

    if (!language || !regions || regions.length === 0 || !level || (level !== 'intermediate' && level !== 'advanced')) {
      return Response.json({ error: "Language, regions, and valid level are required" }, { status: 400 })
    }

    // Get today's date
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]

    try {
      // Use the cached function with skipCache parameter
      const allNews = await getCachedNews(language, regions, todayStr, level, skipCache)

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
