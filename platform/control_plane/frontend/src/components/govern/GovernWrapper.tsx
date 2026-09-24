/**
 * GovernWrapper — Provides DataSourceContext to all Govern module pages.
 *
 * Wrap this around Govern routes or the GovernLanding to enable
 * data source health tracking across all Govern components.
 *
 * Also runs cache warming on first mount to pre-fetch common data.
 */
import { type ReactNode } from 'react';
import { DataSourceProvider } from './DataSourceContext';
import { useCacheWarming } from './useCacheWarming';

interface Props {
  children: ReactNode;
}

function GovernWrapperInner({ children }: Props) {
  useCacheWarming();
  return <>{children}</>;
}

export default function GovernWrapper({ children }: Props) {
  return (
    <DataSourceProvider>
      <GovernWrapperInner>{children}</GovernWrapperInner>
    </DataSourceProvider>
  );
}
