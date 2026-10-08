import {
  PithClientOptions,
  CheckResponse,
  DetectResponse,
  PreviewResponse,
  CreateJobParams,
  JobResponse,
  RecipeCreateParams,
  RecipeResponse,
  ChangeRecord,
  SiteDiscoverParams,
  SiteResponse,
  SitePageType,
  PageTypeUpdateParams,
  SitePageItem,
} from './types';

export class PithClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(options: PithClientOptions = {}) {
    this.baseUrl = (options.baseUrl || process.env.PITH_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
    this.apiKey = options.apiKey || process.env.PITH_API_KEY;
    this.timeout = options.timeout || 45000;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(this.apiKey ? { 'X-Api-Key': this.apiKey } : {}),
      ...(options.headers as Record<string, string> || {}),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        let errorDetail = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errJson = text ? JSON.parse(text) : {};
          errorDetail = errJson.detail || errorDetail;
        } catch (_) {}
        throw new Error(`Pith API Error (${response.status}): ${errorDetail}`);
      }

      try {
        return text ? (JSON.parse(text) as T) : ({} as T);
      } catch {
        return text as unknown as T;
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        throw new Error(`Request timed out after ${this.timeout / 1000}s while waiting for target server response.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Checks if a URL is scrapable, evaluates robots.txt, safety guards, and scrapability score (0-100).
   */
  async check(url: string, customHeaders?: Record<string, string>): Promise<CheckResponse> {
    return this.request<CheckResponse>('/v1/check', {
      method: 'POST',
      body: JSON.stringify({ url, custom_headers: customHeaders }),
    });
  }

  /**
   * Detects all data structures, tables, patterns, entities, and structured data on the page.
   */
  async detect(
    url: string,
    options?: { method?: 'http' | 'playwright'; htmlOverride?: string; customHeaders?: Record<string, string> }
  ): Promise<DetectResponse> {
    return this.request<DetectResponse>('/v1/detect', {
      method: 'POST',
      body: JSON.stringify({
        url,
        method: options?.method || 'http',
        html_override: options?.htmlOverride,
        custom_headers: options?.customHeaders,
      }),
    });
  }

  /**
   * Returns a sanitized HTML snapshot with inspector bridge for the visual picker.
   */
  async preview(
    url: string,
    options?: { method?: 'http' | 'playwright'; htmlOverride?: string; customHeaders?: Record<string, string> }
  ): Promise<PreviewResponse> {
    return this.request<PreviewResponse>('/v1/preview', {
      method: 'POST',
      body: JSON.stringify({
        url,
        method: options?.method || 'http',
        html_override: options?.htmlOverride,
        custom_headers: options?.customHeaders,
      }),
    });
  }

  /**
   * Starts a data extraction job.
   */
  async createJob(params: CreateJobParams): Promise<JobResponse> {
    return this.request<JobResponse>('/v1/jobs', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Retrieves status, progress, and results for an extraction job.
   */
  async getJob(jobId: string, includeResults: boolean = true): Promise<JobResponse> {
    return this.request<JobResponse>(`/v1/jobs/${jobId}?include_results=${includeResults}`);
  }

  /**
   * Polls job until it completes or fails.
   */
  async waitForJob(
    jobId: string,
    pollIntervalMs: number = 1000,
    maxWaitMs: number = 60000,
    onProgress?: (progress: JobResponse['progress']) => void
  ): Promise<JobResponse> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const job = await this.getJob(jobId, true);
      if (onProgress) {
        onProgress(job.progress);
      }
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return job;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(`Job ${jobId} timed out after ${maxWaitMs}ms`);
  }

  /**
   * Exports extracted data to CSV, JSON, or XLSX text/buffer.
   */
  async exportJob(jobId: string, format: 'csv' | 'json' | 'xlsx' = 'json', cleaned: boolean = true): Promise<string> {
    const url = `${this.baseUrl}/v1/jobs/${jobId}/export?format=${format}&cleaned=${cleaned}`;
    const resp = await fetch(url, {
      headers: this.apiKey ? { 'X-Api-Key': this.apiKey } : {},
    });
    if (!resp.ok) {
      throw new Error(`Export failed: HTTP ${resp.status}`);
    }
    return resp.text();
  }

  /**
   * Lists saved recipes.
   */
  async listRecipes(limit: number = 50, offset: number = 0): Promise<RecipeResponse[]> {
    return this.request<RecipeResponse[]>(`/v1/recipes?limit=${limit}&offset=${offset}`);
  }

  /**
   * Gets a recipe by ID or slug.
   */
  async getRecipe(recipeId: string): Promise<RecipeResponse> {
    return this.request<RecipeResponse>(`/v1/recipes/${recipeId}`);
  }

  /**
   * Creates a new saved scraper recipe.
   */
  async createRecipe(params: RecipeCreateParams): Promise<RecipeResponse> {
    return this.request<RecipeResponse>('/v1/recipes', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Updates an existing recipe.
   */
  async updateRecipe(recipeId: string, params: Partial<RecipeCreateParams>): Promise<RecipeResponse> {
    return this.request<RecipeResponse>(`/v1/recipes/${recipeId}`, {
      method: 'PUT',
      body: JSON.stringify(params),
    });
  }

  /**
   * Deletes a recipe.
   */
  async deleteRecipe(recipeId: string): Promise<{ message: string; id: string }> {
    return this.request<{ message: string; id: string }>(`/v1/recipes/${recipeId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Triggers an immediate execution of a recipe.
   */
  async runRecipe(recipeId: string): Promise<{ message: string; recipe_id: string; job_id: string }> {
    return this.request<{ message: string; recipe_id: string; job_id: string }>(`/v1/recipes/${recipeId}/run`, {
      method: 'POST',
    });
  }

  /**
   * Gets run history for a recipe.
   */
  async getRecipeRuns(recipeId: string, limit: number = 20): Promise<any[]> {
    return this.request<any[]>(`/v1/recipes/${recipeId}/runs?limit=${limit}`);
  }

  /**
   * Gets change alert and diff history for a recipe.
   */
  async getRecipeChanges(recipeId: string, limit: number = 20): Promise<ChangeRecord[]> {
    return this.request<ChangeRecord[]>(`/v1/recipes/${recipeId}/changes?limit=${limit}`);
  }

  /**
   * Fetches latest data from a public recipe endpoint.
   */
  async getPublicData(
    slug: string,
    options?: { page?: number; limit?: number; format?: 'json' | 'csv'; filterField?: string; filterVal?: string }
  ): Promise<any> {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.format) params.set('format', options.format);
    if (options?.filterField && options?.filterVal) {
      params.set('filter_field', options.filterField);
      params.set('filter_val', options.filterVal);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<any>(`/v1/r/${slug}/data${query}`);
  }

  // ==================== SITE MODE METHODS ====================

  /**
   * Starts whole-site page discovery for a given root URL.
   */
  async discoverSite(params: SiteDiscoverParams): Promise<{ site_id: string; domain: string; status: string; message: string }> {
    return this.request<{ site_id: string; domain: string; status: string; message: string }>('/v1/sites/discover', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Gets current discovery and extraction status for a site, including page types and sample data.
   */
  async getSite(siteId: string): Promise<SiteResponse> {
    return this.request<SiteResponse>(`/v1/sites/${siteId}`);
  }

  /**
   * Updates a page type's configuration (name, inclusion, selectors, or fields).
   */
  async updatePageType(siteId: string, typeId: string, params: PageTypeUpdateParams): Promise<SitePageType> {
    return this.request<SitePageType>(`/v1/sites/${siteId}/types/${typeId}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
  }

  /**
   * Starts full site extraction across all included page types.
   */
  async extractSite(siteId: string): Promise<{ site_id: string; status: string; message: string }> {
    return this.request<{ site_id: string; status: string; message: string }>(`/v1/sites/${siteId}/extract`, {
      method: 'POST',
    });
  }

  /**
   * Pauses an active site crawl.
   */
  async pauseSiteCrawl(siteId: string): Promise<{ site_id: string; status: string }> {
    return this.request<{ site_id: string; status: string }>(`/v1/sites/${siteId}/pause`, {
      method: 'POST',
    });
  }

  /**
   * Resumes a paused site crawl.
   */
  async resumeSiteCrawl(siteId: string): Promise<{ site_id: string; status: string }> {
    return this.request<{ site_id: string; status: string }>(`/v1/sites/${siteId}/resume`, {
      method: 'POST',
    });
  }

  /**
   * Cancels an active site crawl.
   */
  async cancelSiteCrawl(siteId: string): Promise<{ site_id: string; status: string }> {
    return this.request<{ site_id: string; status: string }>(`/v1/sites/${siteId}/cancel`, {
      method: 'POST',
    });
  }

  /**
   * Re-queues all failed pages for a site and retries extraction.
   */
  async retryFailedPages(siteId: string): Promise<{ site_id: string; requeued_count: number; message: string }> {
    return this.request<{ site_id: string; requeued_count: number; message: string }>(`/v1/sites/${siteId}/retry-failed`, {
      method: 'POST',
    });
  }

  /**
   * Lists discovered pages for a site with optional filters.
   */
  async getSitePages(
    siteId: string,
    options?: { status?: string; type_id?: string; search?: string; limit?: number; offset?: number }
  ): Promise<{ site_id: string; limit: number; offset: number; pages: SitePageItem[] }> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.type_id) params.set('type_id', options.type_id);
    if (options?.search) params.set('search', options.search);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ site_id: string; limit: number; offset: number; pages: SitePageItem[] }>(`/v1/sites/${siteId}/pages${query}`);
  }

  /**
   * Gets export URL for site or page type data.
   */
  getSiteExportUrl(siteId: string, options?: { typeId?: string; format?: 'csv' | 'json' | 'xlsx' | 'zip' }): string {
    const params = new URLSearchParams();
    if (options?.typeId) params.set('type', options.typeId);
    if (options?.format) params.set('format', options.format);
    const query = params.toString() ? `?${params.toString()}` : '';
    return `${this.baseUrl}/v1/sites/${siteId}/export${query}`;
  }
}
