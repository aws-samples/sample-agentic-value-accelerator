import RegistryPlaceholder from './RegistryPlaceholder';

// Placeholder for /registry/custom-resources. AWS Agent Registry supports
// custom record types alongside the four typed ones (agent, MCP server,
// A2A server, skill) — the escape hatch for anything worth cataloging
// that doesn't fit those shapes.
export default function RegistryCustom() {
  return (
    <RegistryPlaceholder
      section="custom-resources"
      title="Custom Resources"
      tagline="The escape hatch. Register anything worth discovering — knowledge bases, prompt libraries, deployment templates, eval harnesses."
      description="AWS Agent Registry supports a `custom` record type — free-form metadata, tag-based discovery, same approval flow as the typed records. Use it for resources the four typed record shapes don't model: dataset catalogs, prompt collections, red-team suites, agent-invokable Lambdas, anything else your organization wants agents (or humans) to find."
      bulletHeading="What will land here"
      bullets={[
        'Register any typed or untyped resource with free-form JSON metadata',
        'Tag-based discovery — agents query by tag combinations at plan time',
        'Same schema validators as typed records for consistency',
        'Curated examples on first launch — knowledge bases, prompt libraries, eval harnesses',
        'Cross-links from Catalog / Fleet Management for resources also tracked elsewhere',
      ]}
      iconBg="from-rose-500 to-pink-600"
      iconPath="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
      tags={['Free-form', 'Discovery', 'AWS Agent Registry']}
    />
  );
}
