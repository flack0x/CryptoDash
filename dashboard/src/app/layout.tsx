import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CryptoDash — Smart Money Intelligence",
  description: "Where is smart money going that the crowd hasn't noticed yet?",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
