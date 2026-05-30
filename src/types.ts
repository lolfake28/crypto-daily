export interface NewsArticle {
  title: string;
  votes?: {
    positive?: number;
    negative?: number;
  };
  source?: {
    title?: string;
  };
  published_at?: string;
  url?: string;
}

export interface CryptoPanicResponse {
  results: NewsArticle[];
}

export interface LunarCrushCoinData {
  social_volume_24h?: number;
  sentiment?: number;
  galaxy_score?: number;
  name?: string;
  symbol?: string;
  price?: number;
  percent_change_24h?: number;
}

export interface LunarCrushResponse {
  data: LunarCrushCoinData;
}

export interface DigestConfig {
  trackedCoins: string[];
  date: string;
  news: string;
  sentiment: string;
}

export interface Tweet {
  id: string;
  text: string;
  public_metrics?: {
    retweet_count: number;
    like_count: number;
    reply_count: number;
    impression_count?: number;
  };
  created_at?: string;
  author_id?: string;
}

export interface TwitterSearchResponse {
  data?: Tweet[];
  meta?: {
    result_count: number;
    newest_id?: string;
    oldest_id?: string;
  };
  errors?: Array<{ message: string }>;
}
