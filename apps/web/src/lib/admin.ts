
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";

export type AdminStats = {
  totalOrders: number;
  newOrders: number;
  inProgressOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  activeShops: number;
  activeDeliveryPartners: number;
};

export type AdminOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  estimatedTotalPaise: number;
  createdAt: string;
  customerName: string | null;
  customerPhone: string;
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
  shopName: string | null;
  assignedShopId: string | null;
};

export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string | null;
  relatedOrderId: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type AdminNotificationsResponse = {
  items: AdminNotification[];
  unreadCount: number;
};

export type AdminShop = {
  id: string;
  name: string;
};

export type AdminPartner = {
  id: string;
  fullName: string | null;
  phone: string;
  vehicleType: string | null;
  vehicleNumber: string | null;
  isAvailable: boolean;
};

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
};

async function adminRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" = "GET",
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
    throw new Error(result.message || `Admin API failed: ${response.status}`);
  }

  return result.data;
}

export const getAdminStats = () =>
  adminRequest<AdminStats>("/admin/dashboard");

export const getAdminOrders = () =>
  adminRequest<AdminOrder[]>("/admin/orders");

export const getAdminShops = () =>
  adminRequest<AdminShop[]>("/admin/shops");

export const getAdminPartners = () =>
  adminRequest<AdminPartner[]>("/admin/delivery-partners");

export const confirmAdminOrder = (id: string) =>
  adminRequest(`/admin/orders/${id}/confirm`, "PATCH");

export const assignOrderShop = (id: string, shopId: string) =>
  adminRequest(`/admin/orders/${id}/shop`, "PATCH", { shopId });

export const assignOrderPartner = (
  id: string,
  deliveryPartnerId: string
) =>
  adminRequest(`/admin/orders/${id}/assign-delivery`, "POST", {
    deliveryPartnerId,
  });

export const getAdminNotifications = () =>
  adminRequest<AdminNotificationsResponse>("/notifications?unreadOnly=true&limit=50");

export const markAdminNotificationRead = (id: string) =>
  adminRequest<void>(`/notifications/${id}/read`, "PATCH");
