"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { detectFile, IMAGE_TYPES } from "@/lib/files";
import { normalizePhone } from "@/lib/phone";
import { allow, clientIp } from "@/lib/rate-limit";
import { DOC_KINDS, DRIVER_PHOTO_MAX, modelYears } from "@/lib/driver-docs";

export type JoinField = "name" | "phone" | "password" | "vehicle" | "model" | "plate" | "color" | "photo" | "agree";
export type JoinState = {
  done?: boolean;
  errors?: Partial<Record<JoinField, true>>;
  formError?: "fileType" | "tooBig" | "exists" | "throttled" | "generic";
  missing?: string[];
  values?: Record<string, string>;
};

const schema = z.object({
  name: z.string().trim().min(3).max(80),
  password: z.string().min(8).max(100),
  vehicleId: z.coerce.number().int().positive(),
  carModel: z.string().refine((y) => modelYears().includes(y)),
  plateNumber: z.string().trim().min(2).max(30),
  carColor: z.string().trim().min(2).max(30),
});

/** A driver applies from the website. The application waits in Admin -> Drivers until approved. */
export async function applyAsDriver(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const text = (k: string) => String(formData.get(k) ?? "");
  const values = { name: text("name"), phone: text("phone"), vehicleId: text("vehicleId"), carModel: text("carModel"), plateNumber: text("plateNumber"), carColor: text("carColor") };

  const errors: JoinState["errors"] = {};
  const parsed = schema.safeParse({ ...values, password: text("password") });
  if (!parsed.success)
    for (const i of parsed.error.issues)
      errors[({ name: "name", password: "password", vehicleId: "vehicle", carModel: "model", plateNumber: "plate", carColor: "color" } as const)[i.path[0] as "name"] ?? "name"] = true;
  const phone = normalizePhone(values.phone);
  if (!phone) errors.phone = true;
  if (formData.get("agree") !== "on") errors.agree = true;

  // photos: every one required, a real image, under 1 MB
  const files: Record<string, { mime: string; data: Buffer }> = {};
  const missing: string[] = [];
  for (const kind of ["photo", ...DOC_KINDS]) {
    const f = formData.get(kind);
    if (!(f instanceof File) || f.size === 0) {
      missing.push(kind);
      continue;
    }
    if (f.size > DRIVER_PHOTO_MAX) return { formError: "tooBig", errors, missing: [kind], values };
    const data = Buffer.from(await f.arrayBuffer());
    const type = detectFile(data, IMAGE_TYPES);
    if (!type) return { formError: "fileType", errors, missing: [kind], values };
    files[kind] = { mime: type.mime, data };
  }
  if (missing.length) errors.photo = true;
  if (Object.keys(errors).length || !parsed.success || !phone) return { errors, missing, values };
  const d = parsed.data;

  const vehicle = await db.query.vehicles.findFirst({ where: and(eq(s.vehicles.id, d.vehicleId), eq(s.vehicles.active, true)) });
  if (!vehicle) return { errors: { vehicle: true }, values };

  // one application per number (a rejected one may apply again)
  const existing = await db.query.drivers.findFirst({ where: eq(s.drivers.phone, phone) });
  const account = await db.query.adminUsers.findFirst({ where: eq(s.adminUsers.email, phone) });
  if ((existing && existing.status !== "rejected") || (account && account.driverId !== existing?.id)) return { formError: "exists", values };

  if (!allow(`driver-apply:${clientIp(await headers())}`, 5, 60 * 60_000)) return { formError: "throttled", values };

  try {
    const passwordHash = await bcrypt.hash(d.password, 12);
    await db.transaction(async (tx) => {
      const driverValues = {
        name: d.name,
        phone,
        plateNumber: d.plateNumber,
        carType: vehicle.nameAr,
        carModel: d.carModel,
        carColor: d.carColor,
        vehicleId: vehicle.id,
        photo: files.photo.data,
        photoMime: files.photo.mime,
        status: "pending" as const,
        active: false,
        rejectReason: null,
        notes: "",
        updatedAt: new Date(),
      };
      let driverId: number;
      if (existing) {
        await tx.update(s.drivers).set(driverValues).where(eq(s.drivers.id, existing.id));
        await tx.delete(s.driverDocuments).where(eq(s.driverDocuments.driverId, existing.id));
        driverId = existing.id;
      } else {
        const [row] = await tx.insert(s.drivers).values(driverValues).returning({ id: s.drivers.id });
        driverId = row.id;
      }
      await tx.insert(s.driverDocuments).values(DOC_KINDS.map((kind) => ({ driverId, kind, mime: files[kind].mime, size: files[kind].data.length, data: files[kind].data })));
      // the sign-in account exists from now on, but stays switched off until the application is approved
      if (account) await tx.update(s.adminUsers).set({ name: d.name, passwordHash, active: false }).where(eq(s.adminUsers.id, account.id));
      else await tx.insert(s.adminUsers).values({ email: phone, name: d.name, passwordHash, role: "driver", driverId, active: false });
    });
  } catch (e) {
    console.error("driver application failed", e);
    return { formError: "generic", values };
  }
  return { done: true };
}
