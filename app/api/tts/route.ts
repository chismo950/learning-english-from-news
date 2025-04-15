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
    const externalUrl = `https://tts.english-dictionary.app/api/tts?speaker_id=${speakerId}&text=${encodedText}`;
    
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

export async function GET(request: NextRequest) {
  // Get the text and speaker_id params from the URL
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text');
  const speakerId = searchParams.get('speaker_id') || 'p364'; // Default to p364 if not provided
  const format = searchParams.get('format') || 'audio'; // 'audio' or 'base64'
  
  if (!text) {
    return NextResponse.json(
      { error: 'Missing required parameter: text' },
      { status: 400 }
    );
  }
  
  try {
    // Create cache key
    const cacheKey = createCacheKey(text, speakerId);
    
    // Get cached or fetch new audio
    const { base64Audio, contentType } = await getCachedAudio(cacheKey, text, speakerId);
    
    // Return based on requested format
    if (format === 'base64') {
      // Return base64 string directly (useful for client-side audio playback)
      return NextResponse.json({
        audio: base64Audio,
        contentType
      }, {
        headers: {
          'Cache-Control': 'public, max-age=86400',
        },
      });
    } else {
      // Convert back to buffer and return as audio file
      const buffer = Buffer.from(base64Audio, 'base64');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
  } catch (error) {
    console.error('Error generating TTS:', error);
    return NextResponse.json(
      { error: 'Failed to generate speech' },
      { status: 500 }
    );
  }
}