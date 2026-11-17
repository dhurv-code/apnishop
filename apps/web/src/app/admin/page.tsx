
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AdminStats,
  AdminOrder,
  AdminShop,
  AdminPartner,
  AdminNotification,
  getAdminStats,
  getAdminOrders,
  getAdminShops,
  getAdminPartners,
  confirmAdminOrder,
  assignOrderShop,
  assignOrderPartner,
  getAdminNotifications,
  markAdminNotificationRead,
} from "@/lib/admin";

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function getDeliveryAddress(order: AdminOrder) {
  return [
    order.addressLine1,
    order.addressLine2,
    order.locality,
    order.landmark ? `Near ${order.landmark}` : null,
    order.city,
    order.district,
    order.state,
    order.postalCode,
  ].filter(Boolean).join(", ");
}

const initialStats: AdminStats = {
  totalOrders: 0,
  newOrders: 0,
  inProgressOrders: 0,
  deliveredOrders: 0,
  cancelledOrders: 0,
  activeShops: 0,
  activeDeliveryPartners: 0,
};

export default function AdminDashboard() {
  const router = useRouter();

  const [stats, setStats] = useState(initialStats);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [shops, setShops] = useState<AdminShop[]>([]);
  const [partners, setPartners] = useState<AdminPartner[]>([]);

  const [shopSelections, setShopSelections] = useState<Record<string, string>>({});
  const [partnerSelections, setPartnerSelections] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [adminAlerts, setAdminAlerts] = useState<AdminNotification[]>([]);
  const [alertToast, setAlertToast] = useState<AdminNotification | null>(null);
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(false);
  const knownAlertIds = useRef<Set<string> | null>(null);

  const loadDashboard = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError("");

      const [dashboard, orderList, shopList, partnerList] =
        await Promise.all([
          getAdminStats(),
          getAdminOrders(),
          getAdminShops(),
          getAdminPartners(),
        ]);

      setStats(dashboard);
      setOrders(orderList);
      setShops(shopList);
      setPartners(partnerList);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load dashboard.";

      if (message.includes("Authentication required") ||
        message.includes("Administrator access required")) {
        router.replace("/login");
        return;
      }

      setError(message);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [router]);

  const refreshAdminAlerts = useCallback(async () => {
    try {
      const response = await getAdminNotifications();
      const orderAlerts = response.items.filter(
        (item) => item.type === "ADMIN_ALERT" && item.relatedOrderId
      );
      setAdminAlerts(orderAlerts);

      if (knownAlertIds.current === null) {
        knownAlertIds.current = new Set(orderAlerts.map((item) => item.id));
        if (orderAlerts.length > 0) {
          setAlertToast(orderAlerts[0]);
        }
        return;
      }

      const freshAlerts = orderAlerts.filter(
        (item) => !knownAlertIds.current?.has(item.id)
      );
      for (const item of orderAlerts) knownAlertIds.current.add(item.id);

      if (freshAlerts.length > 0) {
        const newest = freshAlerts[0];
        setAlertToast(newest);

        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new Notification("New ApnaBasket order", {
            body: newest.body,
            tag: newest.id,
          });
        }
      }
    } catch (err) {
      // Keep the order dashboard usable if notifications are temporarily unavailable.
      console.error("Unable to refresh admin order alerts:", err);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, reload]);

  useEffect(() => {
    void refreshAdminAlerts();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadDashboard(false);
        void refreshAdminAlerts();
      }
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [loadDashboard, refreshAdminAlerts]);

  async function reviewAdminAlert(alert: AdminNotification) {
    try {
      await markAdminNotificationRead(alert.id);
      setAdminAlerts((current) => current.filter((item) => item.id !== alert.id));
      setAlertToast((current) => current?.id === alert.id ? null : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open order alert.");
    }

    if (alert.relatedOrderId) {
      document.getElementById(`order-${alert.relatedOrderId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }

  async function enableBrowserAlerts() {
    if (!("Notification" in window)) {
      setNotice("This browser does not support desktop notifications. Keep the admin dashboard open to see in-app alerts.");
      return;
    }

    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    setBrowserAlertsEnabled(enabled);
    setNotice(
      enabled
        ? "Desktop order alerts enabled for this browser."
        : "Browser notifications were not enabled. In-app alerts will still appear while the admin dashboard is open."
    );
  }

  async function performAction(
    id: string,
    action: () => Promise<unknown>,
    successMessage: string
  ) {
    try {
      setBusyId(id);
      setError("");
      setNotice("");

      await action();

      setNotice(successMessage);
      setReload((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete action."
      );
    } finally {
      setBusyId(null);
    }
  }

  const statCards = [
    ["Total orders", stats.totalOrders, "🧾"],
    ["New orders", stats.newOrders, "📥"],
    ["In progress", stats.inProgressOrders, "🚚"],
    ["Delivered", stats.deliveredOrders, "✅"],
    ["Cancelled", stats.cancelledOrders, "✕"],
    ["Active shops", stats.activeShops, "🏪"],
    ["Delivery partners", stats.activeDeliveryPartners, "🛵"],
  ] as const;

  return (
    <main className="min-h-screen bg-[#f5f8f5]">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-8">
          <a
            href="/admin/catalog"
            className="rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white"
          >
            Manage Shops & Products →
          </a>
          <div>
            <h1 className="text-xl font-extrabold text-green-800">
              ApnaBasket Admin
            </h1>
            <p className="text-xs text-gray-500">
              Operations and order management
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setReload((value) => value + 1)}
              className="rounded-lg border px-4 py-2 text-sm font-semibold"
            >
              Refresh
            </button>

            <button
              onClick={() => router.push("/")}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Customer site
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <h2 className="text-2xl font-extrabold">Dashboard overview</h2>
        <p className="mt-1 text-sm text-gray-500">
          Monitor ApnaBasket's daily operations.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void enableBrowserAlerts()}
            className="rounded-lg border border-green-700 px-3 py-2 text-sm font-semibold text-green-800"
          >
            {browserAlertsEnabled ? "Desktop alerts enabled" : "Enable desktop order alerts"}
          </button>
          <span className="text-xs text-gray-500">
            The dashboard also checks for new orders every 15 seconds while this page is open.
          </span>
        </div>

        {alertToast && (
          <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div>
              <p className="font-bold text-amber-950">New customer order — confirmation required</p>
              <p className="mt-1 text-sm text-amber-900">{alertToast.body}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void reviewAdminAlert(alertToast)}
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white"
              >
                Review order
              </button>
              <button
                type="button"
                onClick={() => setAlertToast(null)}
                className="rounded-lg border border-amber-400 px-3 py-2 text-sm font-semibold text-amber-950"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {adminAlerts.length > 0 && (
          <section className="mt-5 rounded-xl border border-amber-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold text-gray-900">Orders awaiting your review</h3>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                {adminAlerts.length} unread
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {adminAlerts.map((alert) => (
                <div key={alert.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 p-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{alert.title}</p>
                    <p className="text-sm text-gray-700">{alert.body}</p>
                    <p className="mt-1 text-xs text-gray-500">{new Date(alert.createdAt).toLocaleString("en-IN")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void reviewAdminAlert(alert)}
                    className="rounded-lg bg-green-700 px-3 py-2 text-sm font-bold text-white"
                  >
                    Review & confirm
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {notice && (
          <div className="mt-5 rounded-xl bg-green-50 p-4 text-sm text-green-800">
            {notice}
          </div>
        )}

        {error && (
          <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {statCards.map(([label, value, icon]) => (
            <div
              key={label}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <span className="text-2xl">{icon}</span>
              <p className="mt-4 text-2xl font-extrabold">{loading ? "—" : value}</p>
              <p className="mt-1 text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold">Recent orders</h2>
              <p className="mt-1 text-sm text-gray-500">
                Review, confirm and assign incoming orders.
              </p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-2 text-xs font-bold text-green-800">
              {orders.length} records
            </span>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white p-10 text-center text-gray-500">
              Loading dashboard...
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
              <p className="text-4xl">📦</p>
              <p className="mt-3 font-bold">No customer orders yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <article
                  key={order.id}
                  id={`order-${order.id}`}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="font-extrabold">{order.orderNumber}</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        {order.customerName || "Customer"} · {order.customerPhone}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(order.createdAt).toLocaleString("en-IN")}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                        {order.status}
                      </span>
                      <p className="mt-3 font-extrabold">
                        {money(order.estimatedTotalPaise)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {order.paymentMethod} · {order.paymentStatus}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-800">
                      Delivery address
                    </p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {order.recipientName || order.customerName || "Customer"} · {order.recipientPhone || order.customerPhone}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-800">
                      {getDeliveryAddress(order)}
                    </p>
                    {order.deliveryInstructions && (
                      <p className="mt-2 text-sm text-gray-700">
                        Instructions: {order.deliveryInstructions}
                      </p>
                    )}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(getDeliveryAddress(order))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex text-sm font-bold text-blue-800 underline"
                    >
                      Open delivery location in Google Maps ↗
                    </a>
                  </div>

                  {order.shopName && (
                    <p className="mt-3 text-sm text-gray-600">
                      Shop: <strong>{order.shopName}</strong>
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-3">
                    {order.status === "PLACED" && (
                      <button
                        disabled={busyId === order.id}
                        onClick={() =>
                          void performAction(
                            order.id,
                            () => confirmAdminOrder(order.id),
                            "Order confirmed."
                          )
                        }
                        className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        Confirm order
                      </button>
                    )}

                    {order.status === "CONFIRMED" && (
                      <>
                        <select
                          value={shopSelections[order.id] || order.assignedShopId || ""}
                          onChange={(event) =>
                            setShopSelections((old) => ({
                              ...old,
                              [order.id]: event.target.value,
                            }))
                          }
                          className="rounded-lg border px-3 py-2 text-sm"
                        >
                          <option value="">Select shop</option>
                          {shops.map((shop) => (
                            <option key={shop.id} value={shop.id}>
                              {shop.name}
                            </option>
                          ))}
                        </select>

                        <button
                          disabled={
                            busyId === order.id ||
                            !shopSelections[order.id]
                          }
                          onClick={() =>
                            void performAction(
                              order.id,
                              () => assignOrderShop(
                                order.id,
                                shopSelections[order.id]
                              ),
                              "Shop assigned."
                            )
                          }
                          className="rounded-lg border border-green-700 px-4 py-2 text-sm font-bold text-green-800 disabled:opacity-50"
                        >
                          Assign shop
                        </button>
                      </>
                    )}

                    {order.status === "CONFIRMED" && order.assignedShopId && partners.every((partner) => !partner.isAvailable) && (
                      <p className="w-full rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                        No delivery partner is currently available. Ask a partner to open /delivery and switch their status to Available, then refresh this dashboard.
                      </p>
                    )}

                    {order.status === "CONFIRMED" && order.assignedShopId && (
                      <>
                        <select
                          value={partnerSelections[order.id] || ""}
                          onChange={(event) =>
                            setPartnerSelections((old) => ({
                              ...old,
                              [order.id]: event.target.value,
                            }))
                          }
                          className="rounded-lg border px-3 py-2 text-sm"
                        >
                          <option value="">Select available partner</option>
                          {partners.map((partner) => (
                            <option key={partner.id} value={partner.id} disabled={!partner.isAvailable}>
                              {partner.fullName || partner.phone} — {partner.isAvailable ? "Available" : "Offline"}
                            </option>
                          ))}
                        </select>

                        <button
                          disabled={
                            busyId === order.id ||
                            !partnerSelections[order.id]
                          }
                          onClick={() =>
                            void performAction(
                              order.id,
                              () => assignOrderPartner(
                                order.id,
                                partnerSelections[order.id]
                              ),
                              "Delivery partner assigned."
                            )
                          }
                          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          Assign delivery
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
