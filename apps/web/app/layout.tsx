import './globals.css'

export const metadata = {
  title: 'Sentinel',
  description: 'Synthetic testing and uptime monitoring',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-zinc-950 text-zinc-100">
      <body>{children}</body>
    </html>
  )
}
