```bash
pnpm install && pnpm dev
```

prompts
```typescript
const prompt = `
Find the 5 latest news articles from ${region === "international" ? "international news" : region}.

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

Return ONLY the JSON with no additional text, no markdown formatting, and no code blocks.
`
```