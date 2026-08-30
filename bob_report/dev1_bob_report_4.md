# Run the app

---

**Status:** active  **Date:** 2026-08-30

---

### 👤 User

Run the app

---

### 🤖 Assistant

> 🔧 called: list_files, read_file

Let me look at the project structure to understand how to run it.

> 🔧 **list_files** — .

> 🔧 **read_file** — package.json

### 🤖 Assistant

This is a monorepo with a `client` and `server`. The `dev` script runs both concurrently. Since this is a long-running process, you'll need to run it in your own terminal:

```bash
npm run dev
```

This uses `concurrently` to start both:
- **Server** — `npm run dev` in [`server/`](server/)
- **Client** — `npm run dev` in [`client/`](client/)

Run that command from the workspace root (`/Users/tejasramramesh/Documents/GitHub/BOB_THE_BUILDER/BOB_THE_BUILDER`).

---

### 👤 User

run trhe app

---

### 🤖 Assistant

I can't run long-running background processes like dev servers directly. Please run this in your terminal:

```bash
npm run dev
```

This starts both the server and client concurrently from the project root.