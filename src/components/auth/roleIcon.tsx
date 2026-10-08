import type { Role } from '@/auth/roles'
import {
  IconAgency,
  IconEduArea,
  IconEduOffice,
  IconSchool,
  IconShield,
  IconStudent,
} from '@/components/icons'

/**
 * The mark for a role, used by the sidebar, the top bar and both auth screens.
 *
 * It lives in its own module because Vite's Fast Refresh gives up on a file that
 * exports both a component and a plain helper — editing AuthShell used to reload
 * the whole page instead of hot-swapping.
 */
export function roleIcon(role: Role, size = 18) {
  const p = { width: size, height: size }
  switch (role) {
    case 'exec':
      return <IconShield {...p} />
    case 'obec':
      return <IconEduOffice {...p} />
    case 'esa':
      return <IconEduArea {...p} />
    case 'school':
      return <IconSchool {...p} />
    case 'teacher':
      return <IconStudent {...p} />
    case 'agency':
      return <IconAgency {...p} />
  }
}
