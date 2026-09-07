// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Badge, badgeVariants } from './badge';
import { Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, AvatarGroupCount } from './avatar';
import { Separator } from './separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './accordion';
import { Progress } from './progress';
import { Skeleton } from './skeleton';
import { Alert, AlertTitle, AlertDescription } from './alert';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis } from './breadcrumb';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from './pagination';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Badge', () => {
  it('exposes status variants, density and slotted link behavior', async () => {
    const user = userEvent.setup();
    const click = vi.fn(event => event.preventDefault());
    render(<><Badge>Pending</Badge><Badge variant="success" size="sm" className="session-state">Paid</Badge>
      <Badge variant="destructive" size="lg">Failed</Badge><Badge variant="link" asChild><a href="#session" onClick={click}>Session</a></Badge></>);
    expect(screen.getByText('Pending').getAttribute('data-size')).toBe('md');
    expect(screen.getByText('Pending').className).toBe('dm-badge dm-badge-primary');
    expect(screen.getByText('Paid').className).toBe('dm-badge dm-badge-success session-state');
    expect(screen.getByText('Paid').getAttribute('data-size')).toBe('sm');
    expect(screen.getByText('Failed').getAttribute('data-variant')).toBe('destructive');
    await user.click(screen.getByRole('link', { name: 'Session' }));
    expect(click).toHaveBeenCalledOnce();
    expect(badgeVariants({ variant: 'outline' })).toBe('dm-badge dm-badge-outline');
  });
});

describe('Avatar', () => {
  it('renders fallback identities, size options, a labeled presence badge and grouped overflow', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<AvatarGroup className="mentors"><Avatar ref={ref} className="mentor"><AvatarImage src="" alt="Ada Lovelace" className="photo" /><AvatarFallback className="initials">AL</AvatarFallback><AvatarBadge aria-label="Available" className="presence" /></Avatar>
      <Avatar size="sm"><AvatarFallback>GH</AvatarFallback></Avatar><Avatar size="lg"><AvatarFallback>JT</AvatarFallback></Avatar><AvatarGroupCount className="overflow" aria-label="3 more mentors">+3</AvatarGroupCount></AvatarGroup>);
    expect(ref.current?.getAttribute('data-size')).toBe('default');
    expect(ref.current?.className).toBe('dm-avatar mentor');
    expect(screen.getByText('AL').className).toBe('dm-avatar-fallback initials');
    expect(screen.getByLabelText('Available').className).toBe('dm-avatar-badge presence');
    expect(screen.getByLabelText('3 more mentors').className).toBe('dm-avatar-group-count overflow');
    expect(screen.getByText('GH').parentElement?.getAttribute('data-size')).toBe('sm');
    expect(screen.getByText('JT').parentElement?.getAttribute('data-size')).toBe('lg');
  });

  it('shows a loaded image with its accessible name and forwarded styling', async () => {
    class LoadedImage extends EventTarget {
      complete = false;
      naturalWidth = 0;
      set src(value: string) { if (value) queueMicrotask(() => { this.complete = true; this.naturalWidth = 40; this.dispatchEvent(new Event('load')); }); }
    }
    vi.stubGlobal('Image', LoadedImage);
    render(<Avatar><AvatarImage src="/mentor.jpg" alt="Ada Lovelace" className="photo" /><AvatarFallback>AL</AvatarFallback></Avatar>);
    const image = await screen.findByRole('img', { name: 'Ada Lovelace' });
    expect(image.getAttribute('src')).toBe('/mentor.jpg');
    expect(image.className).toBe('dm-avatar-image photo');
    expect(screen.queryByText('AL')).toBeNull();
  });
});

it('distinguishes decorative separators from semantic horizontal and vertical separators', () => {
  const { container } = render(<><Separator className="decoration" /><Separator decorative={false} /><Separator decorative={false} orientation="vertical" /></>);
  expect(container.firstElementChild?.getAttribute('role')).toBe('none');
  expect(container.firstElementChild?.className).toBe('dm-separator decoration');
  expect(screen.getAllByRole('separator')).toHaveLength(2);
  expect(screen.getAllByRole('separator')[1]?.getAttribute('aria-orientation')).toBe('vertical');
});

