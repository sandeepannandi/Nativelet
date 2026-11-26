import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { META, type ComponentId } from "../component-registry";
import styles from "./component-page.module.css";

const REPO = "https://github.com/sandeepannandi/Nativelet";
const SITE = "https://nativelet.netlify.app";

const COVERS: Partial<Record<ComponentId, string>> = {
  roulette: "/roulette-cover.svg",
  origami: "/origami-cover.svg",
  dice: "/dice-cover.svg",
  burn: "/burn-cover.svg",
  patchbay: "/patchbay-cover.svg",
  slingshot: "/slingshot-cover.svg",
  pottery: "/pottery-cover.svg",
  gyro: "/gyroscope-cover.svg",
  zipper: "/zipper-cover.svg",
};

const IDS = Object.keys(META) as ComponentId[];

export const dynamicParams = false;

export function generateStaticParams() {
  return IDS.map((id) => ({ id }));
}

function describe(note: string): string {
  if (note.length <= 158) return note;
  // Prefer whole sentences that fit; file names contain dots, so only split
  // after sentence punctuation followed by a capital letter.
  const sentences = note.split(/(?<=[.!?])\s+(?=[A-Z])/);
  let out = "";
  for (const s of sentences) {
    const next = out ? out + " " + s : s;
    if (next.length > 158) break;
    out = next;
  }
  if (out.length >= 40) return out;
  const cut = note.slice(0, 158);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[.,;:\s]+$/, "") + ".";
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const meta = META[params.id as ComponentId];
  if (!meta) return {};
  const title = `${meta.title} - React Native Skia component`;
  const description = describe(meta.note);
  return {
    title,
    description,
    alternates: { canonical: `/components/${params.id}` },
    openGraph: { title: `${meta.title} | Nativelet`, description, url: `${SITE}/components/${params.id}`, type: "article" },
    twitter: { card: "summary_large_image", title: `${meta.title} | Nativelet`, description },
  };
}

export default function ComponentPage({ params }: { params: { id: string } }) {
  const id = params.id as ComponentId;
  const meta = META[id];
  if (!meta) notFound();
  const cover = COVERS[id];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Nativelet", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Components", item: `${SITE}/#components` },
          { "@type": "ListItem", position: 3, name: meta.title, item: `${SITE}/components/${id}` },
        ],
      },
      {
        "@type": "SoftwareSourceCode",
        name: `${meta.title} - Nativelet component`,
        description: describe(meta.note),
        codeRepository: `${REPO}/tree/main/packages/ui/src/components/${meta.folder}`,
        programmingLanguage: "TypeScript",
        runtimePlatform: "React Native",
        license: "https://opensource.org/licenses/MIT",
        author: { "@type": "Person", name: "Sandeepan Nandi", url: "https://github.com/sandeepannandi" },
      },
    ],
  };
  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/">Nativelet</Link>
        <span aria-hidden="true">/</span>
        <Link href="/#components">Components</Link>
        <span aria-hidden="true">/</span>
        <span>{meta.title}</span>
      </nav>
      <article className={styles.article}>
        <p className={styles.kicker}>React Native · Skia · Gesture Handler · Component {meta.number}</p>
        <h1 className={styles.title}>{meta.title}</h1>
        {cover ? (
          <img className={styles.cover} src={cover} alt={`${meta.title} component preview`} />
        ) : null}
        <p className={styles.note}>{meta.note}</p>
        <div className={styles.actions}>
          <a href={`${REPO}/tree/main/packages/ui/src/components/${meta.folder}`}>
            Copy the source on GitHub
          </a>
          <Link href="/#components">Try the live preview</Link>
        </div>
        <p className={styles.footer}>{meta.footer}. MIT licensed, free to copy into your own Expo or React Native app.</p>
      </article>
    </main>
  );
}
