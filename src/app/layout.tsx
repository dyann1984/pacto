import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "PACTO · AI Commerce. Real Results.",
    template: "%s · PACTO",
  },
  description: "Convierte tus acuerdos en resultados reales.",
  icons: { icon: "/pacto-mark.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