function SessionTabs({ orientation }: { orientation?: 'horizontal' | 'vertical' }) {
  return <Tabs orientation={orientation} defaultValue="upcoming" className="sessions"><TabsList aria-label="Sessions" className="session-tabs" variant={orientation === 'vertical' ? 'line' : undefined}>
    <TabsTrigger value="upcoming" className="upcoming">Upcoming</TabsTrigger><TabsTrigger value="blocked" disabled>Unavailable</TabsTrigger><TabsTrigger value="past">Past</TabsTrigger>
  </TabsList><TabsContent value="upcoming" className="upcoming-panel">Upcoming session list</TabsContent><TabsContent value="past">Past session list</TabsContent></Tabs>;
}

it.each(['horizontal', 'vertical'] as const)('supports %s tab keyboard selection, connected panels and disabled skipping', async orientation => {
  const user = userEvent.setup();
  render(<SessionTabs orientation={orientation === 'horizontal' ? undefined : orientation} />);
  const first = screen.getByRole('tab', { name: 'Upcoming' });
  expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe(orientation);
  expect(first.className).toBe('dm-tabs-trigger upcoming');
  expect(first.getAttribute('aria-controls')).toBe(screen.getByRole('tabpanel').id);
  expect(screen.getByRole('tabpanel').className).toBe('dm-tabs-content upcoming-panel');
  first.focus();
  await user.keyboard(orientation === 'horizontal' ? '{ArrowRight}' : '{ArrowDown}');
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Past' }).getAttribute('aria-selected')).toBe('true'));
  expect(screen.getByRole('tabpanel').textContent).toBe('Past session list');
  expect(screen.getByRole('tab', { name: 'Unavailable' }).getAttribute('aria-selected')).toBe('false');
});

it('expands and collapses accordion content through keyboard while preserving disabled items', async () => {
  const user = userEvent.setup();
  const changed = vi.fn();
  render(<Accordion type="single" collapsible onValueChange={changed}><AccordionItem value="written" className="answer-format"><AccordionTrigger className="question">How are answers delivered?</AccordionTrigger><AccordionContent className="answer">As a written reply.</AccordionContent></AccordionItem><AccordionItem value="disabled" disabled><AccordionTrigger>Unavailable question</AccordionTrigger><AccordionContent>Unavailable answer</AccordionContent></AccordionItem></Accordion>);
  const trigger = screen.getByRole('button', { name: 'How are answers delivered?' });
  expect(trigger.className).toBe('dm-accordion-trigger question');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  trigger.focus();
  await user.keyboard('{Enter}');
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('As a written reply.').className).toBe('dm-accordion-content-inner answer');
  expect(screen.getByRole('region').id).toBe(trigger.getAttribute('aria-controls'));
  expect(changed).toHaveBeenLastCalledWith('written');
  await user.keyboard(' ');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(changed).toHaveBeenLastCalledWith('');
  await user.click(screen.getByRole('button', { name: 'Unavailable question' }));
  expect(screen.getByRole('button', { name: 'Unavailable question' }).getAttribute('aria-expanded')).toBe('false');
});

