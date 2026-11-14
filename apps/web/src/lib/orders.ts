
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export type CreatedOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  estimatedTotalPaise: number;
  finalTotalPaise: number;
  createdAt: string;
};

export type OrderItem = {
  id: string;
  productNameSnapshot: string;
  unitLabelSnapshot: string;
  requestedQuantity: number;
  estimatedUnitPricePaise: number;
  actualLineTotalPaise: number;
  status: string;
};

export type OrderDetails = CreatedOrder & {
  items: OrderItem[];
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  locality: string;
  city: string;
  district: string;
  state: string;
  postalCode: string;
  itemSubtotalEstimatedPaise: number;
  deliveryFeePaise: number;
  platformFeePaise: number;
};

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
};

async function orderRequest<T>(
  endpoint: string,
  method: "GET" | "POST",
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

  const result = await response.json() as ApiResponse<T>;

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Order request failed.");
  }

  return result.data;
}

export function createCodOrder(data: {
  addressId: string;
  paymentMethod: "COD";
  customerNotes?: string;
  idempotencyKey: string;
}) {
  return orderRequest<CreatedOrder>("/orders", "POST", data);
}

export function getOrder(id: string) {
  return orderRequest<OrderDetails>(
    `/orders/${encodeURIComponent(id)}`,
    "GET"
  );
}

export function getMyOrders() {
  return orderRequest<CreatedOrder[]>("/orders", "GET");
}