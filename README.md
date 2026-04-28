# Daily Tracker App

A responsive task tracker built with Next.js, Supabase, and Vercel.

## Features

- Email and password sign up / login
- Username profile linked to each account
- Daily tasks, habits, and upcoming tasks
- KPI dashboard with daily, monthly, and task-wise charts
- PDF export for a selected date range
- Responsive grid and table layout for mobile and laptop screens
- Supabase-backed sync across devices

## Setup

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Copy `.env.example` to `.env.local` and add your Supabase values.

3. In Supabase SQL editor, run [supabase/schema.sql](/C:/Users/krcha/OneDrive/Documents/New%20project/supabase/schema.sql).

4. Start the app:

   ```powershell
   npm.cmd run dev
   ```

## Deploy

1. Push this repo to GitHub.
2. Import the GitHub repo into Vercel.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel project settings.
4. Deploy.
