function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`${name} is required`)
  return val
}

export const DATABASE_URL = requireEnv('DATABASE_URL')
export const ADMIN_USERNAME = requireEnv('ADMIN_USERNAME')
export const ADMIN_PASSWORD = requireEnv('ADMIN_PASSWORD')
export const JWT_SECRET = requireEnv('JWT_SECRET')
