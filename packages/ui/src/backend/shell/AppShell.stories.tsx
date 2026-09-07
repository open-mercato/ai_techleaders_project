import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays, FileText, Settings, Users } from 'lucide-react';
import { fn } from 'storybook/test';
import { Button } from '../../components/ui/button';
import { DataTable } from '../tables/DataTable';
import { AppShell } from './AppShell';

const meta = {
  title: 'Backend/Layout/AppShell', component: AppShell, tags: ['autodocs'],
  parameters: { docs: { description: { component: 'Workspace layout for mentees, mentors and operators. Supply navigation and actions as React nodes; authorization and routing remain in the host. The sidebar is 272px on wide containers; compact screens show wrapping navigation above the content.' } } },
  args: {
    user: { displayName: 'Alex Morgan' },
    nav: <><a href="#sessions" aria-current="page"><CalendarDays aria-hidden="true" />My sessions</a><a href="#notes"><FileText aria-hidden="true" />Private notes</a><a href="#settings"><Settings aria-hidden="true" />Account</a></>,
    actions: <Button intent="neutral" appearance="stroke" size="sm" onClick={fn()}>Sign out</Button>,
    children: <section id="sessions" className="space-y-6"><div><h1 className="text-2xl font-medium">My sessions</h1><p className="mt-2 text-sm text-muted-foreground">View your sessions and follow-up notes.</p></div><DataTable caption="Upcoming sessions" columns={[{key:'mentor',header:'Mentor'},{key:'topic',header:'Topic'},{key:'date',header:'Date'}]} rows={[{id:'1',mentor:'Sam Taylor',topic:'React state',date:'8 Oct: 14:30 Europe/Warsaw'}]} getRowId={row=>row.id} /></section>,
  },
} satisfies Meta<typeof AppShell>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MenteeWorkspace: Story = {};
export const CombinedRoles: Story = { args: { nav: <><a href="#sessions" aria-current="page"><CalendarDays aria-hidden="true" />My sessions</a><a href="#availability"><CalendarDays aria-hidden="true" />Mentor availability</a><a href="#notes"><FileText aria-hidden="true" />Notes to review</a><a href="#users"><Users aria-hidden="true" />Users</a></> } };
export const Compact: Story = { render: args => <div style={{maxWidth:390}}><AppShell {...args} /></div> };
