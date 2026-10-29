import type { City, Location } from "@/db/schema";
import { KIND_LABELS, LOCATION_KINDS } from "@/lib/regions";
import { Field } from "./ui";

/** Shared fields for adding and editing a destination */
export function LocationFields({ cities, l, defaultCity }: { cities: City[]; l?: Location; defaultCity?: string }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {l && <input type="hidden" name="id" value={l.id} />}
      <Field label="اسم الوجهة بالعربي">
        <input name="nameAr" required maxLength={120} defaultValue={l?.nameAr} placeholder="مثال: مطار الملك خالد الدولي" className="field" />
      </Field>
      <Field label="اسم الوجهة بالإنجليزي">
        <input name="nameEn" required maxLength={120} defaultValue={l?.nameEn} dir="ltr" placeholder="King Khalid International Airport" className="field text-start" />
      </Field>
      <Field label="المدينة">
        <select name="city" required defaultValue={l?.city ?? defaultCity ?? ""} className="field">
          <option value="" disabled>
            اختر المدينة
          </option>
          {cities.map((c) => (
            <option key={c.slug} value={c.slug}>
              مدينة {c.nameAr}
            </option>
          ))}
        </select>
      </Field>
      <Field label="النوع">
        <select name="kind" defaultValue={l?.kind ?? "landmark"} className="field">
          {LOCATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k].ar}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="الموقع على الخريطة"
        hint="افتح المكان في خرائط جوجل وانسخ الرابط هنا، أو اكتب الإحداثيات مثل 21.4225, 39.8262. يُستخدم لحساب المسافة والسعر. اتركه فارغًا لاستخدام موقع المدينة."
        className="sm:col-span-2"
      >
        <input
          name="coords"
          dir="ltr"
          maxLength={2000}
          defaultValue={l?.lat != null && l?.lng != null ? `${l.lat}, ${l.lng}` : ""}
          placeholder="https://maps.google.com/… أو 21.4225, 39.8262"
          className="field text-start"
        />
      </Field>
      <Field label="الترتيب" hint="الأصغر يظهر أولًا داخل المدينة">
        <input name="sortOrder" type="number" min={0} defaultValue={l?.sortOrder ?? 0} className="field tabular" />
      </Field>
      <label className="flex items-center gap-2 self-center pt-5">
        <input type="checkbox" name="active" defaultChecked={l?.active ?? true} className="size-4 accent-sign" />
        <span>ظاهرة للعملاء</span>
      </label>
    </div>
  );
}
