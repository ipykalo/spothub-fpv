# SpotHub FPV — setup

`spothub-fpv.zip` contains the full project **including its `.git` folder**, so
there is already one commit on `main`. `node_modules` is not included.

## 1. Extract

Extract the zip in `D:\Workspace\repos` so you end up with:

```
D:\Workspace\repos\spothub-fpv\
```

PowerShell:

```powershell
cd D:\Workspace\repos
Expand-Archive .\spothub-fpv.zip -DestinationPath .
```

## 2. Install and run

```powershell
cd D:\Workspace\repos\spothub-fpv
npm install            # postinstall runs `prisma generate`
copy .env.example .env
```

Then edit `.env`:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — create a **Web application**
  OAuth client at https://console.cloud.google.com/apis/credentials and add
  `http://localhost:3000/api/auth/google/callback` as an authorised redirect
  URI (it must match exactly).
- `ALLOWED_EMAILS=ipykaloi@gmail.com` — **nobody can sign in until you set
  this.** That is deliberate.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — any 32+ character strings.
  `openssl rand -base64 48` if you have it, otherwise anything long.

Then:

```powershell
npm run db:up          # Postgres + MinIO in Docker
npm run db:migrate     # creates the schema (name it e.g. "init")
npm run dev            # API :3000, client :4200
```

Open http://localhost:4200.

## 3. Push to GitHub

I could not do this — I have no credentials for your account. Two commands:

```powershell
gh repo create spothub-fpv --public --source=. --remote=origin --push
```

Or without the `gh` CLI: create an empty `spothub-fpv` repo on github.com
(no README, no .gitignore), then:

```powershell
git remote add origin https://github.com/<your-username>/spothub-fpv.git
git push -u origin main
```

The commit is authored as you (`ipykaloi@gmail.com`). If you'd rather it be
attributed differently, amend before pushing.

## Verifying it works

```powershell
npm run lint           # should be clean
npm run typecheck      # should be clean
npm run build          # both apps
npm run db:studio      # browse the database — stand-in admin UI
```

## One caveat

My sandbox blocks Prisma's engine download host, so I could not run
`prisma generate` or the migration. Everything else is verified — the client
builds, both apps typecheck, lint is clean — but the five files that import
`@prisma/client` could not be typechecked against the generated client.

`npm install` generates it on your machine, at which point `npm run typecheck`
covers them too. If anything there does fail, tell me and I'll fix it.
