
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000/api/v1";

export type CustomerUser = {
  id: string;
  phone: string;
  fullName: string | null;
  role: "CUSTOMER" | "ADMIN" | "DELIVERY_PARTNER" | "SHOPKEEPER";
};

type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
};

async function authRequest<T>(
  endpoint: string,
  method: "GET" | "POST",
  body?: object
): Promise<ApiResponse<T>> {
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

  const result = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !result.success) {
    throw new Error(
      result.message || "Authentication request failed."
    );
  }

  return result;
}

export async function requestOtp(
  phone: string,
  fullName?: string
) {
  return authRequest<void>(
    "/auth/request-otp",
    "POST",
    { phone, fullName: fullName || undefined }
  );
}

export async function verifyOtp(
  phone: string,
  otp: string,
  fullName?: string
) {
  const response = await authRequest<CustomerUser>(
    "/auth/verify-otp",
    "POST",
    { phone, otp, fullName: fullName || undefined }
  );

  if (!response.data) {
    throw new Error("Customer information was not returned.");
  }

  return response.data;
}

export async function getCurrentUser(): Promise<CustomerUser | null> {
  try {
    const response = await authRequest<CustomerUser>(
      "/auth/me",
      "GET"
    );

    return response.data ?? null;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Authentication required."
    ) {
      return null;
    }

    throw error;
  }
}

export async function logoutCustomer() {
  return authRequest<void>("/auth/logout", "POST");
}
