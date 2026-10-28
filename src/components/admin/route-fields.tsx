import type { City, Location, Route } from "@/db/schema";
import { Field } from "./ui";

/** Destinations grouped by city, so a long list stays easy to scan */
export function LocationOptions({ locations, cities }: { locations: Location[]; cities: City[] }) {
  return (
    <>
      {cities.map((c) => {
        const inCity = locations.filter((l) => l.city === c.slug);
        if (!inCity.length) return null;
        return (
          <optgroup key={c.slug} label={c.nameAr}>
            {inCity.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nameAr}
                {l.active ? "" : " (مخفية)"}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

/** Shared fields for creating and editing a route. */
export function RouteFields({ locations, cities, r }: { locations: Location[]; cities: City[]; r?: Route }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {r && <input type="hidden" name="id" value={r.id} />}
      <Field label="النوع">
        <select name="kind" defaultValue={r?.kind ?? "transfer"} className="field">
          <option value="transfer">توصيل من نقطة إلى نقطة</option>
          <option value="ziyarat">جولة زيارة داخل المدينة</option>
        </select>
      </Field>
      <Field label="الترتيب" hint="الأصغر يظهر أولًا">
        <input name="sortOrder" type="number" defaultValue={r?.sortOrder ?? 0} className="field tabular" />
      </Field>
      <Field label="من">
        <select name="fromLocationId" required defaultValue={r?.fromLocationId} className="field">
          <LocationOptions locations={locations} cities={cities} />
        </select>
      </Field>
      <Field label="إلى" hint="يُترك فارغًا للجولات">
        <select name="toLocationId" defaultValue={r?.toLocationId ?? ""} className="field">
          <option value="">—</option>
          <LocationOptions locations={locations} cities={cities} />
        </select>
      </Field>
      <Field label="المسافة (كم)">
        <input name="distanceKm" type="number" min={0} defaultValue={r?.distanceKm ?? ""} className="field tabular" />
      </Field>
      <Field label="المدة (دقيقة)">
        <input name="durationMin" type="number" min={0} defaultValue={r?.durationMin ?? ""} className="field tabular" />
      </Field>
      <Field label="عنوان مخصص بالعربي" hint="اختياري للتوصيل، مطلوب للجولات">
        <input name="titleAr" defaultValue={r?.titleAr ?? ""} className="field" />
      </Field>
      <Field label="عنوان مخصص بالإنجليزي">
        <input name="titleEn" defaultValue={r?.titleEn ?? ""} dir="ltr" className="field text-start" />
      </Field>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="bidirectional" defaultChecked={r?.bidirectional ?? true} className="size-4 accent-sign" />
        <span>نفس السعر في الاتجاهين</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={r?.active ?? true} className="size-4 accent-sign" />
        <span>ظاهرة للعملاء</span>
      </label>
    </div>
  );
}
