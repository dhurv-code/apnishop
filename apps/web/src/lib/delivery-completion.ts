const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export type DeliveryCompletion = {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: "COD" | "ONLINE";
  paymentStatus: string;
  finalTotalPaise: number;
  recipientPhone: string;
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

export function getDeliveryCompletion(orderId: string) {
  return request<{ success: boolean; data: DeliveryCompletion }>(
    `/delivery/orders/${orderId}/completion`
  );
}

export function startDelivery(orderId: string) {
  return request(`/delivery/orders/${orderId}/start-delivery`, {
    method: "POST",
  });
}

export function resendDeliveryOtp(orderId: string) {
  return request(`/delivery/orders/${orderId}/resend-delivery-otp`, {
    method: "POST",
  });
}

export function verifyDeliveryOtp(orderId: string, otp: string) {
  return request(`/delivery/orders/${orderId}/verify-delivery-otp`, {
    method: "POST",
    body: JSON.stringify({ otp }),
  });
}

export function collectCod(orderId: string, collectedAmountPaise: number) {
  return request(`/delivery/orders/${orderId}/collect-cod`, {
    method: "POST",
    body: JSON.stringify({ collectedAmountPaise }),
  });
}
