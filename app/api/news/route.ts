import { GoogleGenerativeAI } from "@google/generative-ai"

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

      try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
        const genModel = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
          // generationConfig,
          // systemInstruction,
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
        } catch (jsonError) {
          console.error(`Error parsing JSON for ${region}:`, jsonError)
          console.error("Raw response:", text)
          console.error("Processed JSON text:", jsonText)
        }
      } catch (error) {
        console.error(`Error fetching news for ${region}:`, error)
        // Continue with other regions even if one fails
      }
    }

    return Response.json({ news: allNews })
  } catch (error) {
    console.error("Error processing request:", error)
    return Response.json({ error: "Failed to process request" }, { status: 500 })
  }
}
