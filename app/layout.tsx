export const metadata = {
  title: "India from Space - Video Generator",
  description: "Generate a video flyover of India from space in your browser"
};

import "./globals.css";
import { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

