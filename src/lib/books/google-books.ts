export interface BookMetadata {
  isbn: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  description?: string;
  coverUrl?: string;
  categories?: string[];
  language?: string;
}

interface GoogleBooksVolume {
  volumeInfo: {
    title: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    description?: string;
    categories?: string[];
    language?: string;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
  };
}

interface GoogleBooksResponse {
  totalItems: number;
  items?: GoogleBooksVolume[];
}

export async function lookupByISBN(isbn: string): Promise<BookMetadata | null> {
  const cleanISBN = isbn.replace(/[-\s]/g, "");

  if (!/^\d{10}(\d{3})?$/.test(cleanISBN)) {
    return null;
  }

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const url = apiKey
    ? `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanISBN}&key=${apiKey}`
    : `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanISBN}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google Books API error: ${response.status}`);
  }

  const data: GoogleBooksResponse = await response.json();

  if (!data.items || data.items.length === 0) {
    return null;
  }

  const volume = data.items[0].volumeInfo;

  // Get the best available cover URL and upgrade to HTTPS
  const coverUrl = volume.imageLinks?.thumbnail?.replace("http://", "https://")
    ?? volume.imageLinks?.smallThumbnail?.replace("http://", "https://");

  return {
    isbn: cleanISBN,
    title: volume.title,
    subtitle: volume.subtitle,
    authors: volume.authors ?? [],
    publisher: volume.publisher,
    publishedDate: volume.publishedDate,
    pageCount: volume.pageCount,
    description: volume.description,
    coverUrl,
    categories: volume.categories,
    language: volume.language,
  };
}
