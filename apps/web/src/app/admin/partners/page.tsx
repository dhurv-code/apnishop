"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createAdminDeliveryPartner,
  getAdminDeliveryPartners,
  updateAdminDeliveryPartner,
} from "@/lib/admin-partners";
import type { AdminDeliveryPartner, DeliveryPartnerStatus } from "@/lib/admin-partners";

const statusOptions: DeliveryPartnerStatus[] = [
  "PENDING",
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
];

export default function AdminPartnersPage() {
  const [partners, setPartners] = useState<AdminDeliveryPartner[]>([]);
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadPartners = useCallback(async () => {
    try {
      const result = await getAdminDeliveryPartners();
      setPartners(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load partners.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPartners();
  }, [loadPartners]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await createAdminDeliveryPartner({
        phone,
        vehicleType: vehicleType.trim() || null,
        vehicleNumber: vehicleNumber.trim() || null,
      });
      setPhone("");
      setVehicleType("");
      setVehicleNumber("");
      setMessage("Partner added. Review their details and activate the account when verified.");
      await loadPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add partner.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(partnerId: string, status: DeliveryPartnerStatus) {
    setBusyId(partnerId);
    setError("");
    setMessage("");

    try {
      await updateAdminDeliveryPartner(partnerId, { status });
      setMessage("Partner status updated.");
      await loadPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update partner.");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = partners.filter((p) => p.status === "PENDING").length;
  const activeCount = partners.filter((p) => p.status === "ACTIVE").length;
  const availableCount = partners.filter((p) => p.status === "ACTIVE" && p.isAvailable).length;

  if (loading) return <main className="p-8">Loading delivery partners...</main>;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-green-700">ApnaBasket Admin</p>
            <h1 className="text-2xl font-bold">Delivery partner management</h1>
            <p className="mt-1 text-sm text-gray-500">
              Add registered users, verify them, and control partner access.
            </p>
          </div>
          <a href="/admin" className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold">
            Back to admin dashboard
          </a>
        </header>

        {message && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-gray-500">Total partners</p>
            <p className="text-2xl font-bold">{partners.length}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-gray-500">Pending approval</p>
            <p className="text-2xl font-bold">{pendingCount}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-gray-500">Active / available</p>
            <p className="text-2xl font-bold">{activeCount} / {availableCount}</p>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-bold">Add a delivery partner</h2>
          <p className="mt-1 text-sm text-gray-500">
            The person must have already registered on ApnaBasket using this phone number.
            New partner profiles start as pending and cannot receive orders until approved.
          </p>

          <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Registered mobile number
              <input
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="10-digit mobile number"
                inputMode="tel"
                className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              Vehicle type (optional)
              <input
                value={vehicleType}
                onChange={(event) => setVehicleType(event.target.value)}
                placeholder="Bike, bicycle, scooter"
                className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              Vehicle number (optional)
              <input
                value={vehicleNumber}
                onChange={(event) => setVehicleNumber(event.target.value)}
                placeholder="UP XX AB 1234"
                className="mt-1 w-full rounded-lg border px-3 py-2 font-normal uppercase"
              />
            </label>
            <div className="flex items-end">
              <button
                disabled={saving}
                className="w-full rounded-lg bg-green-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Adding partner..." : "Add partner for approval"}
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Registered partners</h2>
          {partners.length === 0 ? (
            <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
              No delivery partners have been added yet.
            </div>
          ) : (
            partners.map((partner) => (
              <article key={partner.id} className="flex flex-col gap-4 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-bold">{partner.fullName || "Name not provided"}</h3>
                  <p className="text-sm text-gray-600">{partner.phone}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {partner.vehicleType || "Vehicle not added"}
                    {partner.vehicleNumber ? ` · ${partner.vehicleNumber}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Account: {partner.userStatus} · Availability: {partner.isAvailable ? "Online" : "Offline"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">
                    {partner.status}
                  </span>
                  <select
                    aria-label={`Change status for ${partner.fullName || partner.phone}`}
                    value={partner.status}
                    disabled={busyId === partner.id}
                    onChange={(event) => changeStatus(partner.id, event.target.value as DeliveryPartnerStatus)}
                    className="rounded-lg border bg-white px-3 py-2 text-sm"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
