export interface ChecklistItem {
  key: string;
  label: string;
  passed: boolean;
  status: 'pass' | 'fail' | 'warn';
  details: string;
}

export interface CheckResponse {
  url: string;
  allowed: boolean;
  score: number;
  level: 'easy' | 'medium' | 'hard';
  recommended_method: 'http' | 'playwright';
  reasons: string[];
  checklist: ChecklistItem[];
  resolved_ip?: string;
  robots: {
    allowed: boolean;
    status_code?: number;
    crawl_delay?: number;
    sitemaps: string[];
    matching_rule?: string;
    reason?: string;
  };
  policy: {
    found_terms_link: boolean;
    terms_urls: string[];
    scraping_warnings: string[];
    has_scraping_restrictions: boolean;
    summary: string;
  };
  page_metrics: {
    status_code: number;
    duration_ms: number;
    size_bytes: number;
    method_used: string;
    has_json_ld: boolean;
    has_opengraph: boolean;
  };
}

export interface CategoryDetectionResult {
  id: string;
  name: string;
  description: string;
  count: number;
  fields: string[];
  sample_rows: Record<string, any>[];
  selector?: string;
  category_type: 'table' | 'repeating_items' | 'links' | 'images' | 'text' | 'structured_data' | 'entities';
}

export interface DetectResponse {
  url: string;
  total_categories: number;
  categories: CategoryDetectionResult[];
  auto_patterns: any[];
  meta: Record<string, any>;
}

export interface PreviewResponse {
  url: string;
  sanitized_html: string;
  content_type: string;
}

export interface CleaningRules {
  trim_whitespace?: boolean;
  remove_duplicates?: boolean;
  normalize_prices?: boolean;
  normalize_dates?: boolean;
  make_urls_absolute?: boolean;
}

export interface PaginationConfig {
  enabled: boolean;
  max_pages: number;
}

export interface CreateJobParams {
  url: string;
  method?: 'http' | 'playwright';
  recipe_id?: string;
  category_id?: string;
  selectors?: {
    container?: string;
    fields: Record<string, string | { selector: string; attribute?: string }>;
  };
  pagination?: PaginationConfig;
  cleaning_rules?: CleaningRules;
  key_field?: string;
  custom_headers?: Record<string, string>;
}

export interface JobProgress {
  current_page: number;
  max_pages: number;
  rows_extracted: number;
  percent: number;
  message: string;
}

export interface JobResponse {
  id: string;
  url: string;
  recipe_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  method: string;
  progress: JobProgress;
  columns: string[];
  row_count: number;
  duration_ms: number;
  error_message?: string;
  created_at?: string;
  completed_at?: string;
  results?: Record<string, any>[];
  raw_results?: Record<string, any>[];
}

export interface RecipeCreateParams {
  name: string;
  description?: string;
  url: string;
  method?: 'http' | 'playwright';
  category_id?: string;
  selectors?: Record<string, any>;
  pagination?: PaginationConfig;
  cleaning_rules?: CleaningRules;
  schedule_cron?: string;
  alert_rules?: Record<string, any>;
  api_key_required?: boolean;
}

export interface RecipeResponse {
  id: string;
  slug: string;
  name: string;
  description?: string;
  url: string;
  method: string;
  category_id?: string;
  selectors: Record<string, any>;
  pagination: PaginationConfig;
  cleaning_rules: CleaningRules;
  schedule_cron?: string;
  alert_rules: Record<string, any>;
  is_active: boolean;
  api_key_required: boolean;
  last_run_at?: string;
  last_status?: string;
  last_row_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface ChangeRecord {
  id: string;
  job_id?: string;
  added_count: number;
  removed_count: number;
  modified_count: number;
  diff_summary: {
    key_field?: string;
    added_rows: any[];
    removed_rows: any[];
    modified_rows: any[];
    alerts: string[];
    has_changes?: boolean;
  };
  alert_triggered: boolean;
  alert_messages: string[];
  created_at?: string;
}

export interface PithClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

export interface SiteDiscoverParams {
  url: string;
  max_pages?: number;
  max_depth?: number;
  crawl_delay?: number;
  include_subdomains?: boolean;
  method?: 'http' | 'playwright';
}

export interface SitePageType {
  id: string;
  name: string;
  pattern: string;
  is_listing: boolean;
  is_included: boolean;
  selectors: Record<string, any>;
  fields: string[];
  sample_urls: string[];
  sample_rows: Record<string, any>[];
  page_count: number;
  extracted_count: number;
}

export interface SiteCrawlInfo {
  id: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  pages_discovered: number;
  pages_fetched: number;
  pages_failed: number;
  speed_pages_per_sec: number;
  estimated_time_remaining_sec: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface SiteResponse {
  id: string;
  domain: string;
  start_url: string;
  status: 'pending' | 'discovering' | 'discovered' | 'extracting' | 'completed' | 'failed';
  score: number;
  level: 'easy' | 'medium' | 'hard';
  options: Record<string, any>;
  robots_data: Record<string, any>;
  page_count: number;
  extracted_count: number;
  error_message?: string;
  crawl?: SiteCrawlInfo;
  page_types: SitePageType[];
  created_at?: string;
  updated_at?: string;
}

export interface SitePageItem {
  id: string;
  url: string;
  type_id?: string;
  status: string;
  http_status?: number;
  depth: number;
  error?: string;
  fetched_at?: string;
}

export interface PageTypeUpdateParams {
  name?: string;
  is_included?: boolean;
  is_listing?: boolean;
  selectors?: Record<string, any>;
  fields?: string[];
}
