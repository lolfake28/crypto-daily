import axios from "axios";

// Gate.io replaces Binance/Bybit which are blocked by regional ISP filtering
const GATE_BASE = "https://api.gateio.ws/api/v4/spot";

interface GateTicker {
  currency_pair: string;
  last: string;
  high_24h: string;
  low_24h: string;
  change_percentage: string;
  base_volume: string;   // volume in coin
  quote_volume: string;  // volume in USDT
}

// Gate.io kline row: [time, base_vol, close, high, low, open, quote_vol, is_closed]
type GateKline = [string, string, string, string, string, string, string, string];

// --- Indicators ---

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 10) / 10;
}

function calculateEMA(closes: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function findLevels(
  highs: number[],
  lows: number[],
  price: number
): { strongResistance: number; resistance: number; support: number; strongSupport: number } {
  const resistances = highs.filter((h) => h > price).sort((a, b) => a - b);
  const supports    = lows.filter((l) => l < price).sort((a, b) => b - a);

  const resistance       = resistances[0] ?? price * 1.015;
  const strongResistance = resistances[2] ?? resistance * 1.02;
  const support          = supports[0]    ?? price * 0.985;
  const strongSupport    = supports[2]    ?? support * 0.98;

  return { strongResistance, resistance, support, strongSupport };
}

// --- Public types ---

export interface TechnicalData {
  coin: string;
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volumeCoins: number;
  volumeUSD: number;
  rsi: number;
  rsiLabel: "overbought" | "oversold" | "neutral";
  ema20: number;
  ema50: number;
  maTrend: "Bullish" | "Bearish" | "Neutral";
  volumeTrend: "increasing" | "decreasing";
  strongResistance: number;
  resistance: number;
  support: number;
  strongSupport: number;
}

// --- Fetch ---

export async function fetchTechnicalData(coin: string): Promise<TechnicalData> {
  const pair = `${coin.toUpperCase()}_USDT`;

  const [tickerRes, klinesRes] = await Promise.all([
    axios.get<GateTicker[]>(`${GATE_BASE}/tickers`, {
      params: { currency_pair: pair },
      timeout: 10000,
    }),
    axios.get<GateKline[]>(`${GATE_BASE}/candlesticks`, {
      params: { currency_pair: pair, interval: "1h", limit: 100 },
      timeout: 10000,
    }),
  ]);

  if (!tickerRes.data.length) {
    throw new Error(`400: ${pair} not found on Gate.io`);
  }

  const ticker = tickerRes.data[0];

  // Gate.io returns klines oldest-first
  const klines = klinesRes.data.map((k: GateKline) => ({
    high:   parseFloat(k[3]),
    low:    parseFloat(k[4]),
    close:  parseFloat(k[2]),
    volume: parseFloat(k[1]),
  }));

  const closes  = klines.map((k) => k.close);
  const highs   = klines.map((k) => k.high);
  const lows    = klines.map((k) => k.low);
  const volumes = klines.map((k) => k.volume);

  const price  = parseFloat(ticker.last);
  const rsi    = calculateRSI(closes);
  const ema20  = calculateEMA(closes, 20);
  const ema50  = calculateEMA(closes, 50);

  const maTrend: TechnicalData["maTrend"] =
    price > ema20 && ema20 > ema50 ? "Bullish" :
    price < ema20 && ema20 < ema50 ? "Bearish" : "Neutral";

  const recentVol = volumes.slice(-6).reduce((a, b) => a + b, 0) / 6;
  const prevVol   = volumes.slice(-24, -6).reduce((a, b) => a + b, 0) / 18;
  const volumeTrend: TechnicalData["volumeTrend"] =
    recentVol > prevVol ? "increasing" : "decreasing";

  const rsiLabel: TechnicalData["rsiLabel"] =
    rsi >= 70 ? "overbought" : rsi <= 30 ? "oversold" : "neutral";

  const levels = findLevels(highs.slice(-48), lows.slice(-48), price);

  return {
    coin: coin.toUpperCase(),
    symbol: pair,
    price,
    change24h:   parseFloat(ticker.change_percentage),
    high24h:     parseFloat(ticker.high_24h),
    low24h:      parseFloat(ticker.low_24h),
    volumeCoins: parseFloat(ticker.base_volume),
    volumeUSD:   parseFloat(ticker.quote_volume),
    rsi,
    rsiLabel,
    ema20,
    ema50,
    maTrend,
    volumeTrend,
    ...levels,
  };
}
