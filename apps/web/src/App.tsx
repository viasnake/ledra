import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { DEFAULT_BUNDLE_PATH, loadBundleFromUrl } from './index';
import { EntityDetailPage } from './routes/EntityDetailPage';
import { EntityListPage } from './routes/EntityListPage';
import { GlobalGraphPage } from './routes/GlobalGraphPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { uiCopy } from './copy';
import './styles.css';
import { ViewerProvider } from './viewer-context';
import type { CatalogaBundle } from '@cataloga/types';

type AppState =
  | {
      status: 'loading';
    }
  | {
      status: 'ready';
      bundle: CatalogaBundle;
    }
  | {
      status: 'error';
      message: string;
    };

const App = () => {
  const [state, setState] = useState<AppState>({ status: 'loading' });
  const bundlePath = DEFAULT_BUNDLE_PATH;

  useEffect(() => {
    let active = true;

    void loadBundleFromUrl(bundlePath)
      .then((bundle) => {
        if (active) {
          setState({ status: 'ready', bundle });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown bundle load error'
          });
        }
      });

    return () => {
      active = false;
    };
  }, [bundlePath]);

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-6">
        <section className="status-panel">
          <p className="eyebrow">loading</p>
          <h1>{uiCopy.status.loadingTitle}</h1>
          <p>{uiCopy.status.loadingBody}</p>
        </section>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-6">
        <section className="status-panel border-rose-200 bg-rose-50">
          <p className="eyebrow text-rose-700">bundle error</p>
          <h1>{uiCopy.status.errorTitle}</h1>
          <p>{state.message}</p>
        </section>
      </main>
    );
  }

  return (
    <ViewerProvider value={{ bundle: state.bundle, bundlePath }}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<EntityListPage />} />
          <Route path="explore" element={<Navigate replace to="/" />} />
          <Route path="graph" element={<GlobalGraphPage />} />
          <Route path="scopes/:scopeId" element={<EntityListPage />} />
          <Route path="nodes/:entityId" element={<EntityDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ViewerProvider>
  );
};

export default App;
