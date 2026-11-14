
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export type DeliveryItem = {
  id: string;
  productNameSnapshot: string;
  unitLabelSnapshot: string;
  requestedQuantity: number;
  estimatedUnitPricePaise: number;
  actualUnitPricePaise: number | null;
  purchasedQuantity: number;
  actualLineTotalPaise: number;
  status: string;
  fulfilledUnitLabelSnapshot: string | null;
};

export type DeliveryOrder = {
  assignmentId: string;
  assignmentStatus: string;
  assignedAt: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  createdAt: string;
  recipientName: string;
  recipientPhone: string;
  addressLine1: string;
  addressLine2: string | null;
  locality: string;
  landmark: string | null;
  city: string;
  district: string;
  state: string;
  postalCode: string;
  deliveryInstructions: string | null;
  estimatedTotalPaise: number;
  finalTotalPaise: number;
  items: DeliveryItem[];
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(result.message ?? "Request failed.");
  }

  return result as T;
}

export async function getDeliveryProfile() {
  return request<{
    success: boolean;
    data: {
      id: string;
      status: string;
      isAvailable: boolean;
      vehicleType: string | null;
      vehicleNumber: string | null;
    };
  }>("/delivery/me");
}

export async function getDeliveryOrders() {
  return request<{ success: boolean; data: DeliveryOrder[] }>("/delivery/orders");
}

export async function setDeliveryAvailability(isAvailable: boolean) {
  return request("/delivery/availability", {
    method: "PATCH",
    body: JSON.stringify({ isAvailable }),
  });
}

export async function acceptDeliveryOrder(orderId: string) {
  return request(`/delivery/orders/${orderId}/accept`, { method: "POST" });
}

export async function rejectDeliveryOrder(orderId: string) {
  return request(`/delivery/orders/${orderId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason: "Unable to take this assignment" }),
  });
}

export async function startShopping(orderId: string) {
  return request(`/delivery/orders/${orderId}/start-shopping`, {
    method: "POST",
  });
}

export async function updateDeliveryItem(
  orderId: string,
  itemId: string,
  payload:
    | { status: "PURCHASED"; quantity: number; unitPricePaise: number }
    | { status: "UNAVAILABLE" }
) {
  return request(`/delivery/orders/${orderId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function finishShopping(orderId: string) {
  return request(`/delivery/orders/${orderId}/finish-shopping`, {
    method: "POST",
  });
}
