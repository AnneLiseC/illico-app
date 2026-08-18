import { Manrope, JetBrains_Mono } from "next/font/google"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/react"
import "./globals.css"
import NavBar from "./components/navbar"
import { AuthProvider } from "./lib/auth-context"
import OnboardingGuard from "./components/onboarding-guard"
import DisableNumberInputScroll from "./components/DisableNumberInputScroll"

// ⚠ Les variables DOIVENT s'appeler --font-manrope / --font-jetbrains : c'est ce que globals.css
// référence (l.87-88 @theme + body). Sous un autre nom, Manrope ne s'applique jamais et tout
// l'app retombe sur la police système (Segoe UI sur Windows), plus grosse et moins soignée.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
})

export const metadata = {
  title: "Batilis",
  description: "Gestion des dossiers chantiers",
  icons: {
    icon: "/logo_VF.png",
    apple: "/logo_VF.png",
  },
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
