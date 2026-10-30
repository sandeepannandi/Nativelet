import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { COMPONENT_COUNT } from "./components/component-registry";

const siteUrl = "https://nativelet.netlify.app";
const title = "Nativelet - Open-source React Native components with live previews";
const description =
  `Nativelet is an open-source collection of ${COMPONENT_COUNT} React Native components, from a Skia scrub chart to a liquid tab bar. Try each in a web preview and copy the source. MIT licensed.`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Nativelet",
  authors: [{ name: "Sandeepan Nandi", url: "https://github.com/sandeepannandi" }],
  creator: "Sandeepan Nandi",
  keywords: [
    "React Native components",
    "Expo",
    "React Native animation",
    "React Native Skia",
    "open source UI",
    "copy and paste components",
    "Nativelet",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: "Nativelet",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "Nativelet",
      description,
      inLanguage: "en",
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${siteUrl}/#source`,
      name: "Nativelet",
      description,
      codeRepository: "https://github.com/sandeepannandi/Nativelet",
      programmingLanguage: "TypeScript",
      runtimePlatform: "React Native",
      license: "https://opensource.org/licenses/MIT",
      author: {
        "@type": "Person",
        name: "Sandeepan Nandi",
        url: "https://github.com/sandeepannandi",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
