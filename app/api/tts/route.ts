import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import crypto from 'crypto';

// Create a hash of the text to use as cache key
function createCacheKey(text: string, speakerId: string): string {
  const hash = crypto.createHash('md5');
  hash.update(`${speakerId}-${text}`);
  return hash.digest('hex');
}

// Cache duration
const CACHE_DURATION = 24 * 60 * 60; // 24 hours in seconds

// Function to get cached audio using unstable_cache
const getCachedAudio = unstable_cache(
  async (key: string, text: string, speakerId: string) => {
    console.log('Cache miss, fetching from external API:', text);
    
    // Fetch from the external API
    const encodedText = encodeURIComponent(text);
    // const externalUrl = `https://tts.english-dictionary.app/api/tts?speaker_id=p364&text=${encodedText}`;
    const externalUrl = `http://159.138.55.87:5003/api/tts?text=${encodedText}`;
    console.log('External URL:', externalUrl);
    
    const response = await fetch(externalUrl);
    
    if (!response.ok) {
      throw new Error(`External API returned ${response.status}`);
    }
    
    const audioBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(audioBuffer);
    
    // Convert to base64 for caching
    const base64Audio = buffer.toString('base64');
    
    return {
      base64Audio,
      contentType: 'audio/wav'
    };
  },
  ['tts-cache'],
  { revalidate: CACHE_DURATION }
);

// Only accept POST requests for TTS
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = body.text;
    const speakerId = body.speaker_id || 'p364'; // Default to p364 if not provided
    if (!text) {
      return NextResponse.json(
        { error: 'Missing required parameter: text' },
        { status: 400 }
      );
    }
    // Create cache key
    const cacheKey = createCacheKey(text, speakerId);
    // Get cached or fetch new audio (still base64 in cache)
    const { base64Audio, contentType } = await getCachedAudio(cacheKey, text, speakerId);
    // Convert back to buffer and return as audio file
    const buffer = Buffer.from(base64Audio, 'base64');
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Accept-Ranges': 'none', // 禁止分片请求，防止 content-range 自动添加
      },
    });
  } catch (error) {
    console.error('Error generating TTS:', error);
    return NextResponse.json(
      { error: 'Failed to generate speech' },
      { status: 500 }
    );
  }
}