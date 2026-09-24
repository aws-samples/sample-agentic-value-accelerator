import React from 'react';

interface SectionDescriptionProps {
  text: string;
}

export default function SectionDescription({ text }: SectionDescriptionProps) {
  return (
    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 16px', lineHeight: 1.4 }}>
      {text}
    </p>
  );
}
