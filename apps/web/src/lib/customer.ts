
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export type Address = {
  id: string;
  userId: string;
  recipientName: string;
  phone: string;
  addressType: "HOME" | "WORK" | "OTHER";
  addressLine1: string;
  addressLine2: string | null;
  locality: string;
  landmark: string | null;
  city: string;
  district: string;
  state: string;
  postalCode: string;
  deliveryInstructions: string | null;
  isDefault: boolean;
};

export type AddressInput = {
  recipientName: string;
  phone: string;
  addressType: "HOME" | "WORK" | "OTHER";
  addressLine1: string;
  addressLine2?: string;
  locality: string;
  landmark?: string;
  city: string;
  district: string;
  state: string;
  postalCode: string;
  deliveryInstructions?: string;
  isDefault?: boolean;
};

export type CartItem = {
  id: string;
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  unitLabel: string;
  pricePaise: number | null;
  productStatus: "ACTIVE" | "INACTIVE";
  categoryName: string | null;
  quantity: number;
};

export type CustomerCart = {
  id: string;
  items: CartItem[];
  itemCount: number;
  subtotalPaise: number;
  hasUnpricedItems: boolean;
  hasInactiveItems: boolean;
};

async function customerRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
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

  const result: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof result === "object" &&
      result !== null &&
      "message" in result &&
      typeof result.message === "string"
        ? result.message
        : `Request failed (${response.status})`;

    throw new Error(message);
  }

  if (
    typeof result !== "object" ||
    result === null ||
    !("success" in result) ||
    result.success !== true
  ) {
    throw new Error("Invalid server response.");
  }

  if (!("data" in result)) {
    return undefined as T;
  }

  return result.data as T;
}

// Addresses

export function getAddresses() {
  return customerRequest<Address[]>("/addresses", "GET");
}

export function createAddress(data: AddressInput) {
  return customerRequest<Address>("/addresses", "POST", data);
}

export function updateAddress(id: string, data: Partial<AddressInput>) {
  return customerRequest<Address>(`/addresses/${id}`, "PATCH", data);
}

export function setDefaultAddress(id: string) {
  return customerRequest<Address>(`/addresses/${id}/default`, "PATCH", {});
}

export function deleteAddress(id: string) {
  return customerRequest<void>(`/addresses/${id}`, "DELETE");
}

// Persistent cart

export function getCart() {
  return customerRequest<CustomerCart>("/cart", "GET");
}

export function addCartItem(productId: string, quantity = 1) {
  return customerRequest<CustomerCart>("/cart/items", "POST", {
    productId,
    quantity,
  });
}

export function updateCartItem(id: string, quantity: number) {
  return customerRequest<CustomerCart>(`/cart/items/${id}`, "PATCH", {
    quantity,
  });
}

export function removeCartItem(id: string) {
  return customerRequest<CustomerCart>(`/cart/items/${id}`, "DELETE");
}

export function clearCart() {
  return customerRequest<CustomerCart>("/cart", "DELETE");
}
