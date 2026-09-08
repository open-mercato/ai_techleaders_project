import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from './dropdown-menu';

const meta = {
  title: 'Primitives/DropdownMenu', component: DropdownMenu, tags: ['autodocs'],
  parameters: { docs: { description: { component: 'An action menu with keyboard navigation, disabled actions, checkbox/radio selections and nested groups. Compose Trigger + Content within Root; Sub uses SubTrigger + a portalled SubContent. Items use onSelect, which also works from the keyboard. Prevent the select event when a setting should keep the menu open. Shortcuts are descriptive labels; this component does not register global key bindings.' } } },
} satisfies Meta<typeof DropdownMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

function MenuExample() {
  const [completed, setCompleted] = useState(false);
  const [zone, setZone] = useState('local');
  const [action, setAction] = useState('No action selected.');
  return <div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}><DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="outline">Session actions</Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuLabel>Session</DropdownMenuLabel>
      <DropdownMenuGroup><DropdownMenuItem onSelect={() => setAction('View details selected.')} >View details<DropdownMenuShortcut>⌘ D</DropdownMenuShortcut></DropdownMenuItem><DropdownMenuItem disabled>Join before start</DropdownMenuItem></DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem checked={completed} onCheckedChange={value => setCompleted(value === true)} onSelect={event => event.preventDefault()}>Show completed</DropdownMenuCheckboxItem>
      <DropdownMenuSub><DropdownMenuSubTrigger>Display time zone</DropdownMenuSubTrigger><DropdownMenuPortal><DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={zone} onValueChange={setZone}><DropdownMenuRadioItem value="local">Europe/Warsaw</DropdownMenuRadioItem><DropdownMenuRadioItem value="utc">UTC</DropdownMenuRadioItem></DropdownMenuRadioGroup>
      </DropdownMenuSubContent></DropdownMenuPortal></DropdownMenuSub>
      <DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setAction('Remove draft selected; a real flow would request confirmation.')}>Remove local draft</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu><p role="status" style={{ margin: 0, fontSize: 14 }}>{action} Completed: {completed ? 'shown' : 'hidden'}. Zone: {zone === 'local' ? 'Europe/Warsaw' : 'UTC'}.</p></div>;
}
export const ActionsAndPreferences: Story = { render: () => <MenuExample /> };
export const Open: Story = {
  render: () => <DropdownMenu defaultOpen><DropdownMenuTrigger asChild><Button variant="outline">Actions</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuLabel inset>Available actions</DropdownMenuLabel><DropdownMenuItem inset>View details</DropdownMenuItem><DropdownMenuItem inset disabled>Join session</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem inset variant="destructive">Discard draft</DropdownMenuItem></DropdownMenuContent></DropdownMenu>,
};
