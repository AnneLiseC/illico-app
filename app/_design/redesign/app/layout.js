import { Geist_Mono, Manrope, JetBrains_Mono } from "next/font/google"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/react"
import "./globals.css"
import NavBar from "./components/navbar"
import Header from "./components/header"
import { AuthProvider } from "./lib/auth-context"

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
})
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
})
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata = {
  title: "illiCO travaux Martigues",
  description: "Gestion des dossiers chantiers",
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${manrope.variable} ${jetbrains.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>
          <NavBar />
          {/* pl-[72px] offsets the fixed 72px-wide collapsed sidebar */}
          <div className="pl-[72px] min-h-screen flex flex-col">
            <Header />
            <main className="flex-1 min-w-0 flex flex-col">
              {children}
            </main>
          </div>
        </AuthProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
