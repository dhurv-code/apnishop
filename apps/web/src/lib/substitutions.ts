
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

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

export type PendingSubstitution = {
  substitutionId: string;
  status: string;
  replacementName: string;
  replacementUnitLabel: string;
  replacementUnitPricePaise: number;
  replacementQuantity: number;
  reason: string | null;
  createdAt: string;
  itemId: string;
  originalProductName: string;
  originalUnitLabel: string;
  requestedQuantity: number;
  orderId: string;
  orderNumber: string;
};

export function getPendingSubstitutions() {
  return request<{ success: boolean; data: PendingSubstitution[] }>(
    "/customer/substitutions"
  );
}

export function respondToSubstitution(
  orderId: string,
  substitutionId: string,
  decision: "APPROVE" | "REJECT"
) {
  return request(
    `/customer/orders/${orderId}/substitutions/${substitutionId}/respond`,
    {
      method: "POST",
      body: JSON.stringify({ decision }),
    }
  );
}

export function requestSubstitution(
  orderId: string,
  itemId: string,
  payload: {
    replacementName: string;
    replacementUnitLabel: string;
    replacementUnitPricePaise: number;
    replacementQuantity: number;
    reason?: string;
  }
) {
  return request(
    `/delivery/orders/${orderId}/items/${itemId}/substitutions`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}