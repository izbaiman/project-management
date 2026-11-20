/**
 * Change someone's role from the command line, e.g. to make yourself the owner:
 *
 *   npm run set-role -- you@topedgetechnologies.com super_admin
 */
import { db } from './db.js'
import { ROLES } from './roles.js'

const [email, role] = process.argv.slice(2)
if (!email || !ROLES.includes(role)) {
  console.error(`Usage: npm run set-role -- <email> <${ROLES.join('|')}>`)
  process.exit(1)
}
const info = db.prepare('UPDATE employees SET role = ? WHERE email = ? COLLATE NOCASE').run(role, email)
console.log(info.changes ? `${email} is now ${role}` : `No employee with email ${email}`)
process.exit(info.changes ? 0 : 1)
