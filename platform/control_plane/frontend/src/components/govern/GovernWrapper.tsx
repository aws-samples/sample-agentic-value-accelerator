/**
 * GovernWrapper — Provides DataSourceContext to all Govern module pages.
 *
 * Wrap this around Govern routes or the GovernLanding to enable
 * data source health tracking across all Govern components.
 */
import { type ReactNode } from 'react';
import { DataSourceProvider } from './DataSourceContext';

interface Props {
  children: ReactNode;
}

export default function GovernWrapper({ children }: Props) {
  return (
    <DataSourceProvider>
      {children}
    </DataSourceProvider>
  );
}
