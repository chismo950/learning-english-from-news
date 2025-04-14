import { GoogleGenerativeAI } from "@google/generative-ai"

// Helper function to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array]
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[newArray[i], newArray[j]] = [newArray[j], newArray[i]]
  }
  return newArray
}

// Update the POST function to handle markdown-formatted JSON responses
export async function POST(request: Request) {
  try {
    const { language, regions } = await request.json()

    if (!language || !regions || regions.length === 0) {
      return Response.json({ error: "Language and regions are required" }, { status: 400 })
    }

    // Get yesterday's date
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split("T")[0]

    // Parse API keys from environment variable
    let apiKeys: string[] = []
    try {
      apiKeys = JSON.parse(process.env.GOOGLE_GENERATIVE_AI_API_KEYS || '[]')
      if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
        throw new Error('No valid API keys found')
      }
    } catch (error) {
      console.error('Error parsing API keys:', error)
      return Response.json({ error: "API configuration error" }, { status: 500 })
    }

    // Shuffle API keys for load balancing
    const shuffledApiKeys = shuffleArray(apiKeys)

    // Collect news for all selected regions
    const allNews = []

    for (const region of regions) {
      const prompt = `
  Find 5 news articles from ${region === "international" ? "international news" : region} published on ${yesterdayStr} (yesterday).
  
  For each article:
  1. Break down the article into 3-5 key sentences.
  2. For each sentence, provide:
     - The English version (using simple vocabulary from the 3000 most common English words when possible)
     - A translation in ${language} language
  
  IMPORTANT REQUIREMENTS:
  - If the news is related to China, ONLY cite Chinese media sources with domains ending in .cn
  - If the news is not related to China, you can cite any media source worldwide.
  - DO NOT include any news that mentions Chinese leadership by name.
  - DO NOT provide any politically sensitive news related to China.
  - Use simple English vocabulary from the 3000 most common English words when possible.
  
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
  
  Make sure all articles are from ${yesterdayStr} (yesterday).
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
            model: 'gemini-2.0-flash',
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

    return Response.json({ news: allNews })
  } catch (error) {
    console.error("Error processing request:", error)
    return Response.json({ error: "Failed to process request" }, { status: 500 })
  }
}
