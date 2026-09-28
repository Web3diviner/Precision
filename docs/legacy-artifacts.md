# Legacy artifact safety

The active Firebase deployment is declared by [`firebase.json`](../firebase.json) and uses:

- [`firebase/database.rules.json`](../firebase/database.rules.json)
- [`firebase/database.indexes.json`](../firebase/database.indexes.json)

The root-level `database.rules.json` and `firebase-rules.template.json` are retained only so old references fail closed. They are not deployable templates. The root `firebase-config.js` is likewise retired; the active web application uses `NEXT_PUBLIC_FIREBASE_*` variables in `apps/web/.env.local` or Vercel.
