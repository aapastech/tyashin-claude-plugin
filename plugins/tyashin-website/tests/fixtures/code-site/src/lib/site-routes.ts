export function getSiteRoutes(): { path: string; priority: number }[] {
  return [
    { path: '/', priority: 1 },
    { path: '/about', priority: 0.8 },
    { path: '/contact', priority: 0.8 },
    { path: '/privacy', priority: 0.2 },
    { path: '/terms', priority: 0.2 },
  ];
}
