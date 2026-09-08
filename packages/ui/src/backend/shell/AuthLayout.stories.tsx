import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { Button } from '../../components/ui/button';
import { CrudForm } from '../forms/CrudForm';
import { AuthLayout } from './AuthLayout';

function SignInForm() {
  const [saved,setSaved]=useState(false);
  return saved ? <p role="status">This example accepted your sign-in details.</p> : <div className="space-y-6"><Button className="w-full" intent="neutral" appearance="stroke" onClick={fn()}>Continue with GitHub</Button><p className="text-center text-xs text-muted-foreground">Or continue with email</p><CrudForm<{email:string;password:string}> fields={[{name:'email',label:'Email address',type:'email',required:true},{name:'password',label:'Password',type:'password',required:true}]} schema={z.object({email:z.email(),password:z.string().min(8,'Use at least 8 characters.')})} endpoint="/storybook-api/sign-in" submitLabel="Continue with email" onSuccess={()=>setSaved(true)} /></div>;
}
const meta = {
  title: 'Backend/Layout/AuthLayout', component: AuthLayout, tags: ['autodocs'],
  parameters: { docs: { description: { component: 'Authentication layout with form and footer slots. Form and provider actions span the field width. Provider alternatives use neutral styling; the form submit is primary and footer navigation stays separate. The form uses a local mock; real authentication is supplied by the application.' } }, msw:{handlers:[http.post('/storybook-api/sign-in',()=>HttpResponse.json({ok:true,data:{}}))]} },
  args: { title:'Welcome back', description:'Sign in to view your sessions.', children:<SignInForm />,footer:<p>New here? Use either sign-in method to create an account.</p> },
} satisfies Meta<typeof AuthLayout>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SignIn: Story = {};
export const CheckInbox: Story = { args: {title:'Check your inbox',description:'Open the verification email to continue.',children:<p role="status" className="text-sm">A verification link was sent to alex@example.com.</p>,footer:<Button intent="neutral" appearance="stroke" onClick={fn()}>Resend email</Button>} };
export const ExpiredLink: Story = { args: {title:'This link has expired',description:'Request a new link to verify your email address.',children:<Button onClick={fn()}>Send a new link</Button>,footer:<p>You can keep using the same email address.</p>} };
