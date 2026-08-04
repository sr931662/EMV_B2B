import { Route, Routes } from 'react-router-dom';
import RequireAuth from './components/auth/RequireAuth';
import AppLayout from './components/layout/AppLayout';
import RoleLanding from './pages/RoleLanding';
import ForbiddenPage from './pages/ForbiddenPage';
import NotFoundPage from './pages/NotFoundPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import VerifyOtpPage from './pages/auth/VerifyOtpPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import PartnerDashboardPage from './pages/dashboard/PartnerDashboardPage';
import LibraryPage from './pages/library/LibraryPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminPaymentsQueuePage from './pages/admin/AdminPaymentsQueuePage';
import AdminPaymentDetailPage from './pages/admin/AdminPaymentDetailPage';
import AgenciesListPage from './pages/admin/AgenciesListPage';
import AgencyDetailPage from './pages/admin/AgencyDetailPage';
import ComingSoon from './components/layout/ComingSoon';
import PackageMarketplacePage from './pages/packages/PackageMarketplacePage';
import PackageDetailPage from './pages/packages/PackageDetailPage';
import GenerateQuotePage from './pages/packages/GenerateQuotePage';
import PackageItineraryPage from './pages/packages/PackageItineraryPage';
import VisaServicesPage from './pages/visa/VisaServicesPage';
import VisaProductDetailPage from './pages/visa/VisaProductDetailPage';
import NewVisaRequestPage from './pages/visa/NewVisaRequestPage';
import VisaRequestDetailPage from './pages/visa/VisaRequestDetailPage';
import VisaPaymentPage from './pages/visa/VisaPaymentPage';
import MyQuotesPage from './pages/quotes/MyQuotesPage';
import QuoteDetailPage from './pages/quotes/QuoteDetailPage';
import QuotePaymentPage from './pages/quotes/QuotePaymentPage';
import TripVoucherPage from './pages/quotes/TripVoucherPage';
import TripTravellersPage from './pages/quotes/TripTravellersPage';
import AdminVisaRequestsPage from './pages/admin/AdminVisaRequestsPage';
import AdminVisaRequestDetailPage from './pages/admin/AdminVisaRequestDetailPage';
import AdminVisaConfigPage from './pages/admin/AdminVisaConfigPage';
import AdminPackagesListPage from './pages/admin/AdminPackagesListPage';
import PackageFormPage from './pages/admin/PackageFormPage';
import AdminItineraryEditorPage from './pages/admin/AdminItineraryEditorPage';
import StaffUsersPage from './pages/admin/StaffUsersPage';
import EmailTemplatesPage from './pages/admin/EmailTemplatesPage';
import EmailTemplateEditPage from './pages/admin/EmailTemplateEditPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<RoleLanding />} />

      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-otp" element={<VerifyOtpPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      {/* Partner */}
      <Route element={<RequireAuth roles={['partner']} />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<PartnerDashboardPage />} />
          <Route path="/packages" element={<PackageMarketplacePage />} />
          <Route path="/packages/:id" element={<PackageDetailPage />} />
          <Route path="/packages/:id/quote" element={<GenerateQuotePage />} />
          <Route path="/packages/:id/itinerary" element={<PackageItineraryPage />} />
          <Route path="/visa" element={<VisaServicesPage />} />
          <Route path="/visa/new" element={<NewVisaRequestPage />} />
          {/* Before '/visa/:id' so the literal 'products' segment wins — otherwise this URL
              would be read as a visa REQUEST whose id happens to be "products". */}
          <Route path="/visa/products/:id" element={<VisaProductDetailPage />} />
          <Route path="/visa/:id" element={<VisaRequestDetailPage />} />
          <Route path="/visa/:id/payment" element={<VisaPaymentPage />} />
          <Route path="/quotes" element={<MyQuotesPage />} />
          <Route path="/quotes/:id" element={<QuoteDetailPage />} />
          <Route path="/quotes/:id/payment" element={<QuotePaymentPage />} />
          <Route path="/quotes/:id/voucher" element={<TripVoucherPage />} />
          <Route path="/quotes/:id/travellers" element={<TripTravellersPage />} />
        </Route>
      </Route>

      {/* Admin */}
      <Route element={<RequireAuth roles={['admin']} />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/payments" element={<AdminPaymentsQueuePage />} />
          <Route path="/admin/payments/:id" element={<AdminPaymentDetailPage />} />
          <Route path="/admin/agencies" element={<AgenciesListPage />} />
          <Route path="/admin/agencies/:id" element={<AgencyDetailPage />} />
          <Route path="/admin/packages" element={<AdminPackagesListPage />} />
          <Route path="/admin/packages/new" element={<PackageFormPage />} />
          <Route path="/admin/packages/:id/itinerary" element={<AdminItineraryEditorPage />} />
          <Route path="/admin/packages/:id/edit" element={<PackageFormPage />} />
          <Route path="/admin/visa-requests" element={<AdminVisaRequestsPage />} />
          <Route path="/admin/visa-requests/:id" element={<AdminVisaRequestDetailPage />} />
          <Route path="/admin/visa-config" element={<AdminVisaConfigPage />} />
          <Route path="/admin/staff" element={<StaffUsersPage />} />
          <Route path="/admin/templates" element={<EmailTemplatesPage />} />
          <Route path="/admin/templates/new" element={<EmailTemplateEditPage />} />
          <Route path="/admin/templates/:id/edit" element={<EmailTemplateEditPage />} />
          <Route path="/admin/reports" element={<ComingSoon title="Reports" />} />
        </Route>
      </Route>

      {/* Library — admin + data_feeder */}
      <Route element={<RequireAuth roles={['admin', 'data_feeder']} />}>
        <Route element={<AppLayout />}>
          <Route path="/library" element={<LibraryPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
