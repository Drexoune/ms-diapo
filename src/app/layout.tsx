import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { fontFaceCss } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "MS Diapos — l'éditeur de diapos MS Creators",
  description: "Crée des présentations aux couleurs de MS Creators : bibliothèque d'éléments, modèles prêts à l'emploi, export PDF.",
  icons: { icon: "/library/ms-logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffcc55",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full">
      <head>
        <link rel="preload" href="/fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/bricolage-grotesque-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: fontFaceCss() }} />
      </head>
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
