
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export type DeliveryPartnerStatus =
  | "PENDING"
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED";

export type AdminDeliveryPartner = {
  id: string;
  userId: string;
  fullName: string | null;
  phone: string;
  userStatus: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  vehicleType: string | null;
  vehicleNumber: string | null;
  status: DeliveryPartnerStatus;
  isAvailable: boolean;
  verifiedAt: string | null;
  createdAt: string;
};

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const result: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof result === "object" &&
      result !== null &&
      "message" in result &&
      typeof result.message === "string"
        ? result.message
        : "Request failed.";

    throw new Error(message);
  }

  return result as T;
}

export function getAdminDeliveryPartners() {
  return request<{
    success: boolean;
    data: AdminDeliveryPartner[];
  }>("/admin/partners");
}

export function createAdminDeliveryPartner(payload: {
  phone: string;
  vehicleType?: string | null;
  vehicleNumber?: string | null;
}) {
  return request<{
    success: boolean;
    data: AdminDeliveryPartner;
  }>("/admin/partners", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminDeliveryPartner(
  partnerId: string,
  payload: Partial<
    Pick<
      AdminDeliveryPartner,
      "status" | "vehicleType" | "vehicleNumber"
    >
  >
) {
  return request<{
    success: boolean;
    data: AdminDeliveryPartner;
  }>(`/admin/partners/${partnerId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
