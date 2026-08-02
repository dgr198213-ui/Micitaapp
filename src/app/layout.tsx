import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Micitaapp",
  description: "Plataforma de reservas para negocios de belleza y bienestar",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="antialiased bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
