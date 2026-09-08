// @vitest-environment jsdom

import { act, createRef, type FormEvent, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button, buttonVariants } from './button';

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(children: ReactNode) {
  act(() => root.render(children));
}

function button() {
  return container.querySelector('button')!;
}

describe('buttonVariants compatibility', () => {
  it('defaults to primary filled medium and treats nullable options as omitted', () => {
    expect(buttonVariants()).toBe('dm-button dm-button-primary dm-button-filled dm-button-md');
    expect(buttonVariants({ variant: null, intent: null, appearance: null, size: null }))
      .toBe(buttonVariants());
  });

  it.each([
    ['default', 'primary', 'filled'],
    ['destructive', 'error', 'filled'],
    ['outline', 'neutral', 'stroke'],
    ['secondary', 'neutral', 'lighter'],
    ['ghost', 'neutral', 'ghost'],
    ['link', 'primary', 'ghost'],
  ] as const)('maps the %s legacy variant to %s %s', (variant, intent, appearance) => {
    const classes = buttonVariants({ variant }).split(' ');
    expect(classes).toContain(`dm-button-${intent}`);
    expect(classes).toContain(`dm-button-${appearance}`);
    expect(classes.includes('dm-button-link')).toBe(variant === 'link');
  });

  it.each(['primary', 'neutral', 'error'] as const)('supports every appearance for %s', intent => {
    for (const appearance of ['filled', 'stroke', 'lighter', 'ghost'] as const) {
      expect(buttonVariants({ intent, appearance })).toBe(
        `dm-button dm-button-${intent} dm-button-${appearance} dm-button-md`,
      );
    }
  });

  it('lets intent and appearance each override only their respective alias', () => {
    expect(buttonVariants({ variant: 'outline', intent: 'error' }))
      .toContain('dm-button-error dm-button-stroke');
    expect(buttonVariants({ variant: 'destructive', appearance: 'lighter' }))
      .toContain('dm-button-error dm-button-lighter');
    expect(buttonVariants({ variant: 'outline', intent: 'primary', appearance: 'filled' }))
      .toContain('dm-button-primary dm-button-filled');
  });

  it('retains link treatment for an intent override but removes it for an appearance override', () => {
    expect(buttonVariants({ variant: 'link', intent: 'neutral' }))
      .toBe('dm-button dm-button-neutral dm-button-ghost dm-button-md dm-button-link');
    expect(buttonVariants({ variant: 'link', appearance: 'stroke' }))
      .toBe('dm-button dm-button-primary dm-button-stroke dm-button-md');
  });

  it.each([
    ['md', 'md'], ['sm', 'sm'], ['xs', 'xs'], ['xxs', 'xxs'],
    ['default', 'sm'], ['lg', 'md'], ['icon', 'sm'],
  ] as const)('maps size %s to the %s geometry', (size, expected) => {
    expect(buttonVariants({ size }).split(' ')).toContain(`dm-button-${expected}`);
    expect(buttonVariants({ size }).split(' ').includes('dm-button-icon')).toBe(size === 'icon');
  });

  it('supports an explicit icon-only modifier at every size', () => {
    expect(buttonVariants({ size: 'xxs', iconOnly: true })).toContain('dm-button-xxs dm-button-icon');
    expect(buttonVariants({ iconOnly: false })).not.toContain('dm-button-icon');
  });

  it('appends and merges caller classes while retaining the component classes', () => {
    expect(buttonVariants({ class: 'px-2 legacy-class', className: 'px-4 caller-class' }))
      .toBe('dm-button dm-button-primary dm-button-filled dm-button-md legacy-class px-4 caller-class');
  });
});

