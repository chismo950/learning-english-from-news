import { GoogleGenAI } from '@google/genai'
import { NextRequest } from 'next/server'
import { Redis } from '@upstash/redis'

// Initialize Redis client
const redis = new Redis({ url: process.env.KV_REST_API_URL || '', token: process.env.KV_REST_API_TOKEN || '' })

// Fisher–Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Create a cache key in the format audio_accent_text
function createCacheKey(text: string, accent: string): string {
  return `audio_${accent}_${text}`;
}

// Cache duration
const CACHE_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

// Function to get cached audio using Redis
async function getCachedAudio(text: string, accent: string) {
  // Create cache key
  const cacheKey = createCacheKey(text, accent);
  
  // Try to get from Redis cache first
  const cachedAudio = await redis.get(cacheKey);
  
  if (cachedAudio) {
    console.log('Cache hit, returning cached audio for:', text);
    
    try {
      // Handle different return types from Redis client
      if (typeof cachedAudio === 'string') {
        return JSON.parse(cachedAudio);
      } else {
        // If it's already an object, return it directly
        return cachedAudio;
      }
    } catch (error) {
      console.error('Error parsing cached audio, fetching fresh data:', error);
      // Continue to fetch from AI if parsing fails
    }
  }
  
  console.log('Cache miss, fetching from Gemini API:', text);
  return null;
}

// Function to cache audio data
async function cacheAudio(text: string, accent: string, wavBuffer: Buffer) {
  const cacheKey = createCacheKey(text, accent);
  const base64Audio = wavBuffer.toString('base64');
  
  const audioData = {
    base64Audio,
    contentType: 'audio/wav'
  };
  
  // Store in Redis with 7 day expiration
  await redis.set(cacheKey, JSON.stringify(audioData), { ex: CACHE_DURATION });
  console.log('Audio cached for:', text);
}

// Function to attempt API call with all keys
async function attemptAPICall(text: string, accent: string, keys: string[]) {
  const shuffledKeys = shuffleArray(keys);
  let response;
  let lastError: unknown;
  
  // Try each key until one succeeds
  let ttsText = 'Read the following text: ' + text;
  switch (accent) {
    case 'American':
      ttsText = 'Read the following text in an American accent: ' + text;
      break;
    case 'British':
      ttsText = 'Read the following text in a British accent: ' + text;
      break;
    case 'Australian':
      ttsText = 'Read the following text in an Australian accent: ' + text;
      break;
    case 'Indian':
      ttsText = 'Read the following text in an extremely strong Indian accent with a extremely fast tempo: ' + text;
      break;
    default:
      ttsText = 'Read the following text in an American accent: ' + text;
  }

  for (const key of shuffledKeys) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: ttsText }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
        },
      });
      // success: break out
      lastError = null;
      break;
    } catch (err: unknown) {
      lastError = err;
      // try next key
    }
  }
  
  if (!response) {
    throw lastError;
  }
  
  return response;
}

// 强制动态，确保不走静态缓存
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const text = request.nextUrl.searchParams.get('text') || '';
  // Parse optional parameters
  const accent = request.nextUrl.searchParams.get('accent') || 'American';
  const output = request.nextUrl.searchParams.get('output') || 'wav'; // 'wav' or 'base64'
  
  // Wrap entire processing in try/catch to handle API errors
  try {
    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check cache first
    const cachedAudio = await getCachedAudio(text, accent);
    let wavBuffer: Buffer;

    if (cachedAudio) {
      // Use cached audio
      wavBuffer = Buffer.from(cachedAudio.base64Audio, 'base64');
    } else {
      // Load and shuffle API keys
      const rawKeys = process.env.GOOGLE_GENERATIVE_AI_API_KEYS || '[]';
      let keys: string[];
      try {
        keys = JSON.parse(rawKeys);
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid GOOGLE_GEMINI_API_KEYS JSON' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!Array.isArray(keys) || keys.length === 0) {
        return new Response(JSON.stringify({ error: 'No API keys configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      let response;
      let base64Data = '';
      const maxRetries = 10;

      // Retry up to 10 times, cycling through all available keys
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          response = await attemptAPICall(text, accent, keys);
          base64Data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
          
          if (base64Data) {
            break; // Success, exit retry loop
          }
          
          console.log(`Attempt ${attempt + 1}: No audio data generated, trying different API keys...`);
        } catch (err: unknown) {
          console.log(`Attempt ${attempt + 1}: API call failed, retrying...`);
          // Continue to next attempt instead of returning error immediately
        }
      }

      console.log('response.candidates?.[0]?.content', response?.candidates?.[0]?.content);
      if (!base64Data) {
        console.log('response', response)
        console.log('response?.usageMetadata?.promptTokensDetails?.[0]', response?.usageMetadata?.promptTokensDetails?.[0])
        return new Response(JSON.stringify({ error: 'No audio data generated after trying all API keys 3 times' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      const fullBuffer = Buffer.from(base64Data, 'base64');
      // If buffer already contains a WAV header, use directly; otherwise wrap PCM manually
      const prefix = fullBuffer.slice(0, 4).toString();
      if (prefix === 'RIFF') {
        wavBuffer = fullBuffer;
      } else {
        const numChannels = 1;
        const sampleRate = 24000;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        // Create WAV header
        const header = Buffer.alloc(44);
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + fullBuffer.length, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(numChannels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(bitsPerSample, 34);
        header.write('data', 36);
        header.writeUInt32LE(fullBuffer.length, 40);
        wavBuffer = Buffer.concat([header, fullBuffer]);
      }

      // Cache the generated audio
      await cacheAudio(text, accent, wavBuffer);
    }

    // If JSON/base64 output requested, return base64 string
    if (output === 'base64') {
      // Return the properly formatted WAV buffer as base64, not the raw audio data
      const wavBase64 = wavBuffer.toString('base64');
      return new Response(JSON.stringify({ audio: wavBase64 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const total = wavBuffer.length;
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      // parse bytes= start-end
      const matches = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      const start = parseInt(matches?.[1] || '0', 10);
      const end = matches?.[2] ? Math.min(parseInt(matches[2], 10), total - 1) : total - 1;
      const chunk = wavBuffer.slice(start, end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          'Content-Type': 'audio/wav',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Content-Length': chunk.length.toString(),
          'Content-Disposition': 'inline; filename="tts.wav"',
        },
      });
    }
    // no range header, return full content
    return new Response(wavBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Accept-Ranges': 'bytes',
        'Content-Length': total.toString(),
        'Content-Disposition': 'inline; filename="tts.wav"',
      },
    });
  } catch (error: unknown) {
    // Return error details to client
    const statusCode = (error && typeof error === 'object' && 'statusCode' in error) ? (error as { statusCode: number }).statusCode : 500;
    const message = (error && typeof error === 'object' && 'message' in error) ? (error as { message: string }).message : 'Internal Server Error';
    const details = (error && typeof error === 'object' && 'error' in error) ? (error as { error: unknown }).error : null;
    return new Response(JSON.stringify({ error: message, details }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function HEAD(request: NextRequest) {
  // respond with only headers for content info
  const { GET } = await import('./route');
  // invoke GET to get headers, then strip body
  const res = await GET(request);
  return new Response(null, {
    status: res.status,
    headers: res.headers,
  });
}