import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import NavBar from "./components/navbar"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/react"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata = {
  title: "illiCO travaux Martigues",
  description: "Gestion des dossiers chantiers",
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <NavBar />
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}