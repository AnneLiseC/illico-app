import { Geist, Geist_Mono } from "next/font/google"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/react"
import "./globals.css"
import NavBar from "./components/navbar"
import { AuthProvider } from "./lib/auth-context"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata = {
  title: "illiCO travaux Martigues",
  description: "Gestion des dossiers chantiers",
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#f0f4f8]">
        <AuthProvider>
          <NavBar />
          {/* pl-[72px] offsets the fixed 72px-wide collapsed sidebar */}
          <div className="pl-[72px] min-h-screen">
            {children}
          </div>
        </AuthProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
