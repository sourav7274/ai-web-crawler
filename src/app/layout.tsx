import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PageBrief — a little less reading",
  description: "Turn a webpage into a clear overview and the key points that matter. Powered by Gemini.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
