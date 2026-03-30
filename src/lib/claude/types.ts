export interface ListingGenerationInput {
  title: string;
  subtitle: string | null;
  authors: string[] | null;
  publisher: string | null;
  published_date: string | null;
  isbn: string | null;
  page_count: number | null;
  condition: string;
  condition_notes: string | null;
  categories: string[] | null;
  language: string;
  image_urls: string[];
}

export interface GeneratedListing {
  listing_title: string;
  listing_description: string;
  listing_condition_notes: string;
  suggested_price: number | null;
}

export interface GenerationResult {
  listing: GeneratedListing;
  usage: {
    input_tokens: number;
    output_tokens: number;
    estimated_cost: number;
  };
}

export interface PromptTemplate {
  id: string;
  user_id: string;
  name: string;
  type: "title" | "description" | "condition_notes";
  template: string;
  is_default: boolean;
}

export interface CustomTemplates {
  title?: string;
  description?: string;
  condition_notes?: string;
}
