import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, Layout, NAV } from './components/Layout';
import { Loading } from './components/ui';
import { useSession, type Role } from './lib/session';
import Login from './pages/Login';

const pages = {
  Dashboard: lazy(() => import('./pages/Dashboard')),
  Orders: lazy(() => import('./pages/Orders')),
  OrderDetail: lazy(() => import('./pages/OrderDetail')),
  Payments: lazy(() => import('./pages/Payments')),
  Products: lazy(() => import('./pages/Products')),
  ProductEdit: lazy(() => import('./pages/ProductEdit')),
  Import: lazy(() => import('./pages/Import')),
  Categories: lazy(() => import('./pages/Categories')),
  Inventory: lazy(() => import('./pages/Inventory')),
  Demo: lazy(() => import('./pages/DemoData')),
  Customers: lazy(() => import('./pages/Customers')),
  Replacements: lazy(() => import('./pages/Replacements')),
  Employees: lazy(() => import('./pages/Employees')),
  Deliveries: lazy(() => import('./pages/Deliveries')),
  Offers: lazy(() => import('./pages/Offers')),
  Settings: lazy(() => import('./pages/Settings')),
  Reports: lazy(() => import('./pages/Reports')),
  Audit: lazy(() => import('./pages/Audit')),
  Account: lazy(() => import('./pages/Account')),
};

// Roles per path come from the sidebar definition so menu and routes can't disagree.
const rolesFor = (path: string): Role[] => NAV.flatMap((s) => s.items).find((i) => i.to === path)?.roles || ['owner', 'admin', 'employee'];

function Guard({ path, children }: { path: string; children: ReactNode }) {
  const { staff } = useSession();
  if (!staff) return <Navigate to="/login" replace />;
  if (!rolesFor(path).includes(staff.role)) return <Navigate to={homeFor(staff.role)} replace />;
  return <>{children}</>;
}

export default function App() {
  const { staff, ready } = useSession();
  if (!ready) return <Loading />;
  const r = (path: string, el: ReactNode, guardPath = path) => <Route path={path === '/' ? undefined : path.slice(1)} index={path === '/'} element={<Guard path={guardPath}>{el}</Guard>} />;
  const P = pages;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="login" element={staff ? <Navigate to={homeFor(staff.role)} replace /> : <Login />} />
        <Route element={staff ? <Layout /> : <Navigate to="/login" replace />}>
          {r('/', <P.Dashboard />)}
          {r('/orders', <P.Orders />)}
          {r('/orders/:number', <P.OrderDetail />, '/any')}
          {r('/payments', <P.Payments />)}
          {r('/products', <P.Products />)}
          {r('/products/:id', <P.ProductEdit />, '/products')}
          {r('/import', <P.Import />)}
          {r('/categories', <P.Categories />)}
          {r('/inventory', <P.Inventory />)}
          {r('/demo-data', <P.Demo />)}
          {r('/customers', <P.Customers />)}
          {r('/replacements', <P.Replacements />)}
          {r('/employees', <P.Employees />)}
          {r('/deliveries', <P.Deliveries />)}
          {r('/offers', <P.Offers />)}
          {r('/settings', <P.Settings />)}
          {r('/reports', <P.Reports />)}
          {r('/audit', <P.Audit />)}
          {r('/account', <P.Account />, '/any')}
          <Route path="*" element={<Navigate to={staff ? homeFor(staff.role) : '/login'} replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
