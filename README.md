# Learning English from News

## Team
- Lisen Huang

## Quick Start
1. Copy the example environment variables: `cp .env.local.example .env.local`, then add your own API keys.
2. Install dependencies: `npm install`.
3. Run the development server: `npm run dev`.

This project is continuously deployed to Vercel at https://news.english-dictionary.app, so you can preview the latest build without any setup.

## Project Overview
Learning English from News is an agentic AI news tutor. It curates upbeat, recent articles from different regions, rewrites them into bite-sized study material, and translates each sentence into the learner's preferred language. The agent automates the entire flow—prompting the model, validating JSON output, caching responses, and serving tailored lessons—so learners always receive relevant, curriculum-friendly content. That end-to-end autonomy is what grounds the project in the Agentic AI theme.

## Intro Video
[Watch the project walkthrough](./video.mp4)

## Kong API Usage
- The news generation logic lives in `app/api/news/openai/route.ts`. It calls the Kong-hosted OpenAI proxy at `https://kong-5b384bb73cauxw7mq.kongcloud.dev/openai/chat` so every request benefits from Kong's gateway features (auth, traffic shaping, observability).
- The endpoint accepts a JSON payload with `language`, `regions`, `level`, and optional `skipCache`. It returns curated articles with translations.

Example invocation inside the route:

```ts
const res = await fetch("https://kong-5b384bb73cauxw7mq.kongcloud.dev/openai/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: "gpt-4.1",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  }),
});
```

The same payload works against the Vercel deployment by swapping the base URL with https://news.english-dictionary.app.
