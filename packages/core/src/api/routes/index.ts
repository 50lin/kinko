import type { RouteDef } from '../router';
import { authRoutes } from './auth';
import { patientRoutes } from './patient';
import { companionRoutes } from './companion';
import { contentRoutes } from './content';
import { careRoutes } from './care';
import { proRoutes } from './pro';
import { clinicRoutes } from './clinic';
import { communityRoutes } from './community';
import { dataRoutes } from './data';
import { adminRoutes } from './admin';
import { miscRoutes } from './misc';

export const allRoutes: RouteDef[] = [
  ...miscRoutes, ...authRoutes, ...patientRoutes, ...companionRoutes, ...contentRoutes, ...careRoutes, ...proRoutes, ...clinicRoutes, ...communityRoutes, ...dataRoutes, ...adminRoutes,
];
export { DEMO_ACCOUNTS } from './auth';
