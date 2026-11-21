import type { MetadataRoute } from "next";
import { META } from "./components/component-registry";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const components = (Object.keys(META) as (keyof typeof META)[]).map((id) => ({
    url: `https://nativelet.netlify.app/components/${id}`,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
  return [
    { url: "https://nativelet.netlify.app/", changeFrequency: "weekly", priority: 1 },
    ...components,
    { url: "https://nativelet.netlify.app/sponsor", changeFrequency: "monthly", priority: 0.5 },
    { url: "https://nativelet.netlify.app/terms", changeFrequency: "yearly", priority: 0.3 },
    { url: "https://nativelet.netlify.app/privacy", changeFrequency: "yearly", priority: 0.3 },
  ];
}
