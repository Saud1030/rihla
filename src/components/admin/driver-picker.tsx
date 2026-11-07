"use client";

import { useMemo, useState } from "react";

export type PickDriver = {
  id: number;
  name: string;
  phone: string;
  plateNumber: string;
  carType: string;
  carModel: string;
  vehicleId: number | null;
};

const norm = (v: string) =>
  v
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .trim();

/**
 * Choosing the driver of a booking: search by name, phone or plate, and filter by the car he drives.
 * The car of the booking is chosen first, so only drivers with that car show; "all cars" shows everyone.
 */
export function DriverPicker({
  drivers,
  vehicles,
  bookingVehicleId,
  bookingVehicleName,
}: {
  drivers: PickDriver[];
  vehicles: { id: number; name: string }[];
  bookingVehicleId: number | null;
  bookingVehicleName: string;
}) {
  const matching = drivers.filter((d) => bookingVehicleId != null && d.vehicleId === bookingVehicleId);
  // car filter: a fleet car id, "type:<free text car type>" for drivers not linked to a fleet car, or "all"
  const [car, setCar] = useState<string>(matching.length ? String(bookingVehicleId) : "all");
  const [q, setQ] = useState("");
  const [value, setValue] = useState("");

  const carOptions = useMemo(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const d of drivers) {
      const key = d.vehicleId != null ? String(d.vehicleId) : `type:${d.carType.trim()}`;
      const label = d.vehicleId != null ? (vehicles.find((v) => v.id === d.vehicleId)?.name ?? d.carType) : d.carType.trim() || "—";
      const c = counts.get(key);
      if (c) c.n++;
      else counts.set(key, { label, n: 1 });
    }
    return [...counts.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, "ar"));
  }, [drivers, vehicles]);

  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const list = drivers.filter((d) => {
      if (car !== "all") {
        const key = d.vehicleId != null ? String(d.vehicleId) : `type:${d.carType.trim()}`;
        if (key !== car) return false;
      }
      const hay = norm(`${d.name} ${d.phone} ${d.plateNumber} ${d.carType} ${d.carModel}`);
      return words.every((w) => hay.includes(w));
    });
    // the drivers with the booking's car first
    return list.sort((a, b) => Number(b.vehicleId === bookingVehicleId) - Number(a.vehicleId === bookingVehicleId));
  }, [drivers, car, q, bookingVehicleId]);

  const selectedHidden = value && !shown.some((d) => String(d.id) === value);

  return (
    <div className="space-y-2" data-testid="driver-picker">
      <div className="grid gap-2">
        <label className="block text-sm">
          <span className="block mb-1 font-medium">بحث بالاسم أو الجوال أو اللوحة</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثال: محمد" className="field" data-testid="driver-search" />
        </label>
        <label className="block text-sm">
          <span className="block mb-1 font-medium">نوع السيارة</span>
          <select value={car} onChange={(e) => setCar(e.target.value)} className="field" data-testid="driver-car-filter">
            <option value="all">كل السيارات ({drivers.length})</option>
            {carOptions.map(([key, { label, n }]) => (
              <option key={key} value={key}>
                {label}
                {key === String(bookingVehicleId) ? " — سيارة الحجز" : ""} ({n})
              </option>
            ))}
          </select>
        </label>
      </div>
      {bookingVehicleId != null && (
        <p className="text-xs text-muted">
          سيارة الحجز: <b className="text-ink">{bookingVehicleName}</b>
          {matching.length ? ` — ${matching.length} سائق بنفس السيارة` : " — لا يوجد سائق مربوط بهذه السيارة، فتظهر كل السيارات"}
        </p>
      )}
      <select name="driverId" required value={selectedHidden ? "" : value} onChange={(e) => setValue(e.target.value)} className="field" aria-label="السائق">
        <option value="" disabled>
          {shown.length ? `اختر من ${shown.length} سائق` : "لا يوجد سائق بهذا البحث"}
        </option>
        {shown.map((d) => (
          <option key={d.id} value={d.id}>
            {d.vehicleId != null && d.vehicleId === bookingVehicleId ? "★ " : ""}
            {d.name} · {d.carType}
            {d.carModel ? ` ${d.carModel}` : ""} · {d.plateNumber}
          </option>
        ))}
      </select>
    </div>
  );
}