describe('Progress', () => {
  it.each([{value: 0, max: undefined, percent: 0}, {value: 40, max: undefined, percent: 40}, {value: 3, max: 4, percent: 75}, {value: 4, max: 4, percent: 100}])('keeps visual and accessible progress aligned for $value of $max', ({value,max,percent}) => {
    render(<Progress value={value} max={max} aria-label="Profile completion" className="completion" />);
    const progress = screen.getByRole('progressbar', { name: 'Profile completion' });
    expect(progress.className).toBe('dm-progress completion');
    expect(progress.getAttribute('aria-valuenow')).toBe(String(value));
    expect(progress.getAttribute('aria-valuemax')).toBe(String(max ?? 100));
    expect(progress.querySelector<HTMLElement>('[data-slot="progress-indicator"]')?.style.transform).toBe(`translateX(-${100-percent}%)`);
    expect(progress.getAttribute('data-state')).toBe(percent === 100 ? 'complete' : 'loading');
  });
  it.each([undefined, null, -1, 101, NaN, Infinity])('represents missing or invalid value %s as indeterminate', value => {
    render(<Progress value={value} aria-label="Loading sessions" />);
    const progress = screen.getByRole('progressbar');
    expect(progress.hasAttribute('aria-valuenow')).toBe(false);
    expect(progress.getAttribute('data-state')).toBe('indeterminate');
  });
  it.each([0, -4, NaN, Infinity])('normalizes invalid max %s consistently', max => {
    render(<Progress max={max} value={50} aria-label="Loading sessions" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('100');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  });
});

it('keeps visual skeletons hidden from accessibility and permits native layout props', () => {
  const { container } = render(<Skeleton className="avatar-placeholder" style={{ width: 40, height: 40 }} />);
  const skeleton = container.firstElementChild as HTMLElement;
  expect(skeleton.getAttribute('aria-hidden')).toBe('true');
  expect(skeleton.className).toBe('dm-skeleton avatar-placeholder');
  expect(skeleton.style.width).toBe('40px');
});

it('announces actionable alerts and supports a less urgent status role', () => {
  render(<><Alert className="notice"><AlertTitle className="title">Payment pending</AlertTitle><AlertDescription className="details">Your session is reserved.</AlertDescription></Alert>
    <Alert variant="destructive"><AlertTitle>Payment failed</AlertTitle><AlertDescription>Choose a payment method and retry.</AlertDescription></Alert>
    <Alert variant="success" role="status"><AlertDescription>Profile saved</AlertDescription></Alert></>);
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  expect(screen.getByText('Payment pending').className).toBe('dm-alert-title title');
  expect(screen.getByText('Your session is reserved.').className).toBe('dm-alert-description details');
  expect(screen.getByText('Payment failed').parentElement?.className).toBe('dm-alert dm-alert-error');
  expect(screen.getByRole('status').textContent).toBe('Profile saved');
});

it('retains breadcrumb navigation, slotted links, current-page semantics and decorative separators', async () => {
  const user = userEvent.setup();
  const expand = vi.fn();
  render(<Breadcrumb aria-label="Location"><BreadcrumbList className="location-list"><BreadcrumbItem className="location"><BreadcrumbLink href="#home" className="home">Home</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="chevron" />
    <BreadcrumbItem><BreadcrumbLink asChild><button onClick={expand} aria-label="Show parent pages"><BreadcrumbEllipsis className="more" /></button></BreadcrumbLink></BreadcrumbItem>
    <BreadcrumbSeparator>/</BreadcrumbSeparator><BreadcrumbItem><BreadcrumbPage className="current">Session</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>);
  expect(screen.getByRole('navigation', { name: 'Location' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('#home');
  expect(screen.getByRole('link', { name: 'Session' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: 'Session' }).getAttribute('aria-disabled')).toBe('true');
  await user.click(screen.getByRole('button', { name: 'Show parent pages' }));
  expect(expand).toHaveBeenCalledOnce();
  expect(screen.getByText('/').getAttribute('aria-hidden')).toBe('true');
});

it('exposes the current pagination page, guards disabled links and forwards enabled actions', async () => {
  const user = userEvent.setup();
  const change = vi.fn(event => event.preventDefault());
  render(<Pagination className="pages"><PaginationContent className="page-list"><PaginationItem><PaginationPrevious href="#previous" disabled onClick={change} className="previous" /></PaginationItem>
    <PaginationItem><PaginationLink href="#page1" isActive className="current-page">1</PaginationLink></PaginationItem>
    <PaginationItem><PaginationLink href="#page2" onClick={change}>2</PaginationLink></PaginationItem>
    <PaginationItem><PaginationEllipsis className="ellipsis" /></PaginationItem><PaginationItem><PaginationNext href="#next" onClick={change} className="next" /></PaginationItem></PaginationContent></Pagination>);
  expect(screen.getByRole('navigation', { name: 'pagination' }).className).toBe('dm-pagination pages');
  const current = screen.getByRole('link', { name: '1' });
  expect(current.getAttribute('aria-current')).toBe('page');
  expect(current.className).toContain('dm-button-stroke');
  fireEvent.click(current);
  const previous = screen.getByLabelText('Go to previous page');
  expect(previous.getAttribute('aria-disabled')).toBe('true');
  expect(previous.hasAttribute('href')).toBe(false);
  expect(previous.tabIndex).toBe(-1);
  fireEvent.click(previous);
  expect(change).not.toHaveBeenCalled();
  await user.click(screen.getByRole('link', { name: '2' }));
  await user.click(screen.getByRole('link', { name: 'Go to next page' }));
  expect(change).toHaveBeenCalledTimes(2);
});
