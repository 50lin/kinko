import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import './styles.css';
import { queryClient } from '@/lib/query';
import { useAuth } from '@/lib/auth';
import { router } from './routes';
import { Toaster } from '@/components/ui';
import { Sphere } from '@/components/Sphere';
import { mode } from '@/lib/api';

document.documentElement.style.setProperty('--demo', mode.demo ? '32px' : '0px');

function Boot() {
  const { ready, init } = useAuth();
  useEffect(() => { init(); }, [init]);
  if (!ready) return (
    <div className="grid min-h-screen place-items-center bg-aurora">
      <div className="flex flex-col items-center gap-4"><Sphere className="h-40 w-40" overall={70} interactive={false} quality="low" /><div className="font-display text-xl">Kinkō</div><div className="text-sm muted">Preparando tu espacio…</div></div>
    </div>
  );
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Boot />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
