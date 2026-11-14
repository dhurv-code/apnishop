const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export type AppNotification = {
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
    throw new Error(result.message ?? "Unable to complete notification request.");
  }

  return result as T;
}

export function getNotifications(options: { unreadOnly?: boolean; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (options.unreadOnly) params.set("unreadOnly", "true");
  if (options.limit) params.set("limit", String(options.limit));

  const query = params.toString();
  const suffix = query ? `?${query}` : "";

  return request<{
    success: boolean;
    data: { items: AppNotification[]; unreadCount: number };
  }>(`/notifications${suffix}`);
}

export function markNotificationRead(id: string) {
  return request(`/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead() {
  return request("/notifications/read-all", { method: "PATCH" });
}
