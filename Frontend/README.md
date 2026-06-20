# XLMPay Frontend

The payer-facing web application for XLMPay — a non-custodial recurring payments protocol on Stellar.

This app is how a payer connects their Stellar wallet, creates a payment authorization (subscription, payroll, rent, etc.), monitors its status, and revokes it whenever they choose. It does not hold funds, store private keys, or execute pulls itself — it only constructs and submits transactions that the user signs with their own wallet.

---

# 🚀 What This App Does

* Connect a Stellar wallet (Freighter, Albedo, or other supported wallet extensions)
* Create a new payment authorization by setting:
  * recipient address
  * asset (XLM, USDC, or other Stellar asset)
  * maximum amount per pull
  * minimum interval between pulls
  * expiry date or maximum number of pulls
* View all active, expired, and revoked authorizations tied to the connected wallet
* View pull history for each authorization (timestamps, amounts, success/failure)
* Revoke an active authorization at any time
* See upcoming/expected pull dates for active authorizations

This app talks to the [`contract/`](../contract) layer for on-chain reads/writes and optionally to the [`backend/`](../backend) API for indexed history and notifications.

---

# 🧑‍💻 Tech Stack

* **Next.js** — application framework
* **React** — UI library
* **TypeScript** — type safety
* **Tailwind CSS** — styling
* **Stellar SDK** — building and submitting Stellar/Soroban transactions
* **Wallet integration** — Freighter (primary), with Albedo/other Stellar wallet support planned

---

# 📁 Folder Structure

```text
frontend/
│
├── app/                        # Next.js app router pages
│   ├── page.tsx                 # Landing / wallet connect
│   ├── authorizations/          # List + detail views for authorizations
│   └── authorizations/new/      # Create authorization flow
│
├── components/                 # Reusable UI components
│   ├── WalletConnect.tsx
│   ├── AuthorizationCard.tsx
│   ├── AuthorizationForm.tsx
│   └── PullHistoryTable.tsx
│
├── lib/                         # Helpers and integrations
│   ├── stellar.ts               # Stellar SDK setup, network config
│   ├── contract.ts              # Soroban contract read/write calls
│   └── api.ts                   # Backend API client (optional indexed data)
│
├── hooks/                       # React hooks
│   ├── useWallet.ts
│   └── useAuthorizations.ts
│
├── public/                      # Static assets
│
├── styles/                      # Global styles (if not fully Tailwind-driven)
│
├── .env.example                 # Example environment variables
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── README.md                    # This file
```

---

# 📦 Installation & Setup

## Prerequisites

* Node.js 18+
* npm / yarn / pnpm
* A Stellar wallet browser extension (e.g., [Freighter](https://www.freighter.app/)) for local testing

## Install Dependencies

```bash
cd frontend
npm install
```

## Environment Variables

Copy the example file and fill in the values for your environment:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` or `mainnet` |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | RPC endpoint for the Soroban network being used |
| `NEXT_PUBLIC_CONTRACT_ID` | Deployed XLMPay Soroban contract address |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL for the backend API (optional, for indexed history) |

## Run Locally

```bash
npm run dev
```

The app runs at `http://localhost:3000` by default.

## Build for Production

```bash
npm run build
npm start
```

---

# 🧪 Testing

```bash
npm test
```

Tests cover:

* component rendering and interaction
* wallet connection state handling
* authorization form validation (amount, frequency, expiry inputs)
* contract call wrappers (mocked Soroban responses)

---

# 🔐 Security Notes

* This app **never** has access to private keys. All signing happens inside the user's wallet extension; the frontend only requests signatures and submits already-signed transactions.
* No sensitive data is stored in browser storage. Authorization state is read live from the chain (and optionally the backend index) rather than cached client-side as a source of truth.
* Always verify the contract address (`NEXT_PUBLIC_CONTRACT_ID`) matches the official deployed XLMPay contract before connecting a wallet with real funds — pointing this app at the wrong contract ID could result in interacting with an unverified or malicious contract.

---

# 🤝 Contributing

See the [root README](../README.md) for overall contribution guidelines. Frontend-specific notes:

* Follow the existing component structure under `components/` and `hooks/`
* Run `npm run lint` before opening a PR
* New contract interactions should go through `lib/contract.ts`, not be called ad hoc from components

---

