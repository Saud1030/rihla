import { notFound } from "next/navigation";

/** Any unknown path under /ar or /en shows the site's own 404 page (with header and footer). */
export default function CatchAll() {
  notFound();
}
