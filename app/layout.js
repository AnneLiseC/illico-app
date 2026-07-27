import { Manrope, JetBrains_Mono } from "next/font/google"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/react"
import "./globals.css"
import NavBar from "./components/navbar"
import { AuthProvider } from "./lib/auth-context"
import OnboardingGuard from "./components/onboarding-guard"
import DisableNumberInputScroll from "./components/DisableNumberInputScroll"

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
})

export const metadata = {
  title: "Batilis",
  description: "Gestion des dossiers chantiers",
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#4f46e5",
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <DisableNumberInputScroll />
        <AuthProvider>
          <OnboardingGuard>
            <NavBar />
            {/* app-shell : pl-72px sur desktop, 0 sur mobile (drawer overlay) */}
            <div className="app-shell">
              {children}
            </div>
          </OnboardingGuard>
        </AuthProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
