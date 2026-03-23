import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-blue-900 mb-2">
          illiCO travaux Martigues
        </h1>
        <p className="text-gray-500 mb-8">Gestion des dossiers chantiers</p>
        <Link 
          href="/login"
          className="bg-blue-800 text-white px-6 py-3 rounded-lg hover:bg-blue-900"
        >
          Se connecter
        </Link>
      </div>
    </div>
  )
}