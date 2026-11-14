
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Address,
  AddressInput,
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from "@/lib/customer";

const emptyForm: AddressInput = {
  recipientName: "",
  phone: "",
  addressType: "HOME",
  addressLine1: "",
  addressLine2: "",
  locality: "",
  landmark: "",
  city: "Shahabad",
  district: "Rampur",
  state: "Uttar Pradesh",
  postalCode: "",
  deliveryInstructions: "",
  isDefault: false,
};

export default function AddressesPage() {
  const router = useRouter();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [form, setForm] = useState<AddressInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAddresses = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await getAddresses();
      setAddresses(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to load addresses.";

      if (message.includes("Authentication required")) {
        router.replace("/login");
        return;
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  function changeField<K extends keyof AddressInput>(
    key: K,
    value: AddressInput[K]
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function startEditing(address: Address) {
    setEditingId(address.id);
    setForm({
      recipientName: address.recipientName,
      phone: address.phone,
      addressType: address.addressType,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 || "",
      locality: address.locality,
      landmark: address.landmark || "",
      city: address.city,
      district: address.district,
      state: address.state,
      postalCode: address.postalCode,
      deliveryInstructions: address.deliveryInstructions || "",
      isDefault: address.isDefault,
    });
    setShowForm(true);
    setNotice("");
  }

  function startNewAddress() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      city: "Shahabad",
      district: "Rampur",
      state: "Uttar Pradesh",
      isDefault: addresses.length === 0,
    });
    setShowForm(true);
    setNotice("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (editingId) {
        await updateAddress(editingId, form);
        setNotice("Address updated successfully.");
      } else {
        await createAddress(form);
        setNotice("Address added successfully.");
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);

      await loadAddresses();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save address."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDefault(id: string) {
    try {
      setError("");
      await setDefaultAddress(id);
      setNotice("Default address updated.");
      await loadAddresses();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update address."
      );
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this delivery address?")) return;

    try {
      setError("");
      await deleteAddress(id);
      setNotice("Address deleted.");
      await loadAddresses();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete address."
      );
    }
  }

  const inputClass =
    "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-700 focus:ring-2 focus:ring-green-100";

  return (
    <main className="min-h-screen bg-[#f8faf8] px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="font-bold text-green-800">
          ← ApnaBasket
        </a>

        <div className="mt-7 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">My addresses</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your grocery delivery locations.
            </p>
          </div>

          {!showForm && (
            <button
              onClick={startNewAddress}
              className="rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white"
            >
              + Add address
            </button>
          )}
        </div>

        {notice && (
          <p role="status" className="mt-5 rounded-xl bg-green-50 p-3 text-sm text-green-800">
            {notice}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mt-7 space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-bold">
              {editingId ? "Edit address" : "Add delivery address"}
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold">Recipient name</label>
                <input
                  required
                  maxLength={120}
                  value={form.recipientName}
                  onChange={(e) => changeField("recipientName", e.target.value)}
                  className={inputClass}
                  placeholder="Full name"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Mobile number</label>
                <input
                  required
                  value={form.phone}
                  onChange={(e) => changeField("phone", e.target.value)}
                  className={inputClass}
                  placeholder="9876543210"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Address type</label>
                <select
                  value={form.addressType}
                  onChange={(e) =>
                    changeField("addressType", e.target.value as AddressInput["addressType"])
                  }
                  className={inputClass}
                >
                  <option value="HOME">Home</option>
                  <option value="WORK">Work</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">PIN code</label>
                <input
                  required
                  maxLength={6}
                  inputMode="numeric"
                  value={form.postalCode}
                  onChange={(e) => changeField("postalCode", e.target.value.replace(/\D/g, ""))}
                  className={inputClass}
                  placeholder="244922"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">House number and street</label>
              <input
                required
                value={form.addressLine1}
                onChange={(e) => changeField("addressLine1", e.target.value)}
                className={inputClass}
                placeholder="House number, street"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">Address details (optional)</label>
              <input
                value={form.addressLine2}
                onChange={(e) => changeField("addressLine2", e.target.value)}
                className={inputClass}
                placeholder="Apartment, floor, etc."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold">Locality</label>
                <input
                  required
                  value={form.locality}
                  onChange={(e) => changeField("locality", e.target.value)}
                  className={inputClass}
                  placeholder="Area or locality"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">Landmark</label>
                <input
                  value={form.landmark}
                  onChange={(e) => changeField("landmark", e.target.value)}
                  className={inputClass}
                  placeholder="Nearby landmark"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">City</label>
                <input
                  required
                  value={form.city}
                  onChange={(e) => changeField("city", e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">District</label>
                <input
                  required
                  value={form.district}
                  onChange={(e) => changeField("district", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold">Delivery instructions</label>
              <textarea
                value={form.deliveryInstructions}
                onChange={(e) => changeField("deliveryInstructions", e.target.value)}
                className={inputClass}
                rows={2}
                placeholder="Directions for the delivery partner"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                disabled={saving}
                type="submit"
                className="rounded-xl bg-green-700 px-6 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update address" : "Save address"}
              </button>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border px-6 py-3 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <section className="mt-7 space-y-4">
          {loading ? (
            <p className="rounded-2xl bg-white p-8 text-center text-gray-500">
              Loading addresses...
            </p>
          ) : addresses.length === 0 && !showForm ? (
            <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
              <div className="text-4xl">📍</div>
              <h2 className="mt-3 font-bold">No saved addresses</h2>
              <p className="mt-2 text-sm text-gray-500">
                Add an address to prepare for checkout.
              </p>
              <button
                onClick={startNewAddress}
                className="mt-5 rounded-xl bg-green-700 px-5 py-3 text-sm font-bold text-white"
              >
                Add your first address
              </button>
            </div>
          ) : (
            addresses.map((address) => (
              <article
                key={address.id}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {address.addressType === "HOME" ? "🏠" : address.addressType === "WORK" ? "🏢" : "📍"}
                    </span>
                    <h3 className="font-bold">{address.recipientName}</h3>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">
                      {address.addressType}
                    </span>
                  </div>

                  {address.isDefault && (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                      DEFAULT
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm leading-6 text-gray-600">
                  {address.addressLine1}
                  {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                  , {address.locality}
                  {address.landmark ? `, near ${address.landmark}` : ""}
                  , {address.city}, {address.district}, {address.state} - {address.postalCode}
                </p>

                <p className="mt-2 text-sm text-gray-500">
                  Mobile: {address.phone}
                </p>

                <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
                  <button onClick={() => startEditing(address)} className="text-green-700">
                    Edit
                  </button>

                  {!address.isDefault && (
                    <button onClick={() => handleDefault(address.id)} className="text-green-700">
                      Make default
                    </button>
                  )}

                  <button onClick={() => handleDelete(address.id)} className="text-red-600">
                    Delete
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
