import { useEffect } from 'react';
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
import CRMPage from './pages/crm/CRMPage';
import WhatsAppPage from './pages/crm/WhatsAppPage';
import AnalyticsPage from './pages/analytics/AnalyticsPage';
import MenuEditorPage from './pages/management/MenuEditorPage';
import ReportsPage from './pages/management/ReportsPage';
import AiAssistantPage from './pages/management/AiAssistantPage';
import SettingsPage from './pages/management/SettingsPage';
import LoyaltyManagementPage from './pages/management/LoyaltyManagementPage';
import CampaignDashboardPage from './pages/management/CampaignDashboardPage';
import OperationsHubPage from './pages/management/OperationsHubPage';
import PeopleHubPage from './pages/management/PeopleHubPage';
import NotificationsPage from './pages/notifications/NotificationsPage';
import HomePage from './pages/public/HomePage';
import PrivacyPolicyPage from './pages/public/PrivacyPolicyPage';

const ROUTE_ROLES = {
  '/pos': ['admin', 'foh'],
  '/pos/payment': ['admin', 'foh'],
  '/pos/success': ['admin', 'foh'],
  '/pos/tables': ['admin', 'foh'],
  '/orders': ['admin', 'foh', 'manager'],
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
  '/management/settings': ['admin'],
  '/notifications': ['admin', 'manager', 'foh'],
};

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuthStore();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-sm text-surface-on-variant">Loading...</p>
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
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const fetchNotifications = useNotificationStore((s) => s.fetchNotifications);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSettings();
      fetchNotifications();
    }
  }, [isAuthenticated, fetchSettings, fetchNotifications]);

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/table/:tagId" element={<HomePage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="/login" element={<LoginPage />} />

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
        <Route path="/kds" element={<RoleRoute path="/kds"><KDSPage /></RoleRoute>} />
        <Route path="/crm" element={<RoleRoute path="/crm"><CRMPage /></RoleRoute>} />
        <Route path="/crm/whatsapp" element={<RoleRoute path="/crm/whatsapp"><WhatsAppPage /></RoleRoute>} />
        <Route path="/analytics" element={<RoleRoute path="/analytics"><AnalyticsPage /></RoleRoute>} />
        <Route path="/management/menu" element={<RoleRoute path="/management/menu"><MenuEditorPage /></RoleRoute>} />
        <Route path="/management/operations" element={<RoleRoute path="/management/operations"><OperationsHubPage /></RoleRoute>} />
        <Route path="/management/reports" element={<RoleRoute path="/management/reports"><ReportsPage /></RoleRoute>} />
        <Route path="/assistant" element={<RoleRoute path="/assistant"><AiAssistantPage /></RoleRoute>} />
        <Route path="/management/people" element={<RoleRoute path="/management/people"><PeopleHubPage /></RoleRoute>} />
        <Route path="/management/loyalty" element={<RoleRoute path="/management/loyalty"><LoyaltyManagementPage /></RoleRoute>} />
        <Route path="/management/campaigns" element={<RoleRoute path="/management/campaigns"><CampaignDashboardPage /></RoleRoute>} />
        <Route path="/management/settings" element={<RoleRoute path="/management/settings"><SettingsPage /></RoleRoute>} />
        <Route path="/notifications" element={<RoleRoute path="/notifications"><NotificationsPage /></RoleRoute>} />
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
