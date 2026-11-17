
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export type Shop = {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  email: string | null;
  locality: string;
  city: string;
  district: string;
  state: string;
  status: "PENDING" | "ACTIVE" | "INACTIVE";
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  unitLabel: string;
  estimatedPricePaise: number | null;
  imageUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  categoryId: string | null;
  categoryName: string | null;
};

export type ShopProduct = {
  id: string;
  productId: string;
  productName: string;
  unitLabel: string;
  pricePaise: number;
  availability: "AVAILABLE" | "UNAVAILABLE" | "NOT_CHECKED";
};

async function adminCatalogRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "PUT",
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Admin request failed.");
  }

  return result.data as T;
}

export const getCatalogShops = () =>
  adminCatalogRequest<Shop[]>("/admin/catalog/shops", "GET");

export const createCatalogShop = (data: object) =>
  adminCatalogRequest<Shop>("/admin/catalog/shops", "POST", data);

export const updateShopStatus = (
  id: string,
  status: Shop["status"]
) =>
  adminCatalogRequest<Shop>(
    `/admin/catalog/shops/${id}/status`,
    "PATCH",
    { status }
  );

export const getCatalogCategories = () =>
  adminCatalogRequest<CatalogCategory[]>(
    "/admin/catalog/categories",
    "GET"
  );

export const createCatalogCategory = (data: object) =>
  adminCatalogRequest<CatalogCategory>(
    "/admin/catalog/categories",
    "POST",
    data
  );

export const getCatalogProducts = () =>
  adminCatalogRequest<CatalogProduct[]>(
    "/admin/catalog/products",
    "GET"
  );

export const createCatalogProduct = (data: object) =>
  adminCatalogRequest<CatalogProduct>(
    "/admin/catalog/products",
    "POST",
    data
  );

export const updateProductStatus = (
  id: string,
  status: CatalogProduct["status"]
) =>
  adminCatalogRequest<CatalogProduct>(
    `/admin/catalog/products/${id}/status`,
    "PATCH",
    { status }
  );

export const getShopProducts = (shopId: string) =>
  adminCatalogRequest<ShopProduct[]>(
    `/admin/catalog/shops/${shopId}/products`,
    "GET"
  );

export const saveShopProduct = (
  shopId: string,
  productId: string,
  data: {
    pricePaise: number;
    availability: ShopProduct["availability"];
  }
) =>
  adminCatalogRequest<ShopProduct>(
    `/admin/catalog/shops/${shopId}/products/${productId}`,
    "PUT",
    data
  );
