import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout, type PageId } from './components/Layout.tsx';
import { loadData, type SiteData } from './data.ts';
import { Briefs } from './pages/Briefs.tsx';
import { Gallery } from './pages/Gallery.tsx';
import { Method } from './pages/Method.tsx';
import { Overview } from './pages/Overview.tsx';
import { Results } from './pages/Results.tsx';
import './styles.css';

/** The data files each page needs besides run.json. */
const NEEDS: Record<PageId, ('cases' | 'briefs' | 'calibration')[]> = {
  overview: ['cases'],
  results: [],
  gallery: ['cases'],
  method: ['briefs', 'calibration'],
  briefs: ['briefs'],
};

function Page({ page, data }: { page: PageId; data: SiteData }) {
  switch (page) {
    case 'overview':
      return <Overview run={data.run} cases={data.cases!} />;
    case 'results':
      return <Results run={data.run} />;
    case 'gallery':
      return <Gallery run={data.run} cases={data.cases!} />;
    case 'method':
      return <Method run={data.run} briefs={data.briefs!} calibration={data.calibration!} />;
    case 'briefs':
      return <Briefs briefs={data.briefs!} />;
  }
}

function App({ page }: { page: PageId }) {
  const [data, setData] = useState<SiteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadData(NEEDS[page]).then(setData, (reason: unknown) => setError(String(reason)));
  }, [page]);
  useEffect(() => {
    // Rendered with its data: the site's own test waits for this before it runs the checks.
    if (data || error) document.body.dataset.ready = 'true';
  }, [data, error]);
  return (
    <Layout page={page} run={data?.run ?? null}>
      {error ? (
        <p role="alert" className="text-ink-2">The data of this page could not be loaded: {error}</p>
      ) : data ? (
        <Page page={page} data={data} />
      ) : (
        <p className="text-muted">Loading the data&hellip;</p>
      )}
    </Layout>
  );
}

const page = (document.body.dataset.page ?? 'overview') as PageId;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App page={page} />
  </StrictMode>,
);
