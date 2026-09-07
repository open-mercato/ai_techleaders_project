// @vitest-environment jsdom
// jsdom has no clipping geometry; collision placement is verified in the browser.
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from './dropdown-menu';
import { overlayHarness, slot } from './overlay.test-helpers';

describe('DropdownMenu', () => {
  const dom = overlayHarness();

  it('opens with ArrowDown, skips disabled actions and returns focus after Escape', async () => {
    await dom.render(<DropdownMenu><DropdownMenuTrigger>Session actions</DropdownMenuTrigger><DropdownMenuContent avoidCollisions={false}>
      <DropdownMenuLabel>Session</DropdownMenuLabel><DropdownMenuGroup>
        <DropdownMenuItem disabled>Join before start</DropdownMenuItem>
        <DropdownMenuItem>View details<DropdownMenuShortcut>⌘ D</DropdownMenuShortcut></DropdownMenuItem>
      </DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuItem inset variant="destructive">Remove local draft</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>);
    const trigger = slot('dropdown-menu-trigger');
    await dom.focus(trigger);
    await dom.key(trigger, 'ArrowDown');
    const menu = slot('dropdown-menu-content');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(document.activeElement?.textContent).toBe('View details⌘ D');
    expect(document.querySelector('[data-disabled]')?.getAttribute('aria-disabled')).toBe('true');
    await dom.key(document.activeElement!, 'ArrowDown');
    expect(document.activeElement?.textContent).toBe('Remove local draft');
    await dom.key(menu, 'Escape');
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('forwards selection, custom placement and content refs', async () => {
    const onSelect = vi.fn();
    const ref = createRef<HTMLDivElement>();
    await dom.render(<DropdownMenu defaultOpen><DropdownMenuTrigger>Actions</DropdownMenuTrigger><DropdownMenuContent avoidCollisions={false} ref={ref} className="custom" sideOffset={12} align="end"><DropdownMenuItem onSelect={onSelect}>View notes</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
    expect(ref.current).toBe(slot('dropdown-menu-content'));
    expect(ref.current?.className).toContain('dm-dropdown-menu-content custom');
    await dom.click(slot('dropdown-menu-item'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('updates checkbox and radio semantics while callers may keep the menu open', async () => {
    function Preferences() {
      const [checked, setChecked] = useState<boolean | 'indeterminate'>('indeterminate');
      const [zone, setZone] = useState('local');
      return <DropdownMenu defaultOpen><DropdownMenuTrigger>Preferences</DropdownMenuTrigger><DropdownMenuContent avoidCollisions={false}>
        <DropdownMenuCheckboxItem checked={checked} onCheckedChange={setChecked} onSelect={event => event.preventDefault()}>Show completed</DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value={zone} onValueChange={setZone}>
          <DropdownMenuRadioItem value="local" onSelect={event => event.preventDefault()}>Local time</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="utc" onSelect={event => event.preventDefault()}>UTC</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent></DropdownMenu>;
    }
    await dom.render(<Preferences />);
    const checkbox = slot('dropdown-menu-checkbox-item');
    expect(checkbox.getAttribute('aria-checked')).toBe('mixed');
    await dom.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    await dom.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    const utc = document.querySelectorAll('[role="menuitemradio"]')[1]!;
    await dom.click(utc);
    expect(utc.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[role="menuitemradio"]')?.getAttribute('aria-checked')).toBe('false');
  });

  it('supports a portalled submenu and inset labels', () => {
    // Inspect composition synchronously, before layout work that jsdom cannot model.
    dom.renderSync(<DropdownMenu defaultOpen><DropdownMenuTrigger>Actions</DropdownMenuTrigger><DropdownMenuContent avoidCollisions={false}>
      <DropdownMenuLabel inset>Display</DropdownMenuLabel>
      <DropdownMenuSub open><DropdownMenuSubTrigger inset>Time zone</DropdownMenuSubTrigger><DropdownMenuPortal><DropdownMenuSubContent avoidCollisions={false} className="custom"><DropdownMenuItem>Europe/Warsaw</DropdownMenuItem></DropdownMenuSubContent></DropdownMenuPortal></DropdownMenuSub>
    </DropdownMenuContent></DropdownMenu>);
    expect(slot('dropdown-menu-sub-trigger').getAttribute('aria-expanded')).toBe('true');
    expect(slot('dropdown-menu-sub-trigger').dataset.inset).toBe('true');
    expect(slot('dropdown-menu-label').dataset.inset).toBe('true');
    expect(slot('dropdown-menu-sub-content').className).toContain('dm-dropdown-menu-sub-content custom');
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(2);
    dom.renderSync(null);
  });
});
