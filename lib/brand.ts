/*
 * One place for every brand string and asset. Change these and the whole
 * prototype (sidebar, header, login, footer, metadata) follows.
 */
export const BRAND = {
  /** The client. */
  company: 'Gulftainer',
  /** The software being prototyped. */
  product: 'Gulftainer Operations',
  /** Short label beside the logo mark in headers. */
  shortName: 'Gulftainer',
  /** Second line under the brand in the admin header. */
  portal: 'Operations platform',
  /** Word shown after the logo and a hairline on the public site. */
  siteSuffix: 'E-Services',
  website: 'https://www.gulftainer.com',
  websiteLabel: 'gulftainer.com',
  developer: 'SSI Maya',
  supportEmail: 'customerservice@gulftainer.com',
  phone: '+971 6 512 8888',
  /** Square mark used in the sidebar, mobile header and login card. Replace with the client's mark. */
  mark: '/logos/mark.png',
  /** Horizontal wordmark for the public header. */
  logo: '/logos/logo.png',
  /** Wordmark for the dark footer band. */
  logoWhite: '/logos/logo-white.png',
} as const;
