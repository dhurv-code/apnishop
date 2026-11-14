
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  unitLabel: string;
  estimatedPricePaise: number | null;
  imageUrl: string | null;
  categoryName: string | null;
  categorySlug: string | null;
};

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

type ProductsResponse = {
  success: boolean;
  data: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  message?: string;
};

async function apiRequest<T>(
  endpoint: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  const result: unknown = await response.json();

  if (!response.ok) {
    const message =
      typeof result === "object" &&
      result !== null &&
      "message" in result &&
      typeof result.message === "string"
        ? result.message
        : `API request failed: ${response.status}`;

    throw new Error(message);
  }

  return result as T;
}

export async function getCategories(
  signal?: AbortSignal
): Promise<Category[]> {
  const response = await apiRequest<ApiResponse<Category[]>>(
    "/categories",
    signal
  );

  if (!response.success || !Array.isArray(response.data)) {
    throw new Error("Invalid categories API response.");
  }

  return response.data;
}

export async function getProducts(
  options: {
    search?: string;
    category?: string;
    page?: number;
    limit?: number;
    sort?: "newest" | "price_asc" | "price_desc";
  } = {},
  signal?: AbortSignal
): Promise<{
  data: Product[];
  total: number;
  totalPages: number;
}> {
  const params = new URLSearchParams();

  if (options.search) params.set("search", options.search);
  if (options.category) params.set("category", options.category);

  params.set("page", String(options.page ?? 1));
  params.set("limit", String(options.limit ?? 50));
  params.set("sort", options.sort ?? "newest");

  const response = await apiRequest<ProductsResponse>(
    `/products?${params.toString()}`,
    signal
  );

  if (!response.success || !Array.isArray(response.data)) {
    throw new Error("Invalid products API response.");
  }

  return {
    data: response.data,
    total: response.pagination.total,
    totalPages: response.pagination.totalPages,
  };
}
