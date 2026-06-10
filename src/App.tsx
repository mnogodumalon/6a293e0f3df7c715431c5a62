import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import { WorkflowPlaceholders } from '@/components/WorkflowPlaceholders';
import AdminPage from '@/pages/AdminPage';
import VeranstaltungenPage from '@/pages/VeranstaltungenPage';
import VeranstaltungenDetailPage from '@/pages/VeranstaltungenDetailPage';
import VerantwortlichePage from '@/pages/VerantwortlichePage';
import VerantwortlicheDetailPage from '@/pages/VerantwortlicheDetailPage';
import PublicFormVeranstaltungen from '@/pages/public/PublicForm_Veranstaltungen';
import PublicFormVerantwortliche from '@/pages/public/PublicForm_Verantwortliche';
// <public:imports>
// </public:imports>
// <custom:imports>
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/6a293dfdc6afb340fd657d90" element={<PublicFormVeranstaltungen />} />
              <Route path="public/6a293dfacd0fac970e8ed88d" element={<PublicFormVerantwortliche />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<><div className="mb-8"><WorkflowPlaceholders /></div><DashboardOverview /></>} />
                <Route path="veranstaltungen" element={<VeranstaltungenPage />} />
                <Route path="veranstaltungen/:id" element={<VeranstaltungenDetailPage />} />
                <Route path="verantwortliche" element={<VerantwortlichePage />} />
                <Route path="verantwortliche/:id" element={<VerantwortlicheDetailPage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
