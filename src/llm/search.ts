/**
 * Web search integration for evidence grounding
 * Supports multiple search providers: Tavily, Serper, Brave, and fallback simulation
 */

import { createLogger } from '../utils/log.js';

const logger = createLogger('search');

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  provider: string;
}

export type SearchProvider = 'tavily' | 'serper' | 'brave' | 'simulation';

export class WebSearchClient {
  private provider: SearchProvider;
  private api_key?: string;

  constructor() {
    // Auto-detect which search provider is configured
    if (process.env.TAVILY_API_KEY) {
      this.provider = 'tavily';
      this.api_key = process.env.TAVILY_API_KEY;
      logger.info('Using Tavily search provider');
    } else if (process.env.SERPER_API_KEY) {
      this.provider = 'serper';
      this.api_key = process.env.SERPER_API_KEY;
      logger.info('Using Serper search provider');
    } else if (process.env.BRAVE_API_KEY) {
      this.provider = 'brave';
      this.api_key = process.env.BRAVE_API_KEY;
      logger.info('Using Brave search provider');
    } else {
      this.provider = 'simulation';
      logger.warn('No search API key found - using simulation mode for web search');
      logger.warn('For production, set TAVILY_API_KEY, SERPER_API_KEY, or BRAVE_API_KEY');
    }
  }

  async search(query: string, max_results: number = 5): Promise<SearchResponse> {
    logger.info({ query, provider: this.provider }, 'Executing web search');

    switch (this.provider) {
      case 'tavily':
        return await this.tavilySearch(query, max_results);
      case 'serper':
        return await this.serperSearch(query, max_results);
      case 'brave':
        return await this.braveSearch(query, max_results);
      default:
        return this.simulatedSearch(query, max_results);
    }
  }

  private async tavilySearch(query: string, max_results: number): Promise<SearchResponse> {
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.api_key,
          query,
          max_results,
          search_depth: 'advanced',
          include_answer: false,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;

      const results: SearchResult[] = (data.results || []).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        score: r.score,
      }));

      return {
        query,
        results,
        provider: 'tavily',
      };
    } catch (error) {
      logger.error({ error, query }, 'Tavily search failed');
      return this.simulatedSearch(query, max_results);
    }
  }

  private async serperSearch(query: string, max_results: number): Promise<SearchResponse> {
    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': this.api_key!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: query,
          num: max_results,
        }),
      });

      if (!response.ok) {
        throw new Error(`Serper API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;

      const results: SearchResult[] = (data.organic || []).slice(0, max_results).map((r: any) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      }));

      return {
        query,
        results,
        provider: 'serper',
      };
    } catch (error) {
      logger.error({ error, query }, 'Serper search failed');
      return this.simulatedSearch(query, max_results);
    }
  }

  private async braveSearch(query: string, max_results: number): Promise<SearchResponse> {
    try {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.append('q', query);
      url.searchParams.append('count', max_results.toString());

      const response = await fetch(url.toString(), {
        headers: {
          'X-Subscription-Token': this.api_key!,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Brave API error: ${response.statusText}`);
      }

      const data = (await response.json()) as any;

      const results: SearchResult[] = (data.web?.results || []).slice(0, max_results).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      }));

      return {
        query,
        results,
        provider: 'brave',
      };
    } catch (error) {
      logger.error({ error, query }, 'Brave search failed');
      return this.simulatedSearch(query, max_results);
    }
  }

  private simulatedSearch(query: string, max_results: number): SearchResponse {
    logger.debug({ query }, 'Using simulated search results');

    // Generate domain-relevant simulated results based on query patterns
    const results: SearchResult[] = [];

    // Clinical trial databases
    if (query.toLowerCase().includes('trial') || query.toLowerCase().includes('study')) {
      results.push({
        title: `Clinical Trials for ${query}`,
        url: 'https://clinicaltrials.gov/search?term=' + encodeURIComponent(query),
        snippet: 'ClinicalTrials.gov registry and results database of publicly and privately supported clinical studies.',
      });
    }

    // FDA resources
    if (query.toLowerCase().includes('fda') || query.toLowerCase().includes('approval') || query.toLowerCase().includes('dosing')) {
      results.push({
        title: `FDA Drug Information - ${query}`,
        url: 'https://www.accessdata.fda.gov/scripts/cder/daf/',
        snippet: 'FDA-approved drug information including dosing, indications, and safety data.',
      });
    }

    // Clinical Guidelines
    if (query.toLowerCase().includes('guideline') || query.toLowerCase().includes('nccn')) {
      results.push({
        title: `Clinical Practice Guidelines - ${query}`,
        url: 'https://www.nccn.org/professionals/physician_gls/',
        snippet: 'Evidence-based clinical practice guidelines for treatment protocols and standards of care.',
      });
    }

    // PubMed
    results.push({
      title: `PubMed Search: ${query}`,
      url: 'https://pubmed.ncbi.nlm.nih.gov/?term=' + encodeURIComponent(query),
      snippet: 'Published medical literature and research articles indexed in PubMed database.',
    });

    // Epidemiology Database
    if (query.toLowerCase().includes('incidence') || query.toLowerCase().includes('prevalence') || query.toLowerCase().includes('epidemiology')) {
      results.push({
        title: `Epidemiology Statistics - ${query}`,
        url: 'https://seer.cancer.gov/statistics/',
        snippet: 'Disease incidence, prevalence, and survival statistics from epidemiological databases.',
      });
    }

    // Generic medical info
    results.push({
      title: `Medical Information: ${query}`,
      url: 'https://example.com/search?q=' + encodeURIComponent(query),
      snippet: `Comprehensive medical information related to ${query}. For production use, integrate with a real search API (Tavily, Serper, Brave).`,
    });

    return {
      query,
      results: results.slice(0, max_results),
      provider: 'simulation',
    };
  }
}

// Global search client instance
let globalSearchClient: WebSearchClient | null = null;

export function getSearchClient(): WebSearchClient {
  if (!globalSearchClient) {
    globalSearchClient = new WebSearchClient();
  }
  return globalSearchClient;
}
