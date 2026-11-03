import { desc } from "drizzle-orm";
import { db } from "@/db";
import { requireSection } from "@/lib/auth";
import { getSettings } from "@/lib/catalog";
import { todayInRiyadh } from "@/lib/booking";
import { formatDate, formatNumber } from "@/lib/format";
import { ruleTable, rulesEnabled, type RuleKind } from "@/lib/price-rules-server";
import { addRule, deleteRule, saveRule, setRulesEnabled, toggleRule } from "@/app/admin/price-rule-actions";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Field } from "@/components/admin/ui";

type Row = { id: number; nameAr: string; nameEn: string; percent: number; startDate: string; endDate: string; active: boolean };

const TEXT = {
  seasons: {
    lead: "الموسم زيادة بنسبة على أسعار كل الرحلات والسيارات اللي تاريخها بين تاريخين (الحج، العمرة، رمضان، الإجازات…). أنت تحدد النسبة والمدة بالتاريخ الميلادي، وتضيف مواسم قد ما تبي. يبدأ وينتهي تلقائيًا، ويظهر للعميل في ملخص الحجز. إذا تداخل موسمان تُطبّق الزيادة الأكبر.",
    on: "المواسم شغّالة",
    off: "المواسم موقوفة",
    onHint: "المواسم المفعّلة تُطبّق تلقائيًا في فتراتها.",
    offHint: "ما تُطبّق أي زيادة لين تشغّلها.",
    stopAll: "إيقاف كل المواسم",
    startAll: "تشغيل المواسم",
    add: "إضافة موسم",
    addBtn: "إضافة الموسم",
    none: "لا توجد مواسم بعد.",
    name: "اسم الموسم",
    placeholder: "موسم الحج",
    pct: "نسبة الزيادة ٪",
    max: 300,
    sign: "+",
    def: 20,
    badge: "bg-amber/25 text-amber-deep",
  },
  offers: {
    lead: "العرض خصم بنسبة على الرحلات اللي تاريخها بين تاريخين. يبدأ وينتهي تلقائيًا، ويظهر للعميل في ملخص الحجز. إذا تداخل عرضان يُطبّق الأكبر.",
    on: "العروض شغّالة",
    off: "العروض موقوفة",
    onHint: "العروض المفعّلة تُطبّق تلقائيًا في فتراتها.",
    offHint: "ما يُطبّق أي عرض لين تشغّلها.",
    stopAll: "إيقاف كل العروض",
    startAll: "تشغيل العروض",
    add: "إضافة عرض",
    addBtn: "إضافة العرض",
    none: "لا توجد عروض بعد.",
    name: "اسم العرض",
    placeholder: "عرض اليوم الوطني",
    pct: "نسبة الخصم ٪",
    max: 90,
    sign: "-",
    def: 10,
    badge: "bg-sign text-white",
  },
} as const;

/** The seasons page and the offers page: a switch for the whole list, an add form, and each rule with on/off, edit and delete */
export async function RuleList({ kind }: { kind: RuleKind }) {
  await requireSection("catalog");
  const T = TEXT[kind];
  const t = ruleTable(kind);
  const [st, rows] = await Promise.all([getSettings(), db.select().from(t).orderBy(desc(t.startDate), desc(t.id)) as Promise<Row[]>]);
  const on = rulesEnabled(st, kind);
  const today = todayInRiyadh();
  const state = (o: Row) =>
    !o.active ? (["موقوف", "bg-stone text-muted"] as const) : o.endDate < today ? (["انتهى", "bg-stone text-muted"] as const) : o.startDate > today ? (["قادم", "bg-sign-soft text-sign"] as const) : (["شغّال الآن", "bg-amber/20 text-amber-deep"] as const);

  return (
    <div className="space-y-6 max-w-5xl">
      <p className="text-muted max-w-[75ch]">{T.lead}</p>

      <Card className={`p-5 flex flex-wrap items-center justify-between gap-4 ${on ? "" : "border-danger/30"}`} data-testid={`${kind}-switch`}>
        <div>
          <p className="font-semibold">{on ? T.on : T.off}</p>
          <p className="text-sm text-muted">{on ? T.onHint : T.offHint}</p>
        </div>
        <ActionForm action={setRulesEnabled} submitLabel={on ? T.stopAll : T.startAll} submitClassName={on ? "btn btn-ghost border border-line" : "btn btn-primary"} className="">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="on" value={on ? "0" : "1"} />
        </ActionForm>
      </Card>

      <Card className="p-6" data-testid={`${kind}-add`}>
        <h2 className="font-semibold mb-4">{T.add}</h2>
        <ActionForm action={addRule} submitLabel={T.addBtn}>
          <input type="hidden" name="kind" value={kind} />
          <RuleFields kind={kind} />
        </ActionForm>
      </Card>

      {rows.length === 0 ? (
        <p className="text-muted">{T.none}</p>
      ) : (
        <ul className="space-y-3" data-testid={`${kind}-list`}>
          {rows.map((o) => {
            const [label, cls] = state(o);
            return (
              <li key={o.id} data-rule={o.id}>
                <Card className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-semibold">{o.nameAr}</p>
                    <span className={`rounded-md px-2 py-0.5 text-sm font-semibold tabular ${T.badge}`}>
                      {o.percent === 0 ? "بدون نسبة" : `${T.sign}${formatNumber(o.percent, "ar")}٪`}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`} data-testid="rule-state">
                      {label}
                    </span>
                    <span className="text-sm text-muted">
                      من {formatDate(o.startDate, "ar")} إلى {formatDate(o.endDate, "ar")}
                    </span>
                    <span className="ms-auto flex gap-2">
                      <ActionForm action={toggleRule} submitLabel={o.active ? "إيقاف" : "تفعيل"} submitClassName="btn btn-ghost border border-line !min-h-8 !py-0.5 text-sm" className="">
                        <input type="hidden" name="kind" value={kind} />
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="on" value={o.active ? "0" : "1"} />
                      </ActionForm>
                      <ActionForm action={deleteRule} submitLabel="حذف" submitClassName="btn btn-ghost !min-h-8 !py-0.5 text-sm !text-danger" className="">
                        <input type="hidden" name="kind" value={kind} />
                        <input type="hidden" name="id" value={o.id} />
                      </ActionForm>
                    </span>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm text-sign">تعديل</summary>
                    <ActionForm action={saveRule} submitLabel="حفظ" className="mt-3 space-y-4">
                      <input type="hidden" name="kind" value={kind} />
                      <input type="hidden" name="id" value={o.id} />
                      <RuleFields kind={kind} o={o} />
                    </ActionForm>
                  </details>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RuleFields({ kind, o }: { kind: RuleKind; o?: Row }) {
  const T = TEXT[kind];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Field label={T.name}>
        <input name="nameAr" required minLength={2} maxLength={80} defaultValue={o?.nameAr} placeholder={T.placeholder} className="field" />
      </Field>
      <Field label="الاسم بالإنجليزي (اختياري)">
        <input name="nameEn" maxLength={80} defaultValue={o?.nameEn} dir="ltr" className="field text-start" />
      </Field>
      <Field label={T.pct}>
        <input name="percent" type="number" min={0} max={T.max} required defaultValue={o?.percent ?? T.def} dir="ltr" className="field text-start" />
      </Field>
      <Field label="من تاريخ (ميلادي)">
        <input name="startDate" type="date" required defaultValue={o?.startDate} className="field" />
      </Field>
      <Field label="إلى تاريخ (ميلادي)">
        <input name="endDate" type="date" required defaultValue={o?.endDate} className="field" />
      </Field>
    </div>
  );
}
