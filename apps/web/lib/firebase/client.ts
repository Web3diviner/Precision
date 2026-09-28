"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const config = { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID };
export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.databaseURL);
const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
const appCheckStore = globalThis as typeof globalThis & { __precisionAppCheck?: AppCheck };
let firebaseAppCheck: AppCheck | null = appCheckStore.__precisionAppCheck ?? null;

if (app && appCheckSiteKey && typeof window !== "undefined" && !firebaseAppCheck) {
  firebaseAppCheck = initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  appCheckStore.__precisionAppCheck = firebaseAppCheck;
}

export const firebaseAuth = app ? getAuth(app) : null;
export const firebaseDatabase = app ? getDatabase(app) : null;
export async function appCheckHeader(): Promise<Record<string, string>> {
  if (!firebaseAppCheck) return {};
  const token = await getToken(firebaseAppCheck);
  return { "X-Firebase-AppCheck": token.token };
}
