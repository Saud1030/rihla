import { getBrand } from "./brand";
import { getSettings } from "./catalog";
import type { Locale } from "@/i18n/dictionaries";

/** The company's details printed on vouchers and invoices (Admin -> Settings and Appearance) */
export async function companyDetails(lang: Locale) {
  const [st, brand] = await Promise.all([getSettings(), getBrand()]);
  return {
    name: brand.name[lang],
    logoUrl: brand.logoUrl,
    vatNumber: (st.vat_number ?? "").trim(),
    crNumber: (st.cr_number ?? "").trim(),
    address: (st[`address_${lang}`] ?? "").trim(),
    phone: (st.phone ?? "").trim(),
    email: (st.email ?? "").trim(),
  };
}
