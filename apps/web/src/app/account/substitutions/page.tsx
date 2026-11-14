"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    getPendingSubstitutions,
    PendingSubstitution,
    respondToSubstitution,
} from "@/lib/substitutions";

function money(paise: number) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    }).format(paise / 100);
}

export default function SubstitutionsPage() {
    const router = useRouter();
    const [items, setItems] = useState<PendingSubstitution[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [message, setMessage] = useState("");

    const load = useCallback(async () => {
        try {
            const result = await getPendingSubstitutions();
            setItems(result.data);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "Unable to load replacement requests.";
            setMessage(errorMessage);
            if (errorMessage.toLowerCase().includes("log in")) {
                router.replace("/login");
            }
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        void load();
    }, [load]);

    async function respond(
        item: PendingSubstitution,
        decision: "APPROVE" | "REJECT"
    ) {
        setBusyId(item.substitutionId);
        setMessage("");

        try {
            await respondToSubstitution(
                item.orderId,
                item.substitutionId,
                decision
            );

            setMessage(
                decision === "APPROVE"
                    ? "Replacement approved successfully."
                    : "Replacement rejected successfully."
            );
            await load();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to submit your decision.");
        } finally {
            setBusyId(null);
        }
    }

    if (loading) {
        return <main className="p-8">Loading replacement requests...</main>;
    }

    return (
        <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
            <div className="mx-auto max-w-3xl space-y-6">
                <header>
                    <p className="text-sm font-semibold text-green-700">ApnaBasket</p>
                    <h1 className="text-2xl font-bold">Replacement approvals</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        Review alternatives suggested by your delivery partner before they purchase them.
                    </p>
                </header>

                {message && (
                    <div className="rounded-lg border bg-white p-3 text-sm" role="status">
                        {message}
                    </div>
                )}

                {items.length === 0 && (
                    <div className="rounded-xl border bg-white p-8 text-center">
                        <h2 className="font-semibold">No pending approvals</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            There are currently no replacement requests waiting for your decision.
                        </p>
                    </div>
                )}

                {items.map((item) => {
                    const proposedTotal = Math.round(
                        item.replacementUnitPricePaise * item.replacementQuantity
                    );

                    return (
                        <article
                            key={item.substitutionId}
                            className="space-y-4 rounded-xl border bg-white p-5 shadow-sm"
                        >
                            <div>
                                <p className="text-xs font-semibold uppercase text-gray-500">
                                    Order {item.orderNumber}
                                </p>
                                <h2 className="mt-1 text-lg font-bold">
                                    Original item: {item.originalProductName}
                                </h2>
                                <p className="text-sm text-gray-500">
                                    Requested quantity: {item.requestedQuantity} {item.originalUnitLabel}
                                </p>
                            </div>

                            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                                <p className="text-xs font-semibold uppercase text-green-800">
                                    Suggested replacement
                                </p>
                                <h3 className="mt-1 font-bold">{item.replacementName}</h3>
                                <p className="text-sm text-gray-700">
                                    Quantity: {item.replacementQuantity} {item.replacementUnitLabel}
                                </p>
                                <p className="text-sm text-gray-700">
                                    Proposed unit price: {money(item.replacementUnitPricePaise)}
                                </p>
                                <p className="mt-1 text-sm font-semibold">
                                    Proposed total: {money(proposedTotal)}
                                </p>
                                {item.reason && (
                                    <p className="mt-2 text-sm text-gray-600">
                                        Partner's note: {item.reason}
                                    </p>
                                )}
                            </div>

                            <p className="text-xs text-gray-500">
                                Approval allows the partner to buy up to this quantity and unit price.
                                The final bill uses the actual purchased quantity and price, which cannot
                                exceed the approved limits.
                            </p>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    disabled={busyId === item.substitutionId}
                                    onClick={() => void respond(item, "APPROVE")}
                                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                >
                                    {busyId === item.substitutionId ? "Submitting..." : "Approve replacement"}
                                </button>
                                <button
                                    type="button"
                                    disabled={busyId === item.substitutionId}
                                    onClick={() => void respond(item, "REJECT")}
                                    className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                                >
                                    Reject replacement
                                </button>
                            </div>
                        </article>
                    );
                })}

                <button
                    type="button"
                    onClick={() => router.push("/orders")}
                    className="text-sm font-semibold text-green-700 underline"
                >
                    Back to my orders
                </button>
            </div>
        </main>
    );
}



// "use client";

// import { useCallback, useEffect, useState } from "react";
// import { useRouter } from "next/navigation";
// import {
//   getPendingSubstitutions,
//   PendingSubstitution,
//   respondToSubstitution,
// } from "@/lib/substitutions";

// function money(paise: number) {
//   return new Intl.NumberFormat("en-IN", {
//     style: "currency",
//     currency: "INR",
//     maximumFractionDigits: 2,
//   }).format(paise / 100);
// }

// export default function SubstitutionsPage() {
//   const router = useRouter();
//   const [items, setItems] = useState<PendingSubstitution[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [busy, setBusy] = useState<string | null>(null);
//   const [message, setMessage] = useState("");

//   const load = useCallback(async () => {
//     try {
//       const result = await getPendingSubstitutions();
//       setItems(result.data);
//     } catch (error) {
//       const msg = error instanceof Error ? error.message : "Unable to load requests.";
//       setMessage(msg);

//       if (msg.toLowerCase().includes("log in")) {
//         router.replace("/login");
//       }
//     } finally {
//       setLoading(false);
//     }
//   }, [router]);

//   useEffect(() => {
//     void load();
//   }, [load]);

//   async function respond(
//     item: PendingSubstitution,
//     decision: "APPROVE" | "REJECT"
//   ) {
//     setBusy(item.substitutionId);
//     setMessage("");

//     try {
//       await respondToSubstitution(item.orderId, item.substitutionId, decision);
//       setMessage(
//         decision === "APPROVE"
//           ? "Replacement approved. The partner can now purchase it."
//           : "Replacement rejected. The item will not be charged."
//       );
//       await load();
//     } catch (error) {
//       setMessage(error instanceof Error ? error.message : "Unable to submit decision.");
//     } finally {
//       setBusy(null);
//     }
//   }

//   if (loading) {
//     return <main className="p-8">Loading replacement requests...</main>;
//   }

//   return (
//     <main className="min-h-screen bg-gray-50 px-4 py-8">
//       <div className="mx-auto max-w-3xl space-y-6">
//         <header>
//           <p className="text-sm font-semibold text-green-700">ApnaBasket</p>
//           <h1 className="text-2xl font-bold">Replacement approvals</h1>
//           <p className="mt-1 text-sm text-gray-500">
//             Review alternatives suggested by your delivery partner.
//           </p>
//         </header>

//         {message && (
//           <div className="rounded-lg border bg-white p-3 text-sm">
//             {message}
//           </div>
//         )}

//         {items.length === 0 && (
//           <div className="rounded-xl border bg-white p-8 text-center">
//             <h2 className="font-semibold">No pending approvals</h2>
//             <p className="mt-1 text-sm text-gray-500">
//               You do not have any replacement requests to review.
//             </p>
//           </div>
//         )}

//         {items.map((item) => (
//           <article
//             key={item.substitutionId}
//             className="space-y-4 rounded-xl border bg-white p-5 shadow-sm"
//           >
//             <div>
//               <p className="text-xs font-semibold uppercase text-gray-500">
//                 Order {item.orderNumber}
//               </p>
//               <h2 className="mt-1 text-lg font-bold">
//                 Original: {item.originalProductName}
//               </h2>
//               <p className="text-sm text-gray-500">
//                 Requested: {item.requestedQuantity} {item.originalUnitLabel}
//               </p>
//             </div>

//             <div className="rounded-lg border border-green-200 bg-green-50 p-4">
//               <p className="text-xs font-semibold uppercase text-green-800">
//                 Suggested replacement
//               </p>
//               <h3 className="mt-1 font-bold">{item.replacementName}</h3>
//               <p className="text-sm text-gray-700">
//                 Quantity: {item.replacementQuantity} {item.replacementUnitLabel}
//               </p>
//               <p className="text-sm text-gray-700">
//                 Proposed unit price: {money(item.replacementUnitPricePaise)}
//               </p>
//               <p className="mt-1 text-sm font-semibold">
//                 Proposed total:{" "}
//                 {money(
//                   Math.round(
//                     item.replacementUnitPricePaise *
//                       item.replacementQuantity
//                   )
//                 )}
//               </p>
//               {item.reason && (
//                 <p className="mt-2 text-sm text-gray-600">
//                   Partner's note: {item.reason}
//                 </p>
//               )}
//             </div>

//             <p className="text-xs text-gray-500">
//               This is the partner's proposed price. The final bill will use
//               the actual purchase price recorded by the partner.
//             </p>

//             <div className="flex flex-wrap gap-3">
//               <button
//                 disabled={busy === item.substitutionId}
//                 onClick={() => respond(item, "APPROVE")}
//                 className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
//               >
//                 {busy === item.substitutionId ? "Submitting..." : "Approve replacement"}
//               </button>

//               <button
//                 disabled={busy === item.substitutionId}
//                 onClick={() => respond(item, "REJECT")}
//                 className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
//               >
//                 Reject replacement
//               </button>
//             </div>
//           </article>
//         ))}
//       </div>
//     </main>
//   );
// }