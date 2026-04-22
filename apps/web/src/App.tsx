import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import type { CatalogaBundle } from '@cataloga/types';
import { AppLayout } from './components/AppLayout';
import { DEFAULT_BUNDLE_PATH, loadBundleFromUrl } from './index';
import { EntityDetailPage } from './routes/EntityDetailPage';
import { EntityListPage } from './routes/EntityListPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { ViewerProvider } from './viewer-context';
import './styles.css';

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
      <main className="mx-auto flex min-h-screen w-full max-w-[1040px] items-center px-4 py-10 sm:px-6 lg:px-8">
        <section className="status-panel">
          <p className="eyebrow">loading</p>
          <h1>Cataloga viewer</h1>
          <p>Loading published bundle from {bundlePath}.</p>
        </section>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1040px] items-center px-4 py-10 sm:px-6 lg:px-8">
        <section className="status-panel border-rose-200/80 bg-rose-50/80">
          <p className="eyebrow text-rose-700">bundle load error</p>
          <h1>Unable to load Cataloga bundle</h1>
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
          <Route path="scopes/:scopeId" element={<EntityListPage />} />
          <Route path="nodes/:entityId" element={<EntityDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ViewerProvider>
  );
};

export default App;
