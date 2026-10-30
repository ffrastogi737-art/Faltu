import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import Home from './pages/Home';

const Categories = lazy(() => import('./pages/Categories'));
const ProductList = lazy(() => import('./pages/ProductList'));
const ProductPage = lazy(() => import('./pages/ProductPage'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Orders = lazy(() => import('./pages/Orders'));
const OrderPage = lazy(() => import('./pages/OrderPage'));
const Replacement = lazy(() => import('./pages/Replacement'));
const Account = lazy(() => import('./pages/Account'));
const Auth = lazy(() => import('./pages/Auth'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Policy = lazy(() => import('./pages/Policy'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <Suspense fallback={<div className="grid h-dvh place-items-center text-champagne"><Spinner /></div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="categories" element={<Categories />} />
            <Route path="category/:slug" element={<ProductList />} />
            <Route path="collection/:tag" element={<ProductList />} />
            <Route path="search" element={<ProductList />} />
            <Route path="product/:slug" element={<ProductPage />} />
            <Route path="wishlist" element={<Wishlist />} />
            <Route path="cart" element={<Cart />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:number" element={<OrderPage />} />
            <Route path="orders/:number/replacement" element={<Replacement />} />
            <Route path="account" element={<Account />} />
            <Route path="login" element={<Auth mode="login" />} />
            <Route path="register" element={<Auth mode="register" />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="policy" element={<Policy />} />
            <Route path="*" element={<Policy notFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
