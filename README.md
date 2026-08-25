# Welfare Society Foundation Portal

A comprehensive donation management and administration portal built with React, Vite, and Supabase.

## 🚀 Features

- **Member Portal**: Members can securely look up their profiles using their member code and phone number.
- **Online Payments**: Integrated with AmarPay to allow members to securely pay monthly donation dues online.
- **Dynamic Redirection**: Automatically handles payment redirections for both local development environments and GitHub Pages production.
- **Admin Dashboard**: Secure admin portal for managing members, HR, payroll, accounts, and reports.
- **Automated Journaling**: Direct income is automatically recorded in the general ledger upon successful payment verification.

## 🛠 Tech Stack

- **Frontend**: React, Vite, React Router DOM, Lucide Icons
- **Backend / Database**: Supabase (PostgreSQL), Supabase Edge Functions (Deno)
- **Payment Gateway**: AmarPay
- **Deployment**: GitHub Pages (Frontend), Supabase (Backend/Database)

## 📦 Setup & Installation

### 1. Local Development

Clone the repository and install dependencies:
```bash
git clone https://github.com/Tanvirshakil607159/donation-app.git
cd donation-app/frontend
npm install
```

Run the development server:
```bash
npm run dev
```

### 2. Environment Variables

Create a `.env` file in the `frontend` directory and add your Supabase credentials:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Deploying Supabase Edge Functions

To deploy the AmarPay integration functions:
```bash
npx supabase functions deploy payment-init
npx supabase functions deploy payment-ipn
```

## 🌐 Production Deployment

This project is configured to be automatically published to GitHub Pages using `gh-pages`. To publish a new version:

```bash
cd frontend
npm run build
npx gh-pages -d dist
```

## 🔒 Security

- Sensitive keys (like AmarPay Signature Key and Supabase Service Role Key) are securely stored in Supabase Edge Secrets, ensuring they are never exposed to the frontend client.
- IPN (Instant Payment Notification) handles offline verification of payments directly with the AmarPay server to prevent spoofing.
