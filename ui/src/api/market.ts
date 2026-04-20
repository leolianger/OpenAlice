import { fetchJson } from './client'

export type AssetClass = 'equity' | 'crypto' | 'currency' | 'commodity'

export interface SearchResult {
  /** Equity / crypto / currency have `symbol`. Commodity uses `id` (canonical). */
  symbol?: string
  id?: string
  name?: string | null
  assetClass: AssetClass
  // upstream fields pass through (cik, source, currency, exchange, exchange_name, category, …)
  [key: string]: unknown
}

export interface SearchResponse {
  results: SearchResult[]
  count: number
}

export interface HistoricalBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export interface HistoricalResponse {
  results: HistoricalBar[] | null
  provider: string
  error?: string
}

export const marketApi = {
  /** Alice's aggregated heuristic search across all asset classes. */
  async search(query: string, limit = 20): Promise<SearchResponse> {
    const qs = new URLSearchParams({ query, limit: String(limit) })
    return fetchJson(`/api/market/search?${qs}`)
  },

  /**
   * Historical OHLCV candles. Provider comes from the server-side default
   * (config.marketData.providers[assetClass]) — UI doesn't pick provider.
   * `assetClass` only decides the URL prefix; `interval` defaults to `1d`.
   *
   * Note: we deliberately don't pass start_date/end_date. Upstream providers
   * (notably FMP's /stable/historical-price-eod/full) ignore those params
   * and return a fixed window, which made server-side range filtering
   * unreliable. Timeframe switching is done client-side via setVisibleRange.
   */
  async historical(
    assetClass: AssetClass,
    symbol: string,
    opts: { interval?: string } = {},
  ): Promise<HistoricalResponse> {
    if (assetClass === 'commodity') {
      throw new Error('commodity historical not supported yet')
    }
    const qs = new URLSearchParams({ symbol })
    qs.set('interval', opts.interval ?? '1d')
    return fetchJson(`/api/market-data-v1/${assetClass}/price/historical?${qs}`)
  },
}
