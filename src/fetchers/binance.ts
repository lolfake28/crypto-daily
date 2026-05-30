import axios from "axios";

// Gate.io replaces Binance/Bybit which are blocked by regional ISP filtering
const GATE_SPOT    = "https://api.gateio.ws/api/v4/spot";
const GATE_FUTURES = "https://fx-api.gateio.ws/api/v4/futures/usdt";

interface GateTicker {
  currency_pair: string;
  last: string;
  high_24h: string;
  low_24h: string;
  change_percentage: string;
  base_volume: string;
  quote_volume: string;
}

interface GateFuturesTicker {
  contract: string;
  last: string;
  funding_rate: string;
  funding_rate_indicative: string;
  total_size: string;
  volume_24h: string;
  volume_24h_quote: string;
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
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function maTrend(price: number, ema20: number, ema50: number): "Bullish" | "Bearish" | "Neutral" {
  if (price > ema20 && ema20 > ema50) return "Bullish";
  if (price < ema20 && ema20 < ema50) return "Bearish";
  return "Neutral";
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

function parseKlines(raw: GateKline[]) {
  return raw.map((k) => ({
    high:   parseFloat(k[3]),
    low:    parseFloat(k[4]),
    close:  parseFloat(k[2]),
    volume: parseFloat(k[1]),
  }));
}

// --- Public types ---

export interface TechnicalData {
  coin: string;
  symbol: string;
  price: number;
  change24h: number;
  change7d: number;
  high24h: number;
  low24h: number;
  high52w: number;
  distanceFromATH: number;
  volumeCoins: number;
  volumeUSD: number;
  volumeTrend: "increasing" | "decreasing";
  rsi: number;
  rsiLabel: "overbought" | "oversold" | "neutral";
  ema20: number;
  ema50: number;
  ema200: number;
  maTrend1H: "Bullish" | "Bearish" | "Neutral";
  maTrend4H: "Bullish" | "Bearish" | "Neutral";
  maTrendDaily: "Bullish" | "Bearish" | "Neutral";
  strongResistance: number;
  resistance: number;
  support: number;
  strongSupport: number;
  fundingRate: number | null;
  fundingLabel: "positive" | "negative" | "neutral";
  oiTrend: "increasing" | "decreasing" | "unknown";
}

// --- Fetch ---

export async function fetchTechnicalData(coin: string): Promise<TechnicalData> {
  const pair     = `${coin.toUpperCase()}_USDT`;
  const contract = `${coin.toUpperCase()}_USDT`;

  const [tickerRes, klines1H, klines4H, klinesDaily, futuresRes] = await Promise.allSettled([
    axios.get<GateTicker[]>(`${GATE_SPOT}/tickers`, {
      params: { currency_pair: pair },
      timeout: 10000,
    }),
    axios.get<GateKline[]>(`${GATE_SPOT}/candlesticks`, {
      params: { currency_pair: pair, interval: "1h", limit: 210 },
      timeout: 10000,
    }),
    axios.get<GateKline[]>(`${GATE_SPOT}/candlesticks`, {
      params: { currency_pair: pair, interval: "4h", limit: 60 },
      timeout: 10000,
    }),
    axios.get<GateKline[]>(`${GATE_SPOT}/candlesticks`, {
      params: { currency_pair: pair, interval: "1d", limit: 60 },
      timeout: 10000,
    }),
    axios.get<GateFuturesTicker[]>(`${GATE_FUTURES}/tickers`, {
      params: { contract },
      timeout: 8000,
    }),
  ]);

  if (tickerRes.status === "rejected" || klines1H.status === "rejected") {
    throw new Error(`400: ${pair} not found on Gate.io`);
  }

  const ticker  = tickerRes.value.data[0];
  const h1      = parseKlines(klines1H.value.data);
  const h4      = klines4H.status === "fulfilled"    ? parseKlines(klines4H.value.data)    : [];
  const daily   = klinesDaily.status === "fulfilled" ? parseKlines(klinesDaily.value.data) : [];

  if (!ticker) throw new Error(`400: ${pair} not found on Gate.io`);

  const price = parseFloat(ticker.last);

  // 1H technicals
  const closes1H  = h1.map((k) => k.close);
  const highs1H   = h1.map((k) => k.high);
  const lows1H    = h1.map((k) => k.low);
  const volumes1H = h1.map((k) => k.volume);

  const rsi    = calculateRSI(closes1H);
  const ema20  = calculateEMA(closes1H, 20);
  const ema50  = calculateEMA(closes1H, 50);
  const ema200 = calculateEMA(closes1H, 200);

  const rsiLabel: TechnicalData["rsiLabel"] =
    rsi >= 70 ? "overbought" : rsi <= 30 ? "oversold" : "neutral";

  const recentVol = volumes1H.slice(-6).reduce((a, b) => a + b, 0) / 6;
  const prevVol   = volumes1H.slice(-24, -6).reduce((a, b) => a + b, 0) / 18;
  const volumeTrend: TechnicalData["volumeTrend"] = recentVol > prevVol ? "increasing" : "decreasing";

  const levels = findLevels(highs1H.slice(-48), lows1H.slice(-48), price);

  // 4H MA trend
  const closes4H = h4.map((k) => k.close);
  const ema20_4H = closes4H.length >= 20 ? calculateEMA(closes4H, 20) : ema20;
  const ema50_4H = closes4H.length >= 50 ? calculateEMA(closes4H, 50) : ema50;
  const maTrend4H = maTrend(price, ema20_4H, ema50_4H);

  // Daily MA trend + 7d change + 52w high
  const closesDaily = daily.map((k) => k.close);
  const highsDaily  = daily.map((k) => k.high);
  const ema20Daily  = closesDaily.length >= 20 ? calculateEMA(closesDaily, 20) : ema20;
  const ema50Daily  = closesDaily.length >= 50 ? calculateEMA(closesDaily, 50) : ema50;
  const maTrendDaily = maTrend(price, ema20Daily, ema50Daily);

  const change7d = closesDaily.length >= 8
    ? ((price - closesDaily[closesDaily.length - 8]) / closesDaily[closesDaily.length - 8]) * 100
    : 0;

  const high52w = highsDaily.length > 0 ? Math.max(...highsDaily) : price;
  const distanceFromATH = ((price - high52w) / high52w) * 100;

  // Futures data (optional — not all coins have perpetual contracts)
  let fundingRate: number | null = null;
  let oiTrend: TechnicalData["oiTrend"] = "unknown";

  if (futuresRes.status === "fulfilled" && futuresRes.value.data.length) {
    const ft = futuresRes.value.data[0];
    fundingRate = parseFloat(ft.funding_rate) * 100; // convert to %
    const vol24h  = parseFloat(ft.volume_24h_quote ?? "0");
    const spotVol = parseFloat(ticker.quote_volume);
    oiTrend = vol24h > spotVol * 0.8 ? "increasing" : "decreasing";
  }

  const fundingLabel: TechnicalData["fundingLabel"] =
    fundingRate === null ? "neutral" :
    fundingRate > 0.01   ? "positive" :
    fundingRate < -0.01  ? "negative" : "neutral";

  return {
    coin: coin.toUpperCase(),
    symbol: pair,
    price,
    change24h:   parseFloat(ticker.change_percentage),
    change7d:    Math.round(change7d * 100) / 100,
    high24h:     parseFloat(ticker.high_24h),
    low24h:      parseFloat(ticker.low_24h),
    high52w,
    distanceFromATH: Math.round(distanceFromATH * 100) / 100,
    volumeCoins: parseFloat(ticker.base_volume),
    volumeUSD:   parseFloat(ticker.quote_volume),
    volumeTrend,
    rsi,
    rsiLabel,
    ema20,
    ema50,
    ema200,
    maTrend1H: maTrend(price, ema20, ema50),
    maTrend4H,
    maTrendDaily,
    fundingRate,
    fundingLabel,
    oiTrend,
    ...levels,
  };
}
