// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';
afterEach(cleanup);
it('composes semantic headings and forwards attributes and a card ref', () => {
  const ref = createRef<HTMLDivElement>();
  render(<Card ref={ref} className="custom" aria-label="Session"><CardHeader><CardTitle asChild><h2>React state</h2></CardTitle><CardDescription>With Alex</CardDescription></CardHeader><CardContent>25 minutes</CardContent><CardFooter><button>Book</button></CardFooter></Card>);
  expect(ref.current?.getAttribute('aria-label')).toBe('Session');
  expect(ref.current?.classList.contains('custom')).toBe(true);
  expect(screen.getByRole('heading', { name: 'React state', level: 2 }).classList.contains('dm-card-title')).toBe(true);
  expect(screen.getByRole('button', { name: 'Book' })).toBeTruthy();
});
it('preserves the existing non-heading title contract and classes for all slots', () => {
  render(<Card><CardHeader className="header"><CardTitle className="title">Legacy title</CardTitle><CardDescription className="description">Description</CardDescription></CardHeader><CardContent className="content">Content</CardContent><CardFooter className="footer">Footer</CardFooter></Card>);
  expect(screen.getByText('Legacy title').tagName).toBe('DIV');
  for (const [text, name] of [['Legacy title','title'],['Description','description'],['Content','content'],['Footer','footer']]) expect(screen.getByText(text!).classList.contains(name!)).toBe(true);
});
