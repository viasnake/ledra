import { useEffect, useState } from 'react';
import type { LedraBundle } from '@ledra/types';
import { Route, Routes } from 'react-router-dom';
import { loadBundleFromUrl, DEFAULT_BUNDLE_PATH } from './index';
import { AppLayout } from './components/AppLayout';
import { uiCopy } from './copy';
import { EntityDetailPage } from './routes/EntityDetailPage';
import { EntityListPage } from './routes/EntityListPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { ViewerProvider } from './viewer-context';
import './styles.css';

type AppState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bundlePath: string; bundle: LedraBundle };

const LoadingScreen = () => (
  <main className="mx-auto flex min-h-screen w-full max-w-[900px] items-center px-4 py-10 sm:px-6 lg:px-8">
    <section className="status-panel">
      <p className="eyebrow">読み込み中</p>
      <h1>{uiCopy.status.loadingTitle}</h1>
      <p>{uiCopy.status.loadingBody}</p>
    </section>
  </main>
);

const ErrorScreen = ({ message }: { message: string }) => (
  <main className="mx-auto flex min-h-screen w-full max-w-[900px] items-center px-4 py-10 sm:px-6 lg:px-8">
    <section className="status-panel border-rose-200/80 bg-rose-50/80">
      <p className="eyebrow text-rose-700">bundle 読み込み失敗</p>
      <h1>{uiCopy.status.errorTitle}</h1>
      <p>{message}</p>
    </section>
  </main>
);

const App = () => {
  const [state, setState] = useState<AppState>({ status: 'loading' });

  useEffect(() => {
    void loadBundleFromUrl(DEFAULT_BUNDLE_PATH)
      .then((bundle) => {
        setState({ status: 'ready', bundle, bundlePath: DEFAULT_BUNDLE_PATH });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to load registry bundle.';
        setState({ status: 'error', message });
      });
  }, []);

  if (state.status === 'loading') {
    return <LoadingScreen />;
  }

  if (state.status === 'error') {
    return <ErrorScreen message={state.message} />;
  }

  return (
    <ViewerProvider value={{ bundle: state.bundle, bundlePath: state.bundlePath }}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<EntityListPage />} />
          <Route path="explore" element={<EntityListPage />} />
          <Route path="nodes/:entityId" element={<EntityDetailPage />} />
          <Route path="scopes/:scopeId" element={<EntityListPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ViewerProvider>
  );
};

export default App;
