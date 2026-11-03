/** Runs before the site paints: dark or light, as chosen in this browser, else the device's setting. */
export const SITE_THEME_SCRIPT = `try{var s=localStorage.getItem("site-theme");var d=s?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}`;
