import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/useAuthStore';
import useSettingsStore from './store/useSettingsStore';
import useNotificationStore from './store/useNotificationStore';
import DashboardLayout from './components/layout/DashboardLayout';
import ErrorBoundary from './components/ErrorBoundary';

import LoginPage from './pages/auth/LoginPage';
import POSPage from './pages/pos/POSPage';
import PaymentPage from './pages/pos/PaymentPage';
import PaymentSuccessPage from './pages/pos/PaymentSuccessPage';
import TableManagementPage from './pages/pos/TableManagementPage';
import OrdersListPage from './pages/pos/OrdersListPage';
import KDSPage from './pages/kds/KDSPage';
import HomePage from './pages/public/HomePage';
import PrivacyPolicyPage from './pages/public/PrivacyPolicyPage';
import BranchSetupPage from './pages/desktop/BranchSetupPage';

const CRMPage = lazy(() => import('./pages/crm/CRMPage'));
const WhatsAppPage = lazy(() => import('./pages/crm/WhatsAppPage'));
const AnalyticsPage = lazy(() => import('./pages/analytics/AnalyticsPage'));
const MenuEditorPage = lazy(() => import('./pages/management/MenuEditorPage'));
const ReportsPage = lazy(() => import('./pages/management/ReportsPage'));
const AiAssistantPage = lazy(() => import('./pages/management/AiAssistantPage'));
const SettingsPage = lazy(() => import('./pages/management/SettingsPage'));
const LoyaltyManagementPage = lazy(() => import('./pages/management/LoyaltyManagementPage'));
const CampaignDashboardPage = lazy(() => import('./pages/management/CampaignDashboardPage'));
const OperationsHubPage = lazy(() => import('./pages/management/OperationsHubPage'));
const PaymentVerificationPage = lazy(() => import('./pages/management/PaymentVerificationPage'));
const PeopleHubPage = lazy(() => import('./pages/management/PeopleHubPage'));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'));
const KanbanPage = lazy(() => import('./pages/management/KanbanPage'));

const ROUTE_ROLES = {
  '/pos': ['admin', 'foh'],
  '/pos/payment': ['admin', 'foh'],
  '/pos/success': ['admin', 'foh'],
  '/pos/tables': ['admin', 'foh'],
  '/orders': ['admin', 'foh', 'manager'],
  '/management/payments': ['admin', 'manager', 'foh'],
  '/kds': ['admin', 'kitchen'],
  '/crm': ['admin', 'manager', 'executive'],
  '/crm/whatsapp': ['admin', 'manager', 'executive'],
  '/analytics': ['admin', 'executive', 'manager'],
  '/management/menu': ['admin', 'manager'],
  '/management/operations': ['admin', 'manager', 'executive'],
  '/management/reports': ['admin', 'executive'],
  '/assistant': ['admin', 'executive', 'manager', 'foh', 'kitchen'],
  '/management/people': ['admin'],
  '/management/loyalty': ['admin', 'manager'],
  '/management/campaigns': ['admin', 'manager', 'executive'],
  '/management/kanban': ['admin', 'manager', 'executive'],
  '/management/settings': ['admin'],
  '/notifications': ['admin', 'manager', 'foh'],
};

function PageSkeleton() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-9 w-52 rounded bg-slate-200/70" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-32 rounded-xl bg-slate-200/70" />
        <div className="h-32 rounded-xl bg-slate-200/70" />
        <div className="h-32 rounded-xl bg-slate-200/70" />
      </div>
      <div className="h-72 rounded-xl bg-slate-200/70" />
    </div>
  );
}

function AsyncRoute({ component: Component }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Component />
    </Suspense>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuthStore();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-6">
        <div className="w-full max-w-md space-y-4">
          <div className="h-5 w-28 rounded bg-slate-200/80 animate-pulse" />
          <div className="h-12 rounded-xl bg-slate-200/80 animate-pulse" />
          <div className="h-12 rounded-xl bg-slate-200/80 animate-pulse" />
        </div>
      </div>
    );
  }
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function RoleRoute({ path, children }) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const roles = ROUTE_ROLES[path];
  if (roles && currentUser && !roles.includes(currentUser.role)) {
    const fallback = currentUser.role === 'kitchen' ? '/kds' : '/pos';
    return <Navigate to={fallback} replace />;
  }
  return children;
}

function AppRoutes() {
  const init = useAuthStore((s) => s.init);
  const { fetchSettings, loaded: settingsLoaded } = useSettingsStore((s) => ({
    fetchSettings: s.fetchSettings,
    loaded: s.loaded,
  }));
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!settingsLoaded) {
      fetchSettings();
    }
  }, [settingsLoaded, fetchSettings]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
    }
  }, [isAuthenticated, fetchNotifications]);

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/table/:tagId" element={<HomePage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/desktop-setup" element={<BranchSetupPage />} />

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/pos" element={<RoleRoute path="/pos"><POSPage /></RoleRoute>} />
        <Route path="/pos/payment" element={<RoleRoute path="/pos/payment"><PaymentPage /></RoleRoute>} />
        <Route path="/pos/success" element={<RoleRoute path="/pos/success"><PaymentSuccessPage /></RoleRoute>} />
        <Route path="/pos/tables" element={<RoleRoute path="/pos/tables"><TableManagementPage /></RoleRoute>} />
        <Route path="/orders" element={<RoleRoute path="/orders"><OrdersListPage /></RoleRoute>} />
        <Route path="/management/payments" element={<RoleRoute path="/management/payments"><PaymentVerificationPage /></RoleRoute>} />
        <Route path="/kds" element={<RoleRoute path="/kds"><KDSPage /></RoleRoute>} />
        <Route path="/crm" element={<RoleRoute path="/crm"><AsyncRoute component={CRMPage} /></RoleRoute>} />
        <Route path="/crm/whatsapp" element={<RoleRoute path="/crm/whatsapp"><AsyncRoute component={WhatsAppPage} /></RoleRoute>} />
        <Route path="/analytics" element={<RoleRoute path="/analytics"><AsyncRoute component={AnalyticsPage} /></RoleRoute>} />
        <Route path="/management/menu" element={<RoleRoute path="/management/menu"><AsyncRoute component={MenuEditorPage} /></RoleRoute>} />
        <Route path="/management/operations" element={<RoleRoute path="/management/operations"><AsyncRoute component={OperationsHubPage} /></RoleRoute>} />
        <Route path="/management/reports" element={<RoleRoute path="/management/reports"><AsyncRoute component={ReportsPage} /></RoleRoute>} />
        <Route path="/assistant" element={<RoleRoute path="/assistant"><AsyncRoute component={AiAssistantPage} /></RoleRoute>} />
        <Route path="/management/people" element={<RoleRoute path="/management/people"><AsyncRoute component={PeopleHubPage} /></RoleRoute>} />
        <Route path="/management/loyalty" element={<RoleRoute path="/management/loyalty"><AsyncRoute component={LoyaltyManagementPage} /></RoleRoute>} />
        <Route path="/management/campaigns" element={<RoleRoute path="/management/campaigns"><AsyncRoute component={CampaignDashboardPage} /></RoleRoute>} />
        <Route path="/management/kanban" element={<RoleRoute path="/management/kanban"><AsyncRoute component={KanbanPage} /></RoleRoute>} />
        <Route path="/management/settings" element={<RoleRoute path="/management/settings"><AsyncRoute component={SettingsPage} /></RoleRoute>} />
        <Route path="/notifications" element={<RoleRoute path="/notifications"><AsyncRoute component={NotificationsPage} /></RoleRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/pos" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  );
}
