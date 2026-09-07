import { Atom, Braces, CodeXml } from 'lucide-react';

export interface TechnologyChipsProps {
  stacks: string[];
  label?: string;
}

function TechnologyIcon({ stack }: { stack: string }) {
  switch (stack.toLowerCase()) {
    case 'typescript': return <span className="dm-technology-typescript" aria-hidden="true">TS</span>;
    case 'react': return <Atom className="dm-technology-react" aria-hidden="true" />;
    case 'api':
    case 'api design': return <Braces aria-hidden="true" />;
    default: return <CodeXml aria-hidden="true" />;
  }
}

export function TechnologyChips({ stacks, label = 'Technology stacks' }: TechnologyChipsProps) {
  return <ul className="dm-product-tags dm-technology-chips" aria-label={label}>{stacks.map(stack => <li key={stack}><TechnologyIcon stack={stack} /><span>{stack}</span></li>)}</ul>;
}