describe('Button rendering and native behavior', () => {
  it('renders the text inset and forwards native attributes, custom classes and the ref', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref} type="button" id="save" name="action" value="save"
      title="Save the draft" data-tracking="save" className="caller-class">Save draft</Button>);

    expect(ref.current).toBe(button());
    expect(button().className).toBe('dm-button dm-button-primary dm-button-filled dm-button-md caller-class');
    expect(button().type).toBe('button');
    expect(button().id).toBe('save');
    expect(button().name).toBe('action');
    expect(button().value).toBe('save');
    expect(button().title).toBe('Save the draft');
    expect(button().dataset.tracking).toBe('save');
    expect(button().children).toHaveLength(1);
    expect(button().firstElementChild?.className).toBe('dm-button-label');
    expect(button().textContent).toBe('Save draft');
  });

  it('renders leading and trailing icon slots in order without exposing decoration to accessibility', () => {
    render(<Button intent="error" appearance="stroke" size="xs"
      leadingIcon={<svg data-icon="leading" />} trailingIcon={<svg data-icon="trailing" />}>Remove</Button>);

    expect(button().className).toBe('dm-button dm-button-error dm-button-stroke dm-button-xs');
    expect(Array.from(button().children, node => node.className))
      .toEqual(['dm-button-icon-slot', 'dm-button-label', 'dm-button-icon-slot']);
    const icons = button().querySelectorAll('.dm-button-icon-slot');
    expect(icons[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(icons[1]?.getAttribute('aria-hidden')).toBe('true');
    expect(icons[0]?.firstElementChild?.getAttribute('data-icon')).toBe('leading');
    expect(icons[1]?.firstElementChild?.getAttribute('data-icon')).toBe('trailing');
    expect(button().hasAttribute('intent')).toBe(false);
    expect(button().hasAttribute('appearance')).toBe(false);
    expect(button().hasAttribute('leadingIcon')).toBe(false);
  });

  it('keeps numeric children and omits null icon slots', () => {
    render(<Button leadingIcon={null} trailingIcon={null}>{0}</Button>);
    expect(button().textContent).toBe('0');
    expect(button().children).toHaveLength(1);
  });

  it.each([
    { iconOnly: true, size: 'md' as const },
    { size: 'icon' as const },
  ])('preserves direct icon children with %j', props => {
    render(<Button {...props} aria-label="Add a slot"><svg data-icon="add" /></Button>);
    expect(button().classList.contains('dm-button-icon')).toBe(true);
    expect(button().firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(button().querySelector('.dm-button-label')).toBeNull();
    expect(button().getAttribute('aria-label')).toBe('Add a slot');
    expect(button().hasAttribute('iconOnly')).toBe(false);
  });

  it('preserves native click, focus and keyboard event forwarding', () => {
    const onClick = vi.fn();
    const onFocus = vi.fn();
    const onKeyDown = vi.fn();
    render(<Button onClick={onClick} onFocus={onFocus} onKeyDown={onKeyDown}>Save</Button>);
    act(() => {
      button().focus();
      button().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      button().click();
    });
    expect(onClick).toHaveBeenCalledOnce();
    expect(onFocus).toHaveBeenCalledOnce();
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onKeyDown.mock.calls[0]?.[0].key).toBe('Enter');
  });

  it('uses native disabled behavior without firing clicks or submitting the form', () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
    render(<form onSubmit={onSubmit}><Button disabled onClick={onClick}>Save</Button></form>);
    expect(button().disabled).toBe(true);
    expect(button().type).toBe('submit');
    act(() => button().click());
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    render(<form onSubmit={onSubmit}><Button disabled={false} onClick={onClick}>Save</Button></form>);
    act(() => button().click());
    expect(onClick).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('slots onto one anchor without adding a label wrapper and composes refs and events', () => {
    const forwardedRef = createRef<HTMLButtonElement>();
    const childRef = createRef<HTMLAnchorElement>();
    const eventOrder: string[] = [];
    render(<Button asChild ref={forwardedRef} variant="link" className="parent-class"
      onClick={() => eventOrder.push('parent')}>
      <a ref={childRef} href="#details" className="child-class"
        onClick={event => { event.preventDefault(); eventOrder.push('child'); }}>
        <svg aria-hidden="true" /><span>Session details</span>
      </a>
    </Button>);

    const anchor = container.querySelector('a')!;
    expect(container.querySelector('button')).toBeNull();
    expect(anchor.getAttribute('href')).toBe('#details');
    expect(anchor.className).toBe('dm-button dm-button-primary dm-button-ghost dm-button-md dm-button-link parent-class child-class');
    expect(anchor.children).toHaveLength(2);
    expect(anchor.querySelector('.dm-button-label')).toBeNull();
    expect(forwardedRef.current).toBe(anchor);
    expect(childRef.current).toBe(anchor);
    act(() => anchor.click());
    expect(eventOrder).toEqual(['child', 'parent']);
  });
});
