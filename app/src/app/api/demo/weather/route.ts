import { NextRequest, NextResponse } from 'next/server';

const FACILITATOR_URL = process.env.SABLE_X402_FACILITATOR_URL || 'http://localhost:5555';
const DEFAULT_ASSET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC devnet
const PRICE = '10000'; // 0.01 USDC (6 decimals)

function getWeatherData(city: string) {
  // Deterministic mock weather based on city name length
  const seed = city.length;
  return {
    city,
    temp: 10 + (seed * 3) % 25,
    wind: 5 + (seed * 2) % 20,
    condition: seed % 2 === 0 ? 'Sunny' : 'Cloudy',
    humidity: 40 + (seed * 5) % 50,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city') || 'Barcelona';
  const receiver = searchParams.get('receiver');
  const xPayment = request.headers.get('x-payment');

  // No payment header → return 402 with requirements
  if (!xPayment) {
    if (!receiver) {
      return NextResponse.json(
        { error: 'Missing receiver query parameter' },
        { status: 400 }
      );
    }

    const requirements = {
      x402Version: 1,
      error: 'X-PAYMENT header is required',
      accepts: [
        {
          scheme: 'exact',
          network: 'solana:devnet',
          maxAmountRequired: PRICE,
          asset: DEFAULT_ASSET,
          payTo: receiver,
          resource: request.url,
          description: 'Sable x402 weather API payment',
          mimeType: 'application/json',
          maxTimeoutSeconds: 60,
        },
      ],
    };

    return NextResponse.json(requirements, { status: 402 });
  }

  // Payment header present → verify and settle via facilitator
  try {
    const settleRes = await fetch(`${FACILITATOR_URL}/verify-and-settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ header: xPayment }),
    });

    const settleResult = await settleRes.json();

    if (!settleResult.settled) {
      return NextResponse.json(
        { error: settleResult.error || 'Settlement failed' },
        { status: 402 }
      );
    }

    const weather = getWeatherData(city);
    return NextResponse.json({
      ...weather,
      settled: true,
      settlementSignature: settleResult.signature,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Verification failed' },
      { status: 500 }
    );
  }
}
