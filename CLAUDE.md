# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 application that helps users learn English through daily news articles. Users select their native language and regions of interest, and the app provides news articles with bilingual sentences (English + native language) and text-to-speech functionality.

## Development Commands

- `pnpm dev` - Start development server on port 6397
- `pnpm build` - Build the application for production
- `pnpm start` - Start production server on port 6397  
- `pnpm lint` - Run Next.js ESLint checks

## Architecture

### Core Components
- **app/page.tsx** - Main application with preferences management, news fetching, and history functionality
- **components/news-feed.tsx** - Renders news articles with audio playback, study modes (listening, writing, easy), and favorite management
- **components/language-selector.tsx** - Language selection component
- **components/region-selector.tsx** - Region selection component

### API Routes
- **app/api/news/route.ts** - Fetches news using Google Gemini AI with caching (Redis + Next.js unstable_cache)
- **app/api/news/openai/route.ts** - Alternative OpenAI-based news fetching
- **app/api/tts/gemini/route.ts** - Text-to-speech using Google Gemini AI with accent support and Redis caching

### Key Features
- **Multi-language support** - News translated into user's native language
- **Multiple study modes** - Easy (show all), Listening (collapsible), Writing (practice typing)
- **Audio playback** - TTS with American, British, and Indian accents
- **Caching system** - Redis for API responses and audio files
- **History management** - 7-day news history stored in localStorage
- **Audio prefetching** - Background audio generation for faster playback

### Technology Stack
- Next.js 15 with App Router
- React 19
- TypeScript
- Tailwind CSS + shadcn/ui components
- Google Gemini AI (news + TTS)
- OpenAI (fallback for news)
- Upstash Redis for caching
- pnpm package manager

### Environment Variables Required
- `GOOGLE_GENERATIVE_AI_API_KEYS` - JSON array of Gemini API keys
- `KV_REST_API_URL` - Upstash Redis URL
- `KV_REST_API_TOKEN` - Upstash Redis token
- OpenAI keys for fallback functionality

### Data Flow
1. User sets preferences (language, regions, proficiency level)
2. App checks localStorage for today's cached news
3. If no cache, fetches from Gemini API (with OpenAI fallback)
4. News cached in Redis and localStorage
5. Audio prefetching begins in background for selected accent
6. User interacts with news feed (play audio, favorite sentences, study modes)

### Important Notes
- News articles are filtered to exclude politically sensitive content
- Audio caching uses accent-specific keys
- Fallback TTS uses browser's SpeechSynthesis API
- App supports both web and iOS app store promotion