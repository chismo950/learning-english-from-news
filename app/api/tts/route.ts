import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import crypto from 'crypto';
import { Redis } from '@upstash/redis'

// Initialize Redis client
const redis = new Redis({ url: process.env.KV_REST_API_URL || '', token: process.env.KV_REST_API_TOKEN || '' })

// Create a cache key in the format audit_accent_text
function createCacheKey(text: string, accent: string): string {
  return `audio_${accent}_${text}`;
}

// Cache duration
const CACHE_DURATION = 24 * 60 * 60; // 24 hours in seconds

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
      // Continue to fetch from API if parsing fails
    }
  }
  
  console.log('Cache miss, fetching from external API:', text);
  
  // Fetch from the external API
  const encodedText = encodeURIComponent(text);
  let externalUrl;
  
  if (accent === 'en-GB') {
    externalUrl = `http://159.138.55.87:5002/api/tts?speaker_id=p335&text=${encodedText}`; // en-GB
  } else if (accent === 'en-IN') {
    externalUrl = `http://159.138.55.87:5002/api/tts?speaker_id=p345&text=${encodedText}`; // en-IN
  } else {
    externalUrl = `http://159.138.55.87:5003/api/tts?text=${encodedText}`; // en-US (default)
  }
  
  console.log('External URL:', externalUrl);
  
  const response = await fetch(externalUrl);
  
  if (!response.ok) {
    throw new Error(`External API returned ${response.status}`);
  }
  
  const audioBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(audioBuffer);
  
  // Convert to base64 for caching
  const base64Audio = buffer.toString('base64');
  
  const audioData = {
    base64Audio,
    contentType: 'audio/wav'
  };
  
  // Store in Redis with 24 hour expiration
  await redis.set(cacheKey, JSON.stringify(audioData), { ex: CACHE_DURATION });
  
  return audioData;
}

// Only accept POST requests for TTS
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = body.text;
    const accent = body.accent || 'en-US'; // en-US, en-GB, en-IN
    
    if (!text) {
      return NextResponse.json(
        { error: 'Missing required parameter: text' },
        { status: 400 }
      );
    }

    // Get cached or fetch new audio directly from Redis or external API
    const { base64Audio, contentType } = await getCachedAudio(text, accent);
    
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