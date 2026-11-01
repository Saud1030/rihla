import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Vehicle } from "@/db/schema";
import { hourlyPrice, type HourPackage } from "./policy";

/** A car with a driver for N hours in a city: that city's price for the car, else the car's own hourly price */
export async function cityHourlyPrices(city: string, hours: HourPackage, vehicles: Pick<Vehicle, "id" | "hourly10" | "hourly12" | "hourly24">[]) {
  const rows = await db
    .select({ vehicleId: s.cityHourlyPrices.vehicleId, price: s.cityHourlyPrices.price })
    .from(s.cityHourlyPrices)
    .where(and(eq(s.cityHourlyPrices.city, city), eq(s.cityHourlyPrices.hours, hours)));
  return new Map(vehicles.map((v) => [v.id, rows.find((r) => r.vehicleId === v.id)?.price ?? hourlyPrice(v, hours)]));
}
